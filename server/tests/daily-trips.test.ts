import { beforeAll, afterAll, it, expect, vi } from "vitest";
import request from "supertest";
import { testDatabase } from "./database.js";
import { createApp } from "../src/app.js";
import { platform } from "../src/db.js";
import { seed } from "../src/seed.js";
let env: Awaited<ReturnType<typeof testDatabase>>,
  server: ReturnType<typeof createApp>;
let admin = "",
  driver = "",
  driverId = "",
  tenant = "",
  routeId = "",
  vehicleId = "";
const beforeMidnight = Date.parse("2026-10-26T18:59:59Z"); // Karachi 23:59:59, not UTC midnight.
let now = beforeMidnight;
beforeAll(async () => {
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Deterministic routing fallback"),
  );
  env = await testDatabase();
  server = createApp(env.db, env.c);
  server.finish();
  for (const customId of ["SCH-01-ADM", "DRV-4821"]) {
    const r = await request(server.app)
      .post("/api/v1/auth/login")
      .send({ customId, password: "demo123" });
    expect(r.status).toBe(200);
    if (customId === "DRV-4821") {
      driver = r.body.token;
      driverId = r.body.user.userId;
      tenant = r.body.user.tenantId;
    } else admin = r.body.token;
  }
});
afterAll(async () => {
  await server?.notifier.settled();
  await server?.runtime.close();
  await env?.close();
  vi.restoreAllMocks();
});
const workspace = () =>
  request(server.app).get("/api/v1/workspace").auth(driver, { type: "bearer" });

