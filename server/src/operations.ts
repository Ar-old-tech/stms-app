import { z } from "zod";
import type { Api, Context } from "./http.js";
import { empty, id, point } from "./http.js";
import type { Runtime } from "./runtime.js";
import { notify, tripAccess, telemetrySchema } from "./runtime.js";
import { cutoffLocked, splitFee } from "./routing.js";
import { HttpError, requireValue } from "./errors.js";
import type { Db, Identity } from "./db.js";
import { platform } from "./db.js";
import type { Config } from "./config.js";
import { identifier, validSignature, signature } from "./crypto.js";
import { seedTenant } from "./seed.js";
import { tokenFor } from "./auth.js";
import { ensureDailyTrips } from "./trips.js";
export async function ensureDay(q: Db, tenant: string) {
  const { t, clock } = await ensureDailyTrips(q, tenant);
  await q.query(
    "INSERT INTO notifications(tenant_id,user_id,kind,message,dedupe_key) SELECT v.tenant_id,a.id,'LICENSE_EXPIRY',u.name||': license expires '||v.license_expiry::text,'license:'||v.driver_id::text||':'||v.license_expiry::text FROM driver_verifications v JOIN users u ON u.tenant_id=v.tenant_id AND u.id=v.driver_id JOIN users a ON a.tenant_id=v.tenant_id AND a.role='ADMIN' WHERE v.tenant_id=$1 AND v.license_expiry BETWEEN current_date AND current_date+30 ON CONFLICT(tenant_id,user_id,dedupe_key) DO NOTHING",
    [tenant],
  );
  await q.query(
    "INSERT INTO daily_attendance(tenant_id,student_id,trip_date) SELECT u.tenant_id,u.id,$2 FROM users u JOIN student_stops s ON s.tenant_id=u.tenant_id AND s.student_id=u.id WHERE u.tenant_id=$1 AND u.role='STUDENT' AND u.active=true ON CONFLICT(tenant_id,student_id,trip_date) DO NOTHING",
    [tenant, clock.date],
  );
  return { t, clock };
}
export async function generateFees(q: Db, tenant: string, month?: string) {
  const { t, clock } = await ensureDay(q, tenant);
  const period = month ?? `${clock.date.slice(0, 7)}-01`;
  const result = await q.query(
    "INSERT INTO fee_transactions(tenant_id,student_id,period_month,monthly_fee,platform_commission_pct) SELECT tenant_id,id,$2,$3,$4 FROM users WHERE tenant_id=$1 AND role='STUDENT' AND active=true ON CONFLICT(tenant_id,student_id,period_month) DO NOTHING RETURNING id",
    [tenant, period, t.monthly_fee, t.platform_commission_pct],
  );
  return { created: result.rowCount };
}
async function tell(
  ctx: Context,
  to: Parameters<typeof notify>[2],
  tripId: string | null,
  kind: string,
  message: string,
  link?: string,
  key?: string,
) {
  const out: { user: string; row: any }[] = [];
  await notify(
    ctx.q,
    ctx.user.tenantId!,
    to,
    tripId,
    kind,
    message,
    link,
    key,
    out,
  );
  for (const x of out) ctx.send(`user:${x.user}`, "notification", x.row);
}
export function operations(api: Api, rt: Runtime, c: Config) {
  api.route(
    "put",
    "/students/me/stop",
    ["STUDENT"],
    z.object({ stop: z.string().min(1).max(255), point }).strict(),
    async (ctx, b) => {
      const { q, user } = ctx;
      const s = requireValue(
        (
          await q.query(
            "UPDATE student_stops SET stop_name=$1,latitude=$2,longitude=$3 WHERE tenant_id=$4 AND student_id=$5 RETURNING route_id",
            [b.stop, ...b.point, user.tenantId, user.userId],
          )
        ).rows[0],
      );
      rt.invalidate(user.tenantId!);
      const { clock } = await ensureDay(q, user.tenantId!);
      const trip = (
        await q.query(
          "SELECT id,driver_id FROM trips WHERE tenant_id=$1 AND route_id=$2 AND trip_date=$3",
          [user.tenantId, s.route_id, clock.date],
        )
      ).rows[0];
      if (trip)
        await tell(
          ctx,
          { id: trip.driver_id },
          trip.id,
          "ROUTE_CHANGED",
          "Pickup location changed · route updated",
        );
      return { ok: true };
    },
  );
  const attendance = z
    .object({
      status: z.enum(["GOING", "NOT_GOING"]),
      requestOverride: z.boolean().default(false),
    })
    .strict();
  api.route(
    "put",
    "/students/me/attendance",
    ["STUDENT"],
    attendance,
    async (ctx, b) => {
      const { q, user } = ctx;
      const { t, clock } = await ensureDay(q, user.tenantId!);
      if (cutoffLocked(clock.seconds, t.attendance_cutoff_time)) {
        if (!b.requestOverride)
          throw new HttpError(
            423,
            `Attendance is locked after ${t.attendance_cutoff_time.slice(0, 5)} ${t.timezone}. Request an administrator override.`,
          );
        await q.query(
          "UPDATE daily_attendance SET override_requested=true,requested_status=$1 WHERE tenant_id=$2 AND student_id=$3 AND trip_date=$4",
          [b.status, user.tenantId, user.userId, clock.date],
        );
        await tell(
          ctx,
          { role: "ADMIN" },
          null,
          "OVERRIDE_REQUEST",
          "A student requested an attendance override",
        );
        return { requested: true };
      }
      await setAttendance(ctx, rt, user.userId, b.status, clock.date);
      return { status: b.status };
    },
  );
  api.route(
    "post",
    "/admin/attendance/:id/override",
    ["ADMIN"],
    z.object({ approve: z.boolean() }).strict(),
    async (ctx, b) => {
      const { q, user, params } = ctx;
      const { clock } = await ensureDay(q, user.tenantId!);
      const a = requireValue(
        (
          await q.query(
            "SELECT requested_status,override_requested FROM daily_attendance WHERE tenant_id=$1 AND student_id=$2 AND trip_date=$3 FOR UPDATE",
            [user.tenantId, params.id, clock.date],
          )
        ).rows[0],
      );
      if (!a.override_requested) throw new HttpError(409, "No pending request");
      if (b.approve)
        await setAttendance(ctx, rt, params.id, a.requested_status, clock.date);
      await q.query(
        "UPDATE daily_attendance SET override_requested=false,requested_status=NULL WHERE tenant_id=$1 AND student_id=$2 AND trip_date=$3",
        [user.tenantId, params.id, clock.date],
      );
      await tell(
        ctx,
        { id: params.id },
        null,
        "OVERRIDE_RESULT",
        b.approve
          ? "Administrator approved your attendance change"
          : "Administrator declined your attendance change",
      );
      return { ok: true };
    },
  );
  api.route("post", "/trips/:id/start", ["DRIVER"], empty, async (ctx) => {
    const { q, user, params } = ctx;
    await ensureDay(q, user.tenantId!);
    const trip = await tripAccess(q, user, params.id);
    if (trip.status !== "IDLE")
      throw new HttpError(409, "Trip has already started");
    if (
      !(
        await q.query(
          "SELECT driver_id FROM driver_verifications WHERE tenant_id=$1 AND driver_id=$2 AND status='VERIFIED' AND license_expiry>=current_date",
          [user.tenantId, user.userId],
        )
      ).rowCount
    )
      throw new HttpError(403, "A current verified license is required");
    await q.query(
      "UPDATE trips SET status='IN_PROGRESS',started_at=now() WHERE tenant_id=$1 AND id=$2",
      [user.tenantId, params.id],
    );
    await q.query(
      "INSERT INTO trip_events(tenant_id,trip_id,event_type) VALUES($1,$2,'TRIP_STARTED')",
      [user.tenantId, params.id],
    );
    const ordered = await rt.ordered(q, user.tenantId!, trip, true);
    ctx.send(`user:${user.userId}`, "route", ordered);
    return ordered;
  });
  api.route(
    "post",
    "/trips/:id/end",
    ["DRIVER"],
    empty,
    async ({ q, user, params }) => {
      const trip = await tripAccess(q, user, params.id);
      if (trip.status !== "ARRIVED")
        throw new HttpError(
          409,
          "Reach the destination geofence before completing the trip",
        );
      await q.query(
        "UPDATE trips SET status='COMPLETED',ended_at=now() WHERE tenant_id=$1 AND id=$2",
        [user.tenantId, params.id],
      );
      await q.query(
        "INSERT INTO trip_events(tenant_id,trip_id,event_type) VALUES($1,$2,'DROPPED_AT_INSTITUTION')",
        [user.tenantId, params.id],
      );
      return { status: "COMPLETED" };
    },
  );
  api.route(
    "post",
    "/trips/:id/stops/:studentId/status",
    ["DRIVER"],
    z.object({ status: z.enum(["Arrived", "Picked up", "No-show"]) }).strict(),
    async ({ q, user, params }, b) => {
      const trip = await tripAccess(q, user, params.id);
      if (trip.status !== "IN_PROGRESS")
        throw new HttpError(409, "Trip is not active");
      const next = (await rt.ordered(q, user.tenantId!, trip)).stops[0];
      if (!next || next.id !== params.studentId)
        throw new HttpError(409, "Record the next Going stop in route order");
      await q.query(
        "UPDATE daily_attendance SET visit_status=$1,boarded=$2 WHERE tenant_id=$3 AND student_id=$4 AND trip_date=$5",
        [
          b.status,
          b.status === "Picked up",
          user.tenantId,
          params.studentId,
          trip.trip_date,
        ],
      );
      await q.query(
        "INSERT INTO trip_events(tenant_id,trip_id,student_id,event_type) VALUES($1,$2,$3,$4)",
        [
          user.tenantId,
          params.id,
          params.studentId,
          b.status === "Picked up"
            ? "PICKED_UP"
            : b.status === "No-show"
              ? "NO_SHOW"
              : "STOP_ARRIVED",
        ],
      );
      return { ok: true };
    },
  );
  api.route(
    "get",
    "/trips/:id/route",
    ["ADMIN", "DRIVER", "STUDENT"],
    empty,
    async ({ q, user, params }) => {
      const trip = await tripAccess(q, user, params.id);
      if (user.role === "STUDENT")
        return {
          stops: [],
          line: [],
          source: "private",
          eta:
            rt.live.get(`${user.tenantId}:${trip.id}`)?.etaStudent ===
            user.userId
              ? rt.live.get(`${user.tenantId}:${trip.id}`)?.eta
              : null,
        };
      if (
        user.role === "DRIVER" &&
        !["IN_PROGRESS", "ARRIVED"].includes(trip.status)
      )
        return {
          stops: [],
          line: [],
          source: "Start the trip to see student locations",
        };
      return rt.ordered(q, user.tenantId!, trip);
    },
  );
  // Same authenticated telemetry service is used by HTTP, sockets, phones and demo bot.
  api.app.post("/api/v1/trips/:id/telemetry", async (req, res) => {
    await rt.telemetry(
      req.user,
      id.parse(req.params.id),
      telemetrySchema.parse(req.body),
    );
    res.json({ ok: true });
  });
  api.route(
    "get",
    "/fees/me",
    ["STUDENT"],
    empty,
    async ({ q, user }) =>
      (
        await q.query(
          "SELECT * FROM fee_transactions WHERE tenant_id=$1 AND student_id=$2 ORDER BY period_month DESC",
          [user.tenantId, user.userId],
        )
      ).rows,
  );
  api.route(
    "get",
    "/admin/fees",
    ["ADMIN"],
    empty,
    async ({ q, user }) =>
      (
        await q.query(
          "SELECT * FROM fee_transactions WHERE tenant_id=$1 ORDER BY period_month DESC,id",
          [user.tenantId],
        )
      ).rows,
  );
  api.route(
    "post",
    "/admin/fees/generate",
    ["ADMIN"],
    z
      .object({
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/)
          .optional(),
      })
      .strict(),
    async ({ q, user }, b) => generateFees(q, user.tenantId!, b.month),
  );
  api.route(
    "post",
    "/fees/:id/pay",
    ["STUDENT"],
    z.object({ gateway: z.enum(["JazzCash", "Easypaisa"]) }).strict(),
    async ({ q, user, params }, b) => {
      const f = requireValue(
        (
          await q.query(
            "SELECT id,status FROM fee_transactions WHERE tenant_id=$1 AND id=$2 AND student_id=$3 FOR UPDATE",
            [user.tenantId, params.id, user.userId],
          )
        ).rows[0],
      );
      if (f.status === "PAID") throw new HttpError(409, "Fee is already paid");
      const session = identifier("SANDBOX");
      await q.query(
        "UPDATE fee_transactions SET payment_session=$1,payment_session_expires=now()+interval '15 minutes' WHERE tenant_id=$2 AND id=$3",
        [session, user.tenantId, params.id],
      );
      return {
        session,
        gateway: b.gateway,
        label: "SANDBOX — no real money is transferred",
      };
    },
  );
  api.route(
    "post",
    "/fees/:id/sandbox-complete",
    ["STUDENT"],
    z
      .object({ session: z.string().min(1).max(100), success: z.boolean() })
      .strict(),
    async ({ q, user, params }, b) => {
      const f = requireValue(
        (
          await q.query(
            "SELECT payment_session FROM fee_transactions WHERE tenant_id=$1 AND id=$2 AND student_id=$3 AND payment_session=$4 AND payment_session_expires>now()",
            [user.tenantId, params.id, user.userId, b.session],
          )
        ).rows[0],
      );
      const body = Buffer.from(
        JSON.stringify({
          session: f.payment_session,
          status: b.success ? "PAID" : "FAILED",
          gatewayRef: identifier("SBX"),
        }),
      );
      return {
        webhookBody: body.toString(),
        signature: signature(body, c.WEBHOOK_SECRET),
        webhook: "/api/v1/webhooks/payment",
        label: "SANDBOX signed callback",
      };
    },
  );
  api.route("post", "/admin/fees/:id/paid", ["ADMIN"], empty, async (ctx) => {
    const f = requireValue(
      (
        await ctx.q.query(
          "SELECT * FROM fee_transactions WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [ctx.user.tenantId, ctx.params.id],
        )
      ).rows[0],
    );
    return settle(
      ctx.q,
      ctx.user.tenantId!,
      f,
      "PAID",
      identifier("CASH"),
      ctx,
    );
  });
  api.route(
    "get",
    "/fees/:id/receipt",
    ["STUDENT", "ADMIN"],
    empty,
    async ({ q, user, params }) => {
      const f = requireValue(
        (
          await q.query(
            "SELECT f.*,u.name FROM fee_transactions f JOIN users u ON u.tenant_id=f.tenant_id AND u.id=f.student_id WHERE f.tenant_id=$1 AND f.id=$2 AND ($3::boolean OR f.student_id=$4)",
            [user.tenantId, params.id, user.role === "ADMIN", user.userId],
          )
        ).rows[0],
      );
      if (f.status !== "PAID")
        throw new HttpError(409, "Payment has not succeeded");
      return {
        receiptNumber: f.receipt_number,
        name: f.name,
        amount: f.monthly_fee,
        month: f.period_month,
        paidAt: f.paid_at,
        gatewayRef: f.gateway_ref,
      };
    },
  );
  api.route(
    "post",
    "/admin/demo/reset",
    ["ADMIN"],
    z.object({ confirm: z.literal("RESET DEMO DATA") }).strict(),
    async (ctx) => {
      if (c.DEMO_ENABLED !== "true")
        throw new HttpError(403, "Demo helpers disabled");
      const { q, user } = ctx;
      const t = (
        await q.query(
          "SELECT contact_email FROM tenants WHERE id=$1 FOR NO KEY UPDATE",
          [user.tenantId],
        )
      ).rows[0];
      if (t?.contact_email !== "sunrise@example.test")
        throw new HttpError(
          403,
          "Reset is restricted to the seeded Sunrise demo tenant",
        );
      await q.query(
        "UPDATE driver_verifications SET reviewed_by=NULL WHERE tenant_id=$1",
        [user.tenantId],
      );
      // Standalone student/parent alerts have no trip to cascade through.
      await q.query("DELETE FROM sos_events WHERE tenant_id=$1", [
        user.tenantId,
      ]);
      await q.query("DELETE FROM routes WHERE tenant_id=$1", [user.tenantId]);
      await q.query("DELETE FROM notifications WHERE tenant_id=$1", [
        user.tenantId,
      ]);
      await q.query("DELETE FROM vehicles WHERE tenant_id=$1", [user.tenantId]);
      await q.query("DELETE FROM users WHERE tenant_id=$1 AND id<>$2", [
        user.tenantId,
        user.userId,
      ]);
      await q.query(
        "UPDATE tenants SET demo_offset_minutes=0,attendance_cutoff_time=$1,monthly_fee=6500,platform_commission_pct=5 WHERE id=$2",
        ["06:00", user.tenantId],
      );
      await seedTenantDataRetainingAdmin(q, user.tenantId!, c.DOCUMENT_KEY);
      rt.invalidate(user.tenantId!);
      for (const key of rt.live.keys())
        if (key.startsWith(`${user.tenantId}:`)) rt.live.delete(key);
      return { ok: true };
    },
  );
  api.route(
    "post",
    "/admin/demo/presenter-sessions",
    ["ADMIN"],
    empty,
    async ({ q, user }) => {
      if (c.DEMO_ENABLED !== "true")
        throw new HttpError(403, "Presenter sessions disabled");
      const tenant = (
        await q.query("SELECT contact_email FROM tenants WHERE id=$1", [
          user.tenantId,
        ])
      ).rows[0];
      if (tenant?.contact_email !== "sunrise@example.test")
        throw new HttpError(
          403,
          "Presenter sessions are restricted to the seeded demo institution",
        );
      const { clock } = await ensureDay(q, user.tenantId!);
      const driver = (
        await q.query(
          "SELECT u.* FROM routes r JOIN users u ON u.tenant_id=r.tenant_id AND u.id=r.driver_id WHERE r.tenant_id=$1 ORDER BY r.id LIMIT 1",
          [user.tenantId],
        )
      ).rows[0];
      const student = (
        await q.query(
          "SELECT * FROM users WHERE tenant_id=$1 AND custom_id='STU-2026-44'",
          [user.tenantId],
        )
      ).rows[0];
      return {
        demo: true,
        date: clock.date,
        sessions: [driver, student].filter(Boolean).map((u) => ({
          token: tokenFor(
            {
              userId: u.id,
              tenantId: u.tenant_id,
              role: u.role,
              version: u.token_version,
            },
            c,
          ),
          user: {
            userId: u.id,
            tenantId: u.tenant_id,
            role: u.role,
            name: u.name,
            customId: u.custom_id,
            version: u.token_version,
          },
        })),
      };
    },
  );
}
async function setAttendance(
  ctx: Context,
  rt: Runtime,
  studentId: string,
  status: string,
  date: string,
) {
  const { q, user } = ctx;
  const a = requireValue(
    (
      await q.query(
        "UPDATE daily_attendance SET status=$1,marked_at=now() WHERE tenant_id=$2 AND student_id=$3 AND trip_date=$4 RETURNING *",
        [status, user.tenantId, studentId, date],
      )
    ).rows[0],
  );
  const route = requireValue(
    (
      await q.query(
        "SELECT route_id FROM student_stops WHERE tenant_id=$1 AND student_id=$2",
        [user.tenantId, studentId],
      )
    ).rows[0],
  );
  const trip = (
    await q.query(
      "SELECT t.*,r.direction FROM trips t JOIN routes r ON r.tenant_id=t.tenant_id AND r.id=t.route_id WHERE t.tenant_id=$1 AND t.route_id=$2 AND t.trip_date=$3",
      [user.tenantId, route.route_id, date],
    )
  ).rows[0];
  rt.invalidate(user.tenantId!);
  if (trip) {
    const ordered = await rt.ordered(q, user.tenantId!, trip, true);
    ctx.send(`user:${trip.driver_id}`, "route", ordered);
    await tell(
      ctx,
      { id: trip.driver_id },
      trip.id,
      "ATTENDANCE",
      `Student attendance changed to ${a.status.replace("_", " ")} · route optimized`,
    );
  }
}
export async function settle(
  q: Db,
  tenant: string,
  f: any,
  status: "PAID" | "FAILED",
  ref: string,
  ctx?: Context,
) {
  if (f.status === "PAID")
    return { status: "PAID", receiptNumber: f.receipt_number };
  const t = requireValue(
    (
      await q.query("SELECT platform_commission_pct FROM tenants WHERE id=$1", [
        tenant,
      ])
    ).rows[0],
  );
  const pct = Number(t.platform_commission_pct),
    split = splitFee(Number(f.monthly_fee) + Number(f.installation_fee), pct),
    receipt = status === "PAID" ? identifier("STMS") : null;
  await q.query(
    "UPDATE fee_transactions SET status=$1::varchar,platform_commission_pct=$2,net_driver_payout=$3,gateway_ref=$4,receipt_number=$5,receipt_url=$6,paid_at=CASE WHEN $1::varchar='PAID' THEN now() ELSE NULL END WHERE tenant_id=$7 AND id=$8",
    [
      status,
      pct,
      status === "PAID" ? split.net : null,
      ref,
      receipt,
      receipt ? `/api/v1/fees/${f.id}/receipt` : null,
      tenant,
      f.id,
    ],
  );
  if (ctx)
    await tell(
      ctx,
      { id: f.student_id },
      null,
      status === "PAID" ? "PAYMENT" : "PAYMENT_FAILED",
      status === "PAID"
        ? "Payment received · digital receipt ready"
        : "Sandbox payment failed · you can retry",
    );
  return { status, receiptNumber: receipt, ...split };
}
// Webhook is intentionally unauthenticated by JWT; the exact raw payload is HMAC authenticated.
export function webhook(api: Api, c: Config) {
  api.app.post("/api/v1/webhooks/payment", async (req, res) => {
    const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
    if (
      !raw ||
      !validSignature(raw, req.get("x-payment-signature"), c.WEBHOOK_SECRET)
    )
      throw new HttpError(401, "Invalid payment signature");
    const b = z
      .object({
        session: z.string().min(1).max(100),
        status: z.enum(["PAID", "FAILED"]),
        gatewayRef: z.string().min(1).max(100),
      })
      .strict()
      .parse(req.body);
    const outbox: { room: string; event: string; data: unknown }[] = [];
    const result = await api.db.run(platform, async (q) => {
      const f = requireValue(
        (
          await q.query(
            "SELECT * FROM fee_transactions WHERE payment_session=$1 FOR UPDATE",
            [b.session],
          )
        ).rows[0],
      );
      if (
        f.status !== "PAID" &&
        new Date(f.payment_session_expires) < new Date()
      )
        throw new HttpError(410, "Payment session expired");
      return {
        ...(await settle(q, f.tenant_id, f, b.status, b.gatewayRef, {
          q,
          user: {
            userId: f.student_id,
            tenantId: f.tenant_id,
            role: "STUDENT",
            version: 0,
          },
          params: {},
          send: (room, event, data) => outbox.push({ room, event, data }),
        })),
        tenantId: f.tenant_id,
      };
    });
    for (const x of outbox) api.events.emit("message", x);
    api.events.emit("changed", result.tenantId);
    res.json({ status: result.status, receiptNumber: result.receiptNumber });
  });
}
async function seedTenantDataRetainingAdmin(
  q: Db,
  tenant: string,
  key: string,
) {
  await seedTenant(q, tenant, key, false, true);
}
