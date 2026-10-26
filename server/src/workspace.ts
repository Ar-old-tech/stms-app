import { visibleSos } from "./sos.js";
import { empty } from "./http.js";
import type { Api } from "./http.js";
import type { Runtime } from "./runtime.js";
import { ensureDay } from "./operations.js";
import { depot } from "./routing.js";
import { decrypt } from "./crypto.js";
import type { Config } from "./config.js";
export function workspace(api: Api, rt: Runtime, c: Config) {
  api.route(
    "get",
    "/workspace",
    ["ADMIN", "DRIVER", "STUDENT", "PARENT", "SUPER_ADMIN"],
    empty,
    async ({ q, user }) => {
      if (user.role === "SUPER_ADMIN")
        return {
          tenantId: null,
          session: user,
          tenants: (
            await q.query(
              "SELECT id,name,type,plan,contact_email FROM tenants ORDER BY id",
            )
          ).rows,
          students: [],
          drivers: [],
          vehicles: [],
          routes: [],
          trips: [],
          trip: null,
          fees: [],
          sos: [],
          events: [],
          speedEvents: [],
          notifications: [],
          overrides: [],
          route: { stops: [], line: [], source: "none" },
          settings: null,
          stats: {
            students: Number(
              (
                await q.query(
                  "SELECT count(*) FROM users WHERE role='STUDENT' AND active=true",
                )
              ).rows[0].count,
            ),
            activeTrips: Number(
              (
                await q.query(
                  "SELECT count(*) FROM trips WHERE status='IN_PROGRESS'",
                )
              ).rows[0].count,
            ),
          },
          clock: 0,
          date: new Date().toISOString().slice(0, 10),
          demoEnabled: c.DEMO_ENABLED === "true",
        };
      const tenant = user.tenantId!,
        { t, clock } = await ensureDay(q, tenant);
      const isAdmin = user.role === "ADMIN";
      const trips = (
        await q.query(
          "SELECT t.*,r.name AS route_name,r.vehicle_id,r.direction FROM trips t JOIN routes r ON r.tenant_id=t.tenant_id AND r.id=t.route_id WHERE t.tenant_id=$1 AND t.trip_date=$2 AND ($3::boolean OR ($4='DRIVER' AND t.driver_id=$5) OR ($4='PARENT' AND EXISTS(SELECT 1 FROM parent_students p JOIN student_stops ps ON ps.tenant_id=p.tenant_id AND ps.student_id=p.student_id WHERE p.tenant_id=$1 AND p.parent_id=$5 AND ps.route_id=t.route_id)) OR ($4='STUDENT' AND EXISTS(SELECT 1 FROM student_stops s WHERE s.tenant_id=$1 AND s.student_id=$5 AND s.route_id=t.route_id))) ORDER BY CASE t.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'ARRIVED' THEN 1 ELSE 2 END,t.id",
          [tenant, clock.date, isAdmin, user.role, user.userId],
        )
      ).rows;
      const selected = trips[0];
      const active =
        user.role === "DRIVER" &&
        selected &&
        ["IN_PROGRESS", "ARRIVED"].includes(selected.status);
      const students = (
        await q.query(
          "SELECT u.id,u.custom_id,u.name,s.stop_name,s.latitude,s.longitude,s.route_id,COALESCE(a.status,'GOING') AS status,COALESCE(a.visit_status,'Waiting') AS visit,COALESCE(a.boarded,false) AS boarded,COALESCE(a.override_requested,false) AS override_requested,a.requested_status FROM users u JOIN student_stops s ON s.tenant_id=u.tenant_id AND s.student_id=u.id LEFT JOIN daily_attendance a ON a.tenant_id=u.tenant_id AND a.student_id=u.id AND a.trip_date=$2 WHERE u.tenant_id=$1 AND u.role='STUDENT' AND u.active=true AND ($3::boolean OR (u.id=$4 AND $5='STUDENT') OR ($5='PARENT' AND EXISTS(SELECT 1 FROM parent_students p WHERE p.tenant_id=$1 AND p.parent_id=$4 AND p.student_id=u.id)) OR ($5='DRIVER' AND $6::boolean AND s.route_id=$7 AND COALESCE(a.status,'GOING')='GOING')) ORDER BY u.id",
          [
            tenant,
            clock.date,
            isAdmin,
            user.userId,
            user.role,
            !!active,
            selected?.route_id ?? null,
          ],
        )
      ).rows.map((x) => ({
        id: x.id,
        customId: x.custom_id,
        tenantId: tenant,
        name: x.name,
        point: [x.latitude, x.longitude],
        stop: x.stop_name,
        routeId: x.route_id,
        going: x.status === "GOING",
        boarded: x.boarded,
        visit: x.visit,
        overrideRequested: x.override_requested,
        requestedStatus: x.requested_status,
      }));
      const documents =
        user.role === "ADMIN" || user.role === "DRIVER"
          ? (
              await q.query(
                "SELECT driver_id,kind FROM document_blobs WHERE tenant_id=$1 AND ($2::boolean OR driver_id=$3)",
                [tenant, isAdmin, user.userId],
              )
            ).rows
          : [];
      const drivers = (
        await q.query(
          "SELECT u.id,u.custom_id,u.name,v.* FROM users u JOIN driver_verifications v ON v.tenant_id=u.tenant_id AND v.driver_id=u.id WHERE u.tenant_id=$1 AND ($2::boolean OR u.id=$3) ORDER BY u.id",
          [
            tenant,
            isAdmin,
            user.role === "DRIVER"
              ? user.userId
              : (selected?.driver_id ?? null),
          ],
        )
      ).rows.map((x) => ({
        id: x.driver_id,
        customId: x.custom_id,
        tenantId: tenant,
        name: x.name,
        status: x.status,
        reg: x.vehicle_reg_number,
        ...(isAdmin || user.role === "DRIVER"
          ? {
              cnic: decrypt(x.cnic_number, c.DOCUMENT_KEY).toString(),
              license: x.license_number,
              expiry: x.license_expiry,
              reason: x.rejection_reason ?? "",
            }
          : {}),
        photos: ["cnic", "license", "vehicle"].map((k) =>
          documents.some((d) => d.driver_id === x.driver_id && d.kind === k)
            ? `/api/v1/admin/drivers/${x.driver_id}/documents/${k}`
            : "",
        ),
      }));
      const vehicles = (
        await q.query(
          "SELECT id,reg_number,capacity FROM vehicles WHERE tenant_id=$1 AND ($2::boolean OR id=$3)",
          [tenant, isAdmin, selected?.vehicle_id ?? null],
        )
      ).rows.map((x) => ({
        id: x.id,
        tenantId: tenant,
        reg: x.reg_number,
        capacity: x.capacity,
      }));
      const routes = (
        await q.query(
          "SELECT * FROM routes WHERE tenant_id=$1 AND ($2::boolean OR id=$3) ORDER BY id",
          [tenant, isAdmin, selected?.route_id ?? null],
        )
      ).rows.map((x) => ({
        id: x.id,
        tenantId: tenant,
        name: x.name,
        driverId: x.driver_id,
        vehicleId: x.vehicle_id,
        startTime: x.start_time.slice(0, 5),
        direction: x.direction,
      }));
      const fees =
        user.role === "DRIVER"
          ? []
          : (
              await q.query(
                "SELECT * FROM fee_transactions WHERE tenant_id=$1 AND ($2::boolean OR student_id=$3) ORDER BY period_month DESC,id",
                [tenant, isAdmin, user.userId],
              )
            ).rows.map((x) => ({
              id: x.id,
              tenantId: tenant,
              studentId: x.student_id,
              month: x.period_month,
              amount: Number(x.monthly_fee),
              status: x.status,
              receipt: x.receipt_number ?? "",
              commission:
                Math.round(
                  Number(x.monthly_fee) * Number(x.platform_commission_pct),
                ) / 100,
              net: Number(x.net_driver_payout ?? 0),
              paidAt: x.paid_at,
            }));
      const sos = await visibleSos(q, user);
      const events = isAdmin
        ? (
            await q.query(
              "SELECT * FROM trip_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
              [tenant],
            )
          ).rows.map((x) => ({
            id: x.id,
            tenantId: tenant,
            tripId: x.trip_id,
            text: `${x.event_type.replaceAll("_", " ")}${x.speed_kmh ? ` · ${Math.round(x.speed_kmh)} km/h` : ""}`,
            speed: x.speed_kmh,
            type: x.event_type,
          }))
        : [];
      const notifications = (
        await q.query(
          "SELECT * FROM notifications WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 30",
          [tenant, user.userId],
        )
      ).rows.map((x) => ({
        id: x.id,
        tenantId: tenant,
        tripId: x.trip_id,
        kind: x.kind,
        text: x.message,
        link: x.location_link,
        createdAt: x.created_at,
      }));
      const tripViews = [];
      for (const trip of trips) {
        const live = rt.live.get(`${tenant}:${trip.id}`);
        const sample = !live
          ? (
              await q.query(
                "SELECT latitude,longitude,speed_kmh,created_at,event_type FROM trip_events WHERE tenant_id=$1 AND trip_id=$2 AND event_type IN('GPS_SAMPLE','SIMULATED_SAMPLE') ORDER BY created_at DESC LIMIT 1",
                [tenant, trip.id],
              )
            ).rows[0]
          : null;
        tripViews.push({
          id: trip.id,
          tenantId: tenant,
          routeId: trip.route_id,
          driverId: trip.driver_id,
          status: trip.status,
          point:
            live?.point ??
            (sample ? [sample.latitude, sample.longitude] : depot),
          speed: live?.speed ?? 0,
          timestamp:
            live?.timestamp ??
            (sample ? new Date(sample.created_at).getTime() : null),
          simulated:
            live?.simulated ?? sample?.event_type === "SIMULATED_SAMPLE",
          eta:
            live?.etaStudent === user.userId ||
            isAdmin ||
            user.role === "DRIVER"
              ? (live?.eta ?? null)
              : null,
          etaStudent: live?.etaStudent ?? null,
        });
      }
      const ordered =
        selected && (isAdmin || active)
          ? await rt.ordered(q, tenant, selected)
          : { stops: [], line: [], source: "private" };
      return {
        tenantId: tenant,
        session: user,
        tenants: [{ id: tenant, name: t.name, type: t.type, plan: t.plan }],
        students,
        drivers,
        vehicles,
        routes,
        fees,
        sos,
        events,
        speedEvents: events.filter((x) => x.type === "OVER_SPEED"),
        notifications,
        overrides: students
          .filter((x) => x.overrideRequested)
          .map((x) => ({
            id: x.id,
            tenantId: tenant,
            resolved: false,
            status: x.requestedStatus,
          })),
        trips: tripViews,
        trip: tripViews[0] ?? null,
        route: ordered,
        settings: {
          tenantId: tenant,
          cutoff: t.attendance_cutoff_time.slice(0, 5),
          tripTime: t.trip_time.slice(0, 5),
          campus: [t.destination_lat, t.destination_lng],
          fee: Number(t.monthly_fee),
          commission: Number(t.platform_commission_pct),
          timezone: t.timezone,
          demoOffsetMinutes: t.demo_offset_minutes,
        },
        clock: clock.seconds,
        date: clock.date,
        serverTime: Date.now(),
        demoEnabled: c.DEMO_ENABLED === "true",
      };
    },
  );
}