it("seeds DRV-4821 with a vehicle, assigned Sunrise route and exactly one trip for the tenant-local date", async () => {
  await env.db.run(platform, async (q) => {
    const rows = (
      await q.query(
        "SELECT t.trip_date,t.driver_id,r.id AS route_id,r.vehicle_id,v.reg_number,n.timezone FROM trips t JOIN routes r ON r.tenant_id=t.tenant_id AND r.id=t.route_id JOIN vehicles v ON v.tenant_id=r.tenant_id AND v.id=r.vehicle_id JOIN tenants n ON n.id=r.tenant_id WHERE t.tenant_id=$1 AND t.driver_id=$2",
        [tenant, driverId],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      trip_date: "2026-10-26",
      reg_number: "ICT-1182",
      timezone: "Asia/Karachi",
    });
    routeId = rows[0].route_id;
    vehicleId = rows[0].vehicle_id;
  });
  await seed(env.db, env.c.DOCUMENT_KEY);
  await seed(env.db, env.c.DOCUMENT_KEY);
  const w = await workspace();
  expect(w.status).toBe(200);
  expect(w.body.date).toBe("2026-10-26");
  expect(w.body.trips).toHaveLength(1);
  expect(w.body.trip.routeId).toBe(routeId);
});
it("creates a missing trip on driver workspace reads after Karachi midnight and does not duplicate concurrent reads", async () => {
  now = beforeMidnight + 2000; // Still October 26 UTC, already October 27 in Karachi.
  await env.db.run(platform, async (q) => {
    expect(
      (
        await q.query(
          "SELECT id FROM trips WHERE tenant_id=$1 AND trip_date='2026-10-27'",
          [tenant],
        )
      ).rowCount,
    ).toBe(0);
  });
  const responses = await Promise.all([workspace(), workspace(), workspace()]);
  for (const w of responses) {
    expect(w.status).toBe(200);
    expect(w.body.date).toBe("2026-10-27");
    expect(w.body.trip.driverId).toBe(driverId);
    expect(w.body.trip.routeId).toBe(routeId);
  }
  expect(new Set(responses.map((w) => w.body.trip.id)).size).toBe(1);
  await env.db.run(platform, async (q) => {
    expect(
      (
        await q.query(
          "SELECT id FROM trips WHERE tenant_id=$1 AND route_id=$2 AND trip_date='2026-10-27'",
          [tenant, routeId],
        )
      ).rowCount,
    ).toBe(1);
    await q.query(
      "DELETE FROM trips WHERE tenant_id=$1 AND route_id=$2 AND trip_date='2026-10-27'",
      [tenant, routeId],
    );
  });
  const repaired = await workspace();
  expect(repaired.status).toBe(200);
  expect(repaired.body.trip).toBeTruthy();
});
it("creates and updates today’s trip inside the admin route-save transaction without a workspace GET", async () => {
  const body = {
    name: "Assignment test",
    driverId,
    vehicleId,
    startTime: "06:15",
    direction: "TO_CAMPUS",
  };
  const created = await request(server.app)
    .post("/api/v1/admin/routes")
    .auth(admin, { type: "bearer" })
    .send(body);
  expect(created.status).toBe(200);
  let otherDriver = "";
  await env.db.run(platform, async (q) => {
    expect(
      (
        await q.query(
          "SELECT driver_id FROM trips WHERE tenant_id=$1 AND route_id=$2 AND trip_date='2026-10-27'",
          [tenant, created.body.id],
        )
      ).rows[0].driver_id,
    ).toBe(driverId);
    otherDriver = (
      await q.query(
        "SELECT id FROM users WHERE tenant_id=$1 AND custom_id='PENDING-USMAN'",
        [tenant],
      )
    ).rows[0].id;
    await q.query(
      "UPDATE driver_verifications SET status='VERIFIED' WHERE tenant_id=$1 AND driver_id=$2",
      [tenant, otherDriver],
    );
  });
  const updated = await request(server.app)
    .put(`/api/v1/admin/routes/${created.body.id}`)
    .auth(admin, { type: "bearer" })
    .send({ ...body, driverId: otherDriver });
  expect(updated.status).toBe(200);
  await env.db.run(platform, async (q) => {
    expect(
      (
        await q.query(
          "SELECT driver_id FROM trips WHERE tenant_id=$1 AND route_id=$2 AND trip_date='2026-10-27'",
          [tenant, created.body.id],
        )
      ).rows[0].driver_id,
    ).toBe(otherDriver);
    await q.query(
      "DELETE FROM trips WHERE tenant_id=$1 AND route_id=$2 AND trip_date='2026-10-27'",
      [tenant, created.body.id],
    );
  });
  expect(
    (
      await request(server.app)
        .put(`/api/v1/admin/routes/${created.body.id}`)
        .auth(admin, { type: "bearer" })
        .send({ ...body, driverId: otherDriver })
    ).status,
  ).toBe(200);
  await env.db.run(platform, async (q) => {
    expect(
      (
        await q.query(
          "SELECT driver_id FROM trips WHERE tenant_id=$1 AND route_id=$2 AND trip_date='2026-10-27'",
          [tenant, created.body.id],
        )
      ).rows[0].driver_id,
    ).toBe(otherDriver);
    await q.query(
      "UPDATE trips SET status='COMPLETED' WHERE tenant_id=$1 AND route_id=$2 AND trip_date='2026-10-27'",
      [tenant, created.body.id],
    );
  });
  const history = await request(server.app)
    .put(`/api/v1/admin/routes/${created.body.id}`)
    .auth(admin, { type: "bearer" })
    .send(body);
  expect(history.status).toBe(409);
});
it("repairs a reassigned seed driver without taking another driver’s route, and reruns without adding duplicates", async () => {
  await env.db.run(platform, async (q) => {
    const other = (
      await q.query(
        "SELECT id FROM users WHERE tenant_id=$1 AND custom_id='PENDING-USMAN'",
        [tenant],
      )
    ).rows[0].id;
    await q.query(
      "UPDATE routes SET driver_id=$3 WHERE tenant_id=$1 AND id=$2",
      [tenant, routeId, other],
    );
  });
  await seed(env.db, env.c.DOCUMENT_KEY);
  await seed(env.db, env.c.DOCUMENT_KEY);
  const w = await workspace();
  expect(w.status).toBe(200);
  expect(w.body.trip).toBeTruthy();
  expect(w.body.trips).toHaveLength(1);
  expect(w.body.trip.routeId).not.toBe(routeId);
  expect(w.body.vehicles[0].reg).toBe("ICT-1182");
});
it("repeated demo resets recreate today’s default assignment and leave the other tenant intact", async () => {
  for (let i = 0; i < 2; i++) {
    const reset = await request(server.app)
      .post("/api/v1/admin/demo/reset")
      .auth(admin, { type: "bearer" })
      .send({ confirm: "RESET DEMO DATA" });
    expect(reset.status).toBe(200);
    await env.db.run(platform, async (q) => {
      const rows = (
        await q.query(
          "SELECT t.trip_date,u.custom_id FROM trips t JOIN users u ON u.tenant_id=t.tenant_id AND u.id=t.driver_id WHERE t.tenant_id=$1",
          [tenant],
        )
      ).rows;
      expect(rows).toEqual([
        { trip_date: "2026-10-27", custom_id: "DRV-4821" },
      ]);
      expect(
        (await q.query("SELECT id FROM users WHERE custom_id='DRV-6723'"))
          .rowCount,
      ).toBe(1);
    });
  }
});
