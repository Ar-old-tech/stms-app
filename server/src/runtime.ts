import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { z } from "zod";
import type { Database, Identity, Db } from "./db.js";
import type { Api, Context } from "./http.js";
import { id, point } from "./http.js";
import { authenticate } from "./auth.js";
import type { Config } from "./config.js";
import { HttpError, requireValue } from "./errors.js";
import {
  distance,
  etaMinutes,
  optimize,
  depot,
  tenantClock,
} from "./routing.js";
import type { Point, Stop } from "./routing.js";
export const telemetrySchema = z
  .object({
    point,
    speed: z.number().min(0).max(250).nullable().default(null),
    timestamp: z.number().int().positive(),
    simulated: z.boolean().default(false),
  })
  .strict();
type Live = {
  point: Point;
  speed: number;
  timestamp: number;
  simulated: boolean;
  lastSample: number;
  lastSpeed: number;
  eta: number | null;
  etaAt: number;
  etaStudent: string | null;
};
export async function tripAccess(q: Db, user: Identity, tripId: string) {
  const trip = requireValue(
    (
      await q.query(
        "SELECT t.*,r.direction FROM trips t JOIN routes r ON r.id=t.route_id AND r.tenant_id=t.tenant_id WHERE t.tenant_id=$1 AND t.id=$2",
        [user.tenantId, tripId],
      )
    ).rows[0],
  );
  if (user.role === "ADMIN") return trip;
  if (user.role === "DRIVER" && trip.driver_id === user.userId) return trip;
  if (
    user.role === "STUDENT" &&
    (
      await q.query(
        "SELECT id FROM student_stops WHERE tenant_id=$1 AND student_id=$2 AND route_id=$3",
        [user.tenantId, user.userId, trip.route_id],
      )
    ).rowCount
  )
    return trip;
  if (user.role === 'PARENT' && (await q.query('SELECT 1 FROM parent_students p JOIN student_stops s ON s.tenant_id=p.tenant_id AND s.student_id=p.student_id WHERE p.tenant_id=$1 AND p.parent_id=$2 AND s.route_id=$3', [user.tenantId,user.userId,trip.route_id])).rowCount) return trip;
  throw new HttpError(403, "This trip is not assigned to you");
}
export class Runtime {
  readonly live = new Map<string, Live>();
  readonly routes = new Map<
    string,
    { stops: Stop[]; line: Point[]; source: string }
  >();
  readonly locks = new Map<string, Promise<unknown>>();
  readonly io: Server;
  constructor(
    readonly db: Database,
    readonly c: Config,
    readonly api: Api,
    http: HttpServer,
  ) {
    this.io = new Server(http, {
      maxHttpBufferSize: 16384,
      serveClient: false,
    });
    const io = this.io;
    io.use(async (socket, next) => {
      try {
        const b = z
          .object({ token: z.string().min(1) })
          .parse(socket.handshake.auth);
        socket.data.user = await authenticate(b.token, c, db);
        socket.data.token = b.token;
        next();
      } catch {
        next(new Error("Unauthorized"));
      }
    });
    io.on("connection", (socket) => {
      const user = socket.data.user as Identity;
      void socket.join(`user:${user.userId}`);
      if (user.role === "ADMIN") void socket.join(`tenant:${user.tenantId}`);
      const decoded = JSON.parse(
        Buffer.from(socket.data.token.split(".")[1], "base64url").toString(),
      );
      const expiry = setTimeout(
        () => socket.disconnect(true),
        Math.max(1, decoded.exp * 1000 - Date.now()),
      );
      expiry.unref();
      socket.on("disconnect", () => clearTimeout(expiry));
      socket.use(async (_packet, next) => {
        try {
          await authenticate(socket.data.token, c, db);
          next();
        } catch {
          socket.disconnect(true);
        }
      });
      socket.on("joinTrip", async (raw, ack: unknown) => {
        const reply = typeof ack === "function" ? ack : () => {};
        try {
          const tripId = id.parse(raw);
          if (!["DRIVER", "STUDENT", "PARENT"].includes(user.role))
            throw new HttpError(403, "Administrators use their tenant room");
          await db.run(user, (q) => tripAccess(q, user, tripId));
          for (const room of socket.rooms)
            if (room.startsWith("trip:")) await socket.leave(room);
          await socket.join(`trip:${tripId}`);
          reply({ ok: true });
        } catch {
          reply({ ok: false, error: "Trip access denied" });
        }
      });
      socket.on("telemetry", async (raw, ack: unknown) => {
        const reply = typeof ack === "function" ? ack : () => {};
        try {
          const b = z
            .object({ tripId: id, data: telemetrySchema })
            .strict()
            .parse(raw);
          await this.telemetry(user, b.tripId, b.data);
          reply({ ok: true });
        } catch {
          reply({ ok: false, error: "Telemetry rejected" });
        }
      });
    });
    api.events.on("message", ({ room, event, data }) =>
      io.to(room).emit(event, data),
    );
    api.events.on("revoke", (userId: string) =>
      io.in(`user:${userId}`).disconnectSockets(true),
    );
    api.events.on("routing", (tenant: string) => this.invalidate(tenant));
    api.events.on("changed", (tenant: string | null) => {
      if (tenant) void this.changed(tenant).catch(() => {});
    });
  }
  async changed(tenant: string) {
    for (const socket of this.io.sockets.sockets.values()) {
      const user = socket.data.user as Identity;
      if (user.tenantId !== tenant) continue;
      for (const room of [...socket.rooms])
        if (room.startsWith("trip:")) {
          try {
            await this.db.run(user, (q) => tripAccess(q, user, room.slice(5)));
          } catch {
            await socket.leave(room);
          }
        }
    }
    this.io.to(`tenant:${tenant}`).emit("changed");
    const trips = await this.db.run(
      { tenantId: tenant, role: "ADMIN" },
      async (q) =>
        (await q.query("SELECT id FROM trips WHERE tenant_id=$1", [tenant]))
          .rows,
    );
    for (const t of trips) this.io.to(`trip:${t.id}`).emit("changed");
  }
  async ordered(q: Db, tenant: string, trip: any, recompute = false) {
    const key = `${tenant}:${trip.route_id}:${String(trip.trip_date).slice(0, 10)}`;
    const rows = (
      await q.query(
        "SELECT u.id,u.name,s.stop_name,s.latitude,s.longitude,COALESCE(a.visit_status,'Waiting') AS visit,COALESCE(a.boarded,false) AS boarded FROM student_stops s JOIN users u ON u.id=s.student_id AND u.tenant_id=s.tenant_id LEFT JOIN daily_attendance a ON a.student_id=s.student_id AND a.tenant_id=s.tenant_id AND a.trip_date=$3 WHERE s.tenant_id=$1 AND s.route_id=$2 AND COALESCE(a.status,'GOING')='GOING' AND u.active=true ORDER BY s.id",
        [tenant, trip.route_id, trip.trip_date],
      )
    ).rows;
    const stops: Stop[] = rows.map((x) => ({
      id: x.id,
      studentId: x.id,
      name: x.name,
      stop: x.stop_name,
      point: [x.latitude, x.longitude],
      visit: x.visit,
      boarded: x.boarded,
    }));
    let cached = this.routes.get(key);
    if (!cached || recompute) {
      const t = requireValue(
        (
          await q.query(
            "SELECT destination_lat,destination_lng FROM tenants WHERE id=$1",
            [tenant],
          )
        ).rows[0],
      );
      cached = await optimize(
        trip.direction === "FROM_CAMPUS"
          ? [t.destination_lat, t.destination_lng]
          : depot,
        stops,
        trip.direction === "FROM_CAMPUS"
          ? depot
          : [t.destination_lat, t.destination_lng],
      );
      this.routes.set(key, cached);
    }
    const byId = new Map(stops.map((s) => [s.id, s]));
    return {
      ...cached,
      stops: cached.stops
        .map((s) => byId.get(s.id))
        .filter(
          (s): s is Stop => !!s && !["Picked up", "No-show"].includes(s.visit),
        ),
    };
  }
  invalidate(tenant: string) {
    for (const key of this.routes.keys())
      if (key.startsWith(`${tenant}:`)) this.routes.delete(key);
  }
  async telemetry(
    user: Identity,
    tripId: string,
    body: z.infer<typeof telemetrySchema>,
  ) {
    if (user.role !== "DRIVER")
      throw new HttpError(403, "Driver role required");
    if (body.simulated && this.c.DEMO_ENABLED !== "true")
      throw new HttpError(403, "Simulated GPS is disabled");
    if (
      body.timestamp > Date.now() + 60000 ||
      body.timestamp < Date.now() - 24 * 3600000
    )
      throw new HttpError(400, "GPS timestamp is outside the accepted window");
    const previous = this.locks.get(tripId) ?? Promise.resolve();
    const work = previous
      .catch(() => {})
      .then(() => this.processPoint(user, tripId, body));
    this.locks.set(tripId, work);
    try {
      await work;
    } finally {
      if (this.locks.get(tripId) === work) this.locks.delete(tripId);
    }
  }
  private async processPoint(
    user: Identity,
    tripId: string,
    b: z.infer<typeof telemetrySchema>,
  ) {
    let pending: Live | undefined;
    let location: any;
    const messages: { user: string; row: any }[] = [];
    await this.db.run(user, async (q) => {
      const trip = await tripAccess(q, user, tripId);
      if (trip.status !== "IN_PROGRESS")
        throw new HttpError(409, "Trip is not active");
      const key = `${user.tenantId}:${tripId}`,
        last = this.live.get(key);
      if (last && b.timestamp <= last.timestamp) return;
      const t = requireValue(
        (await q.query("SELECT * FROM tenants WHERE id=$1", [user.tenantId]))
          .rows[0],
      );
      const speed =
        b.speed ??
        (last
          ? Math.min(
              250,
              (distance(last.point, b.point) /
                Math.max(1, (b.timestamp - last.timestamp) / 1000)) *
                3.6,
            )
          : 0);
      const live: Live = {
        point: b.point,
        speed,
        timestamp: b.timestamp,
        simulated: b.simulated,
        lastSample: last?.lastSample ?? 0,
        lastSpeed: last?.lastSpeed ?? 0,
        eta: last?.eta ?? null,
        etaAt: last?.etaAt ?? 0,
        etaStudent: last?.etaStudent ?? null,
      };
      const event = async (type: string) =>
        q.query(
          "INSERT INTO trip_events(tenant_id,trip_id,event_type,latitude,longitude,speed_kmh,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            user.tenantId,
            tripId,
            type,
            ...b.point,
            speed,
            new Date(b.timestamp),
          ],
        );
      if (!last || b.timestamp - last.lastSample >= 60000) {
        await event(b.simulated ? "SIMULATED_SAMPLE" : "GPS_SAMPLE");
        live.lastSample = b.timestamp;
      }
      if (speed > 60 && (!last || b.timestamp - last.lastSpeed >= 30000)) {
        await event("OVER_SPEED");
        live.lastSpeed = b.timestamp;
        await notify(
          q,
          user.tenantId!,
          { role: "ADMIN" },
          tripId,
          "OVER_SPEED",
          `Over-speed warning · ${Math.round(speed)} km/h`,
          undefined,
          undefined,
          messages,
        );
      }
      const ordered = await this.ordered(q, user.tenantId!, trip);
      const next = ordered.stops[0];
      if (next) {
        if (live.etaStudent !== next.id || Date.now() - live.etaAt >= 30000) {
          live.eta = await etaMinutes(b.point, next.point);
          live.etaAt = Date.now();
          live.etaStudent = next.id;
        }
        if (
          (live.eta ?? Infinity) <= 5 ||
          distance(b.point, next.point) <= 1000
        )
          await notify(
            q,
            user.tenantId!,
            { id: next.id },
            tripId,
            "PROXIMITY",
            `${next.name}: van is ${Math.max(1, Math.ceil(live.eta ?? distance(b.point, next.point) / 600))} minutes away`,
            undefined,
            `proximity:${tripId}:${next.id}`,
            messages,
          );
      } else {
        live.eta = null;
        live.etaStudent = null;
      }
      const destination: Point =
        trip.direction === "FROM_CAMPUS"
          ? depot
          : [t.destination_lat, t.destination_lng];
      if (distance(b.point, destination) <= 150) {
        await q.query(
          "UPDATE trips SET status='ARRIVED' WHERE tenant_id=$1 AND id=$2",
          [user.tenantId, tripId],
        );
        await event("CAMPUS_ARRIVED");
        await notify(
          q,
          user.tenantId!,
          { trip: trip.route_id },
          tripId,
          "ARRIVAL",
          "Safely arrived at the destination",
          undefined,
          `arrival:${tripId}`,
          messages,
        );
      }
      pending = live;
      location = {
        tripId,
        tenantId: user.tenantId,
        ...live,
        status:
          distance(b.point, destination) <= 150 ? "ARRIVED" : "IN_PROGRESS",
      };
    });
    if (!pending) return;
    this.live.set(`${user.tenantId}:${tripId}`, pending);
    await this.changed(user.tenantId!);
    const publicLocation = {
      tripId,
      tenantId: user.tenantId,
      point: pending.point,
      speed: pending.speed,
      timestamp: pending.timestamp,
      simulated: pending.simulated,
      status: location.status,
    };
    this.io
      .to(`trip:${tripId}`)
      .to(`tenant:${user.tenantId}`)
      .emit("location", publicLocation);
    for (const m of messages)
      this.io.to(`user:${m.user}`).emit("notification", m.row);
  }
  async close() {
    await new Promise<void>((resolve) => this.io.close(() => resolve()));
  }
}
export async function notify(
  q: Db,
  tenant: string,
  to: { id?: string; role?: string; trip?: string },
  tripId: string | null,
  kind: string,
  message: string,
  link?: string,
  dedupe?: string,
  messages?: { user: string; row: any }[],
) {
  const users = to.id
    ? [{ id: to.id }]
    : to.role
      ? (
          await q.query(
            "SELECT id FROM users WHERE tenant_id=$1 AND role=$2 AND active=true",
            [tenant, to.role],
          )
        ).rows
      : (
          await q.query(
            "SELECT u.id FROM users u LEFT JOIN student_stops s ON s.tenant_id=u.tenant_id AND s.student_id=u.id WHERE u.tenant_id=$1 AND (u.role='ADMIN' OR (u.role='STUDENT' AND s.route_id=$2)) AND u.active=true",
            [tenant, to.trip],
          )
        ).rows;
  for (const u of users) {
    const row = (
      await q.query(
        "INSERT INTO notifications(tenant_id,user_id,trip_id,kind,message,location_link,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,user_id,dedupe_key) DO NOTHING RETURNING *",
        [tenant, u.id, tripId, kind, message, link ?? null, dedupe ?? null],
      )
    ).rows[0];
    if (row) messages?.push({ user: u.id, row });
  }
}
