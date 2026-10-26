import type { SessionStore } from "./store";
import type { Session, Point } from "./model";
import { request } from "./api";
export type Stores = Record<string, SessionStore>;
export const captions = [
  "Admin verifies and assigns Usman. Parents see the Verified driver.",
  "Ayesha chooses Satellite Town and marks Not Going before cut-off.",
  "The driver starts. Only Going students remain on the optimized route.",
  "SIMULATED GPS moves the van. The server records a speed warning.",
  "An explicit admin override restores Ayesha. Her proximity alert fires once.",
  "The driver records pickup. The server geofence confirms campus arrival.",
  "A real SOS record reaches admin and parents with the live trip location.",
  "Admin resolves the SOS. SANDBOX payment creates a receipt and driver payout.",
];
async function act(
  store: SessionStore,
  path: string,
  body?: unknown,
  method?: string,
) {
  const result = await store.getState().act(path, body, method);
  if (!result) throw Error(store.getState().error || "Demo action failed");
  return result;
}
export async function jumpClock(stores: Stores, targetMinutes: number) {
  const admin = stores.Admin;
  await admin.getState().refresh();
  const s = admin.getState().data!,
    t = s.settings!;
  const offset = t.demoOffsetMinutes + targetMinutes - Math.floor(s.clock / 60);
  return act(
    admin,
    "/admin/settings",
    {
      cutoff: t.cutoff,
      tripTime: t.tripTime,
      campus: t.campus,
      fee: t.fee,
      commission: t.commission,
      demoOffsetMinutes: offset,
    },
    "PUT",
  );
}
let lastTimestamp = 0;
export async function sendGps(stores: Stores, point: Point, speed = 36) {
  const driver = stores.Driver;
  if (!driver) throw Error("Open Presenter Mode first");
  const trip = driver.getState().data?.trip;
  if (!trip || trip.status !== "IN_PROGRESS")
    throw Error("Start the driver trip first");
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return act(driver, `/trips/${trip.id}/telemetry`, {
    point,
    speed,
    timestamp: lastTimestamp,
    simulated: true,
  });
}
export async function sandboxPay(
  store: SessionStore,
  feeId: string,
  gateway = "JazzCash",
  success = true,
) {
  const { token } = store.getState().session;
  const session = await act(store, `/fees/${feeId}/pay`, { gateway });
  const signed = await act(store, `/fees/${feeId}/sandbox-complete`, {
    session: session.session,
    success,
  });
  const response = await fetch(signed.webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-payment-signature": signed.signature,
    },
    body: signed.webhookBody,
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? "Sandbox webhook failed");
  await request(token, "/auth/me");
  await store.getState().refresh();
  return result;
}
export async function reset(
  stores: Stores,
  replace: (sessions: Session[]) => Promise<void>,
) {
  stores.Driver?.getState().setTracking({ mode: "off" });
  await act(stores.Admin, "/admin/demo/reset", { confirm: "RESET DEMO DATA" });
  const result = await act(stores.Admin, "/admin/demo/presenter-sessions", {});
  await replace(result.sessions);
}
export async function stepDemo(
  step: number,
  getStores: () => Stores,
  replace: (sessions: Session[]) => Promise<void>,
) {
  let stores = getStores();
  const admin = stores.Admin;
  if (!admin) throw Error("Administrator sign-in required");
  await admin.getState().refresh();
  switch (step) {
    case 0: {
      const s = admin.getState().data!,
        pending = s.drivers.find(
          (d) => d.status === "PENDING" && d.name === "Usman Ahmed",
        );
      if (!pending)
        throw Error("Reset the seeded demo before starting SHOWTIME");
      await act(
        admin,
        `/admin/drivers/${pending.id}/verify`,
        { approved: true },
        "PATCH",
      );
      const vehicle = await act(admin, "/admin/vehicles", {
        reg: pending.reg,
        capacity: 12,
      });
      const r = admin.getState().data!.routes[0];
      await act(
        admin,
        `/admin/routes/${r.id}`,
        {
          name: r.name,
          driverId: pending.id,
          vehicleId: vehicle.id,
          startTime: r.startTime,
          direction: r.direction,
        },
        "PUT",
      );
      const sessions = await act(admin, "/admin/demo/presenter-sessions", {});
      await replace(sessions.sessions);
      await jumpClock(getStores(), 5 * 60 + 45);
      break;
    }
    case 1: {
      await act(
        stores.Parent,
        "/students/me/stop",
        { stop: "Satellite Town", point: [33.636, 73.065] },
        "PUT",
      );
      await act(
        stores.Parent,
        "/students/me/attendance",
        { status: "NOT_GOING" },
        "PUT",
      );
      break;
    }
    case 2: {
      stores.Driver.getState().setTracking({ mode: "bot" });
      const trip = stores.Driver.getState().data!.trip!;
      await act(stores.Driver, `/trips/${trip.id}/start`, {});
      break;
    }
    case 3: {
      stores.Driver.getState().setTracking({ mode: "off" });
      await stores.Driver.getState().refresh();
      const p = stores.Driver.getState().data!.trip!.point;
      await sendGps(stores, [p[0] + 0.0002, p[1] + 0.0002], 76);
      break;
    }
    case 4: {
      stores.Driver.getState().setTracking({ mode: "off" });
      await jumpClock(stores, 6 * 60 + 15);
      await act(
        stores.Parent,
        "/students/me/attendance",
        { status: "GOING", requestOverride: true },
        "PUT",
      );
      const student = stores.Parent.getState().data!.students[0];
      await act(admin, `/admin/attendance/${student.id}/override`, {
        approve: true,
      });
      await stores.Driver.getState().refresh();
      let next = stores.Driver.getState().data!.route.stops[0];
      for (let i = 0; next && next.id !== student.id && i < 20; i++) {
        const trip = stores.Driver.getState().data!.trip!;
        await act(stores.Driver, `/trips/${trip.id}/stops/${next.id}/status`, {
          status: "Arrived",
        });
        await act(stores.Driver, `/trips/${trip.id}/stops/${next.id}/status`, {
          status: "Picked up",
        });
        next = stores.Driver.getState().data!.route.stops[0];
      }
      await sendGps(stores, student.point, 20);
      break;
    }
    case 5: {
      stores.Driver.getState().setTracking({ mode: "off" });
      await stores.Driver.getState().refresh();
      for (let i = 0; i < 30; i++) {
        const s = stores.Driver.getState().data!,
          next = s.route.stops[0];
        if (!next) break;
        await act(
          stores.Driver,
          `/trips/${s.trip!.id}/stops/${next.id}/status`,
          { status: "Arrived" },
        );
        await act(
          stores.Driver,
          `/trips/${s.trip!.id}/stops/${next.id}/status`,
          { status: "Picked up" },
        );
      }
      await sendGps(stores, stores.Driver.getState().data!.settings!.campus, 0);
      break;
    }
    case 6: {
      await act(stores.Driver, "/sos", {
        tripId: stores.Driver.getState().data!.trip!.id,
        confirmed: true,
        type: "BREAKDOWN",
        message: "Demo emergency: vehicle needs assistance.",
      });
      break;
    }
    case 7: {
      await admin.getState().refresh();
      for (const sos of admin.getState().data!.sos.filter((s) => !s.resolved))
        await act(admin, `/admin/sos/${sos.id}`, { resolved: true }, "PATCH");
      await stores.Parent.getState().refresh();
      const fee = stores.Parent.getState().data!.fees.find(
        (f) => f.status !== "PAID",
      );
      if (fee) await sandboxPay(stores.Parent, fee.id);
      break;
    }
  }
  for (const store of Object.values(getStores()))
    await store.getState().refresh();
}
