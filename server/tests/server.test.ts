import { sosAudience } from "../src/sos.js";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { testDatabase } from "./database.js";
import { createApp } from "../src/app.js";
import { platform } from "../src/db.js";
import { io, Socket } from "socket.io-client";
import { optimize, cutoffLocked, splitFee } from "../src/routing.js";
import { signature } from "../src/crypto.js";
let env: Awaited<ReturnType<typeof testDatabase>>;
let server: ReturnType<typeof createApp>;
let adminToken = "",
  studentToken = "";
const login = async (customId: string, password = "demo123") =>
  request(server.app).post("/api/v1/auth/login").send({ customId, password });
beforeAll(async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Network unavailable for deterministic fallback tests"),
  );
  env = await testDatabase();
  server = createApp(env.db, env.c);
  server.finish();
  await new Promise<void>((resolve) =>
    server.http.listen(0, "127.0.0.1", () => resolve()),
  );
  adminToken = (await login("SCH-01-ADM")).body.token;
  studentToken = (await login("STU-2026-44")).body.token;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await server?.runtime.close();
  await env?.close();
});
describe("real trips, safety, payments and sockets", () => {
  let driverToken = "",
    tripId = "",
    feeId = "";
  it("orders OSRM waypoint indices and retains campus last on success and fallback", async () => {
    const stops = [
      {
        id: "a",
        studentId: "a",
        name: "A",
        stop: "A",
        point: [33.6, 73.05] as [number, number],
        visit: "Waiting",
        boarded: false,
      },
      {
        id: "b",
        studentId: "b",
        name: "B",
        stop: "B",
        point: [33.62, 73.06] as [number, number],
        visit: "Waiting",
        boarded: false,
      },
    ];
    const end: [number, number] = [33.64, 72.99];
    const successful = await optimize(
      [33.59, 73.04],
      stops,
      end,
      async () =>
        new Response(
          JSON.stringify({
            code: "Ok",
            waypoints: [
              { waypoint_index: 0 },
              { waypoint_index: 2 },
              { waypoint_index: 1 },
              { waypoint_index: 3 },
            ],
            trips: [
              {
                geometry: {
                  coordinates: [
                    [73.04, 33.59],
                    [73.06, 33.62],
                    [73.05, 33.6],
                    [72.99, 33.64],
                  ],
                },
              },
            ],
          }),
        ),
    );
    expect(successful.stops.map((x) => x.id)).toEqual(["b", "a"]);
    expect(successful.line.at(-1)).toEqual(end);
    const fallback = await optimize([33.59, 73.04], stops, end, async () => {
      throw Error();
    });
    expect(fallback.source).toBe("fallback");
    expect(fallback.line.at(-1)).toEqual(end);
    expect(cutoffLocked(21600, "06:00")).toBe(true);
    expect(cutoffLocked(21599, "06:00")).toBe(false);
    expect(splitFee(6500, 5)).toEqual({ commission: 325, net: 6175 });
  });
  it("enforces server cutoff and administrator override, then starts the assigned trip", async () => {
    driverToken = (await login("DRV-4821")).body.token;
    let w = await request(server.app)
      .get("/api/v1/workspace")
      .auth(adminToken, { type: "bearer" });
    tripId = w.body.trip.id;
    feeId = w.body.fees.find(
      (x: any) =>
        x.studentId === String((jwt.decode(studentToken) as any).userId),
    ).id;
    const base = {
      cutoff: "00:00",
      tripTime: "06:15",
      campus: [33.6426, 72.993],
      fee: 6500,
      commission: 5,
    };
    expect(
      (
        await request(server.app)
          .put("/api/v1/admin/settings")
          .auth(adminToken, { type: "bearer" })
          .send(base)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(server.app)
          .put("/api/v1/students/me/attendance")
          .auth(studentToken, { type: "bearer" })
          .send({ status: "NOT_GOING" })
      ).status,
    ).toBe(423);
    expect(
      (
        await request(server.app)
          .put("/api/v1/students/me/attendance")
          .auth(studentToken, { type: "bearer" })
          .send({ status: "NOT_GOING", requestOverride: true })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(server.app)
          .post(
            `/api/v1/admin/attendance/${(jwt.decode(studentToken) as any).userId}/override`,
          )
          .auth(adminToken, { type: "bearer" })
          .send({ approve: true })
      ).status,
    ).toBe(200);
    await request(server.app)
      .put("/api/v1/admin/settings")
      .auth(adminToken, { type: "bearer" })
      .send({ ...base, cutoff: "23:59" });
    const start = await request(server.app)
      .post(`/api/v1/trips/${tripId}/start`)
      .auth(driverToken, { type: "bearer" })
      .send({});
    expect(start.status).toBe(200);
    expect(start.body.stops.some((s: any) => s.name === "Ayesha Khan")).toBe(
      false,
    );
    expect(start.body.line.at(-1)).toEqual(base.campus);
    const own = await request(server.app)
      .get(`/api/v1/trips/${tripId}/route`)
      .auth(studentToken, { type: "bearer" });
    expect(own.body.line).toEqual([]);
  });
  it("authenticates sockets and refuses cross-tenant rooms and trips", async () => {
    const address = server.http.address() as { port: number };
    const socket = io(`http://127.0.0.1:${address.port}`, {
      auth: { token: studentToken },
      transports: ["websocket"],
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
    const cityTrip = await env.db.run(
      platform,
      async (q) =>
        (
          await q.query(
            "SELECT t.id FROM trips t JOIN tenants x ON x.id=t.tenant_id WHERE x.contact_email='city@example.test' LIMIT 1",
          )
        ).rows[0].id,
    );
    const denied = await socket.timeout(3000).emitWithAck("joinTrip", cityTrip);
    expect(denied.ok).toBe(false);
    expect(
      (await socket.timeout(3000).emitWithAck("joinTrip", tripId)).ok,
    ).toBe(true);
    expect(
      (
        await request(server.app)
          .get(`/api/v1/trips/${cityTrip}/route`)
          .auth(studentToken, { type: "bearer" })
      ).status,
    ).toBe(404);
    socket.disconnect();
    const invalid = io(`http://127.0.0.1:${address.port}`, {
      auth: { token: "invalid" },
      transports: ["websocket"],
      reconnection: false,
    });
    await new Promise<void>((resolve) =>
      invalid.on("connect_error", () => resolve()),
    );
    invalid.disconnect();
  });
  it("samples GPS, logs speed, sends proximity exactly once and broadcasts only to authorized rooms", async () => {
    const route = await request(server.app)
      .get(`/api/v1/trips/${tripId}/route`)
      .auth(driverToken, { type: "bearer" });
    const next = route.body.stops[0];
    const timestamp = Date.now();
    for (let i = 0; i < 2; i++) {
      const r = await request(server.app)
        .post(`/api/v1/trips/${tripId}/telemetry`)
        .auth(driverToken, { type: "bearer" })
        .send({
          point: next.point,
          speed: 76,
          timestamp: timestamp + i + 1,
          simulated: true,
        });
      expect(r.status).toBe(200);
    }
    const count = await env.db.run(
      platform,
      async (q) =>
        (
          await q.query(
            "SELECT count(*)::int AS n FROM notifications WHERE trip_id=$1 AND kind='PROXIMITY' AND user_id=$2",
            [tripId, next.studentId],
          )
        ).rows[0].n,
    );
    expect(count).toBe(1);
    const events = await env.db.run(
      platform,
      async (q) =>
        (
          await q.query(
            "SELECT event_type,count(*)::int AS n FROM trip_events WHERE trip_id=$1 AND event_type IN('OVER_SPEED','SIMULATED_SAMPLE') GROUP BY event_type",
            [tripId],
          )
        ).rows,
    );
    expect(events.find((x) => x.event_type === "SIMULATED_SAMPLE").n).toBe(1);
    expect(
      events.find((x) => x.event_type === "OVER_SPEED").n,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (
        await request(server.app)
          .post(`/api/v1/trips/${tripId}/telemetry`)
          .auth(studentToken, { type: "bearer" })
          .send({ point: next.point, speed: 20, timestamp: timestamp + 10 })
      ).status,
    ).toBe(403);
  });
  it("records next-stop pickup, campus geofence, SOS and administrator resolution", async () => {
    const r = await request(server.app)
      .get(`/api/v1/trips/${tripId}/route`)
      .auth(driverToken, { type: "bearer" });
    const next = r.body.stops[0];
    for (const status of ["Arrived", "Picked up"])
      expect(
        (
          await request(server.app)
            .post(`/api/v1/trips/${tripId}/stops/${next.id}/status`)
            .auth(driverToken, { type: "bearer" })
            .send({ status })
        ).status,
      ).toBe(200);
    expect(
      (
        await request(server.app)
          .post(`/api/v1/trips/${tripId}/telemetry`)
          .auth(driverToken, { type: "bearer" })
          .send({
            point: [33.6426, 72.993],
            speed: 0,
            timestamp: Date.now() + 100,
            simulated: true,
          })
      ).status,
    ).toBe(200);
    const w = await request(server.app)
      .get("/api/v1/workspace")
      .auth(studentToken, { type: "bearer" });
    expect(w.body.trip.status).toBe("ARRIVED");
    expect(JSON.stringify(w.body)).not.toContain("DEMO-IDENTITY");
    const sos = await request(server.app)
      .post("/api/v1/sos")
      .auth(studentToken, { type: "bearer" })
      .send({ tripId, confirmed: true });
    expect(sos.status).toBe(200);
    expect(
      (
        await request(server.app)
          .patch(`/api/v1/admin/sos/${sos.body.id}`)
          .auth(adminToken, { type: "bearer" })
          .send({ resolved: true })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(server.app)
          .post(`/api/v1/trips/${tripId}/end`)
          .auth(driverToken, { type: "bearer" })
          .send({})
      ).status,
    ).toBe(200);
  });
  it("rejects unsigned webhooks; signed sandbox callback is idempotent and stores commission/net", async () => {
    const session = await request(server.app)
      .post(`/api/v1/fees/${feeId}/pay`)
      .auth(studentToken, { type: "bearer" })
      .send({ gateway: "JazzCash" });
    expect(session.status).toBe(200);
    const body = {
      session: session.body.session,
      status: "PAID",
      gatewayRef: "TEST-SANDBOX-REF",
    };
    expect(
      (await request(server.app).post("/api/v1/webhooks/payment").send(body))
        .status,
    ).toBe(401);
    const raw = JSON.stringify(body);
    const sig = signature(Buffer.from(raw), env.c.WEBHOOK_SECRET);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request(server.app)
            .post("/api/v1/webhooks/payment")
            .set("Content-Type", "application/json")
            .set("x-payment-signature", sig)
            .send(raw)
        ).status,
      ).toBe(200);
    const fee = await env.db.run(
      platform,
      async (q) =>
        (await q.query("SELECT * FROM fee_transactions WHERE id=$1", [feeId]))
          .rows[0],
    );
    expect(fee.status).toBe("PAID");
    expect(Number(fee.net_driver_payout)).toBe(6175);
    expect(fee.receipt_number).toMatch(/^STMS-/);
    expect(
      (
        await request(server.app)
          .get(`/api/v1/fees/${feeId}/receipt`)
          .auth(studentToken, { type: "bearer" })
      ).status,
    ).toBe(200);
  });
});
describe("authentication and tenant isolation", () => {
  it("health checks the database", async () => {
    expect((await request(server.app).get("/api/v1/health")).status).toBe(200);
  });
  it("uses bcrypt hashes and validates JWT claims", async () => {
    const r = await login("DRV-4821");
    expect(r.status).toBe(200);
    expect(jwt.verify(r.body.token, env.c.JWT_SECRET)).toMatchObject({
      role: "DRIVER",
      tenantId: expect.any(String),
    });
    const hash = await env.db.run(
      platform,
      async (q) =>
        (
          await q.query(
            "SELECT password_hash FROM users WHERE custom_id='DRV-4821'",
          )
        ).rows[0].password_hash,
    );
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
  it("blocks unauthenticated, wrong role and expired sessions", async () => {
    expect(
      (await request(server.app).get("/api/v1/admin/students")).status,
    ).toBe(401);
    expect(
      (
        await request(server.app)
          .get("/api/v1/admin/students")
          .auth(studentToken, { type: "bearer" })
      ).status,
    ).toBe(403);
    const expired = jwt.sign(
      { userId: "1", tenantId: "1", role: "ADMIN", version: 0 },
      env.c.JWT_SECRET,
      { expiresIn: -1, issuer: "stms", audience: "stms-web" },
    );
    expect(
      (
        await request(server.app)
          .get("/api/v1/auth/me")
          .auth(expired, { type: "bearer" })
      ).status,
    ).toBe(401);
  });
  it("tenant A never reads tenant B students via REST or SQL RLS", async () => {
    const r = await request(server.app)
      .get("/api/v1/admin/students")
      .auth(adminToken, { type: "bearer" });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(8);
    expect(
      r.body.some((x: { name: string }) => x.name === "City Student"),
    ).toBe(false);
    const who = jwt.decode(adminToken) as { tenantId: string };
    const rows = await env.db.run(
      { tenantId: who.tenantId, role: "ADMIN" },
      async (q) => (await q.query("SELECT tenant_id FROM users")).rows,
    );
    expect(rows.every((x) => x.tenant_id === who.tenantId)).toBe(true);
  });
  it("locks accounts after repeated failures and validates login bodies", async () => {
    for (let i = 0; i < 5; i++)
      expect((await login("PENDING-BILAL", "wrong-password")).status).toBe(401);
    expect((await login("PENDING-BILAL")).status).toBe(429);
    expect(
      (
        await request(server.app)
          .post("/api/v1/auth/login")
          .send({ customId: "a", password: 123 })
      ).status,
    ).toBe(400);
  });
});
describe("management and uploads", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=",
    "base64",
  );
  it("creates students via CSV atomically and rejects foreign assignments", async () => {
    const routes = await request(server.app)
      .get("/api/v1/admin/routes")
      .auth(adminToken, { type: "bearer" });
    const routeId = routes.body[0].id;
    const r = await request(server.app)
      .post("/api/v1/admin/students/import")
      .auth(adminToken, { type: "bearer" })
      .send({
        routeId,
        csv: "name,stop,latitude,longitude\nImported Student,Faizabad,33.659,73.081",
      });
    expect(r.status).toBe(200);
    expect(r.body.students[0].customId).toMatch(/^STU-\d{4}-/);
    const before = (
      await request(server.app)
        .get("/api/v1/admin/students")
        .auth(adminToken, { type: "bearer" })
    ).body.length;
    const bad = await request(server.app)
      .post("/api/v1/admin/students/import")
      .auth(adminToken, { type: "bearer" })
      .send({
        routeId,
        csv: "name,stop,latitude,longitude\nValid,Somewhere,33,73\nBad,Elsewhere,999,73",
      });
    expect(bad.status).toBe(400);
    expect(
      (
        await request(server.app)
          .get("/api/v1/admin/students")
          .auth(adminToken, { type: "bearer" })
      ).body,
    ).toHaveLength(before);
    const city = (await login("SCH-02-ADM")).body.token;
    expect(
      (
        await request(server.app)
          .put(`/api/v1/admin/students/${r.body.students[0].id}`)
          .auth(city, { type: "bearer" })
          .send({ name: "Attempt", routeId, stop: "X", point: [33, 73] })
      ).status,
    ).toBe(404);
  });
  it("uploads encrypted durable documents, restricts access and enforces rejection reasons", async () => {
    const r = await request(server.app)
      .post("/api/v1/drivers/register")
      .auth(adminToken, { type: "bearer" })
      .field("name", "New Driver")
      .field("cnic", "DEMO-CNIC")
      .field("license", "DEMO-UPLOAD")
      .field("expiry", "2028-01-01")
      .field("reg", "DEMO-555")
      .field("password", "demo12345")
      .attach("cnicPhoto", png, "cnic.png")
      .attach("licensePhoto", png, "license.png")
      .attach("vehiclePhoto", png, "vehicle.png");
    expect(r.status).toBe(201);
    const driver = r.body.id;
    const file = await request(server.app)
      .get(`/api/v1/admin/drivers/${driver}/documents/cnic`)
      .auth(adminToken, { type: "bearer" });
    expect(file.status).toBe(200);
    expect(file.body).toEqual(png);
    expect(
      (
        await request(server.app)
          .get(`/api/v1/admin/drivers/${driver}/documents/cnic`)
          .auth(studentToken, { type: "bearer" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(server.app)
          .patch(`/api/v1/admin/drivers/${driver}/verify`)
          .auth(adminToken, { type: "bearer" })
          .send({ approved: false })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(server.app)
          .patch(`/api/v1/admin/drivers/${driver}/verify`)
          .auth(adminToken, { type: "bearer" })
          .send({ approved: false, reason: "Photo unclear" })
      ).status,
    ).toBe(200);
    const saved = await env.db.run(
      platform,
      async (q) =>
        (
          await q.query(
            "SELECT contents FROM document_blobs WHERE driver_id=$1 AND kind='cnic'",
            [driver],
          )
        ).rows[0].contents,
    );
    expect(saved).not.toEqual(png);
  });
  it("rejects oversized images and invalid settings", async () => {
    const r = await request(server.app)
      .post("/api/v1/drivers/register")
      .auth(adminToken, { type: "bearer" })
      .attach("cnicPhoto", Buffer.alloc(2 * 1024 * 1024 + 1), "large.png");
    expect(r.status).toBe(413);
    expect(
      (
        await request(server.app)
          .put("/api/v1/admin/settings")
          .auth(adminToken, { type: "bearer" })
          .send({
            cutoff: "25:00",
            tripTime: "06:15",
            campus: [33, 73],
            fee: 6500,
            commission: 200,
          })
      ).status,
    ).toBe(400);
  });
});
describe("account maintenance and durable demo data", () => {
  it("onboards a tenant with a usable non-guessable administrator login", async () => {
    const superToken = (await login("SUP-01")).body.token;
    const r = await request(server.app)
      .post("/api/v1/tenants")
      .auth(superToken, { type: "bearer" })
      .send({
        name: "New Test Institution",
        email: "new-tenant@example.test",
        type: "SCHOOL",
        plan: "Institute",
        adminName: "Institution Admin",
        adminPassword: "test-admin-password",
      });
    expect(r.status).toBe(200);
    expect(r.body.adminCustomId).toMatch(/^SCH-[A-F\d]{8}-ADM$/);
    const account = await login(r.body.adminCustomId, "test-admin-password");
    expect(account.status).toBe(200);
    const workspace = await request(server.app)
      .get("/api/v1/workspace")
      .auth(account.body.token, { type: "bearer" });
    expect(workspace.status).toBe(200);
    expect(workspace.body.students).toHaveLength(0);
    expect(workspace.body.tenants[0].name).toBe("New Test Institution");
  });
  it("admin password reset revokes the previous user token", async () => {
    const listed = (
      await request(server.app)
        .get("/api/v1/admin/students")
        .auth(adminToken, { type: "bearer" })
    ).body;
    const student = listed.find((x: any) => x.name === "Imported Student");
    const before = await env.db.run(
      platform,
      async (q) =>
        (
          await q.query("SELECT token_version FROM users WHERE id=$1", [
            student.id,
          ])
        ).rows[0].token_version,
    );
    const old = jwt.sign(
      {
        userId: student.id,
        tenantId: (jwt.decode(adminToken) as any).tenantId,
        role: "STUDENT",
        version: before,
      },
      env.c.JWT_SECRET,
      { expiresIn: "1h", issuer: "stms", audience: "stms-web" },
    );
    expect(
      (
        await request(server.app)
          .post(`/api/v1/admin/users/${student.id}/password`)
          .auth(adminToken, { type: "bearer" })
          .send({ password: "changed-demo-password" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(server.app)
          .get("/api/v1/auth/me")
          .auth(old, { type: "bearer" })
      ).status,
    ).toBe(401);
    expect(
      (await login(student.custom_id, "changed-demo-password")).status,
    ).toBe(200);
  });
  it("generates fees and license reminders idempotently, and reset preserves the other tenant", async () => {
    const r1 = await request(server.app)
      .post("/api/v1/admin/fees/generate")
      .auth(adminToken, { type: "bearer" })
      .send({});
    expect(r1.status).toBe(200);
    const r2 = await request(server.app)
      .post("/api/v1/admin/fees/generate")
      .auth(adminToken, { type: "bearer" })
      .send({});
    expect(r2.body.created).toBe(0);
    const reminders = await env.db.run(
      platform,
      async (q) =>
        (
          await q.query(
            "SELECT dedupe_key,count(*)::int AS n FROM notifications WHERE kind='LICENSE_EXPIRY' GROUP BY dedupe_key",
          )
        ).rows,
    );
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((x) => x.n === 1)).toBe(true);
    const cityBefore = await env.db.run(
      platform,
      async (q) =>
        (
          await q.query(
            "SELECT count(*)::int AS n FROM users WHERE tenant_id=(SELECT id FROM tenants WHERE contact_email='city@example.test')",
          )
        ).rows[0].n,
    );
    expect(
      (
        await request(server.app)
          .post("/api/v1/admin/demo/reset")
          .auth(adminToken, { type: "bearer" })
          .send({ confirm: "RESET DEMO DATA" })
      ).status,
    ).toBe(200);
    const cityAfter = await env.db.run(
      platform,
      async (q) =>
        (
          await q.query(
            "SELECT count(*)::int AS n FROM users WHERE tenant_id=(SELECT id FROM tenants WHERE contact_email='city@example.test')",
          )
        ).rows[0].n,
    );
    expect(cityAfter).toBe(cityBefore);
    expect(
      (
        await request(server.app)
          .get("/api/v1/admin/students")
          .auth(adminToken, { type: "bearer" })
      ).body,
    ).toHaveLength(8);
  });
});

describe("SOS recipient policy", () => {
 it("seeds parent logins and restricts student alerts to the linked family and admin", async () => {
  const parent = await login("PAR-2026-44");
  expect(parent.status).toBe(200);
  expect(parent.body.user.role).toBe("PARENT");
  await env.db.run(platform, async q => {
   const u=(await q.query("SELECT * FROM users WHERE custom_id='STU-2026-44'")).rows[0];
   const audience=await sosAudience(q,{tenantId:u.tenant_id,userId:u.id,role:'STUDENT',version:0},u.id,null,env.c);
   const ids=(await q.query("SELECT custom_id FROM users WHERE id=ANY($1::bigint[])",[audience.map(x=>x.id)])).rows.map(x=>x.custom_id);
   expect(ids.sort()).toEqual(['PAR-2026-44','SCH-01-ADM','STU-2026-44'].sort());
  });
 });
});
