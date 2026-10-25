import { describe, it, expect, beforeEach } from "vitest";
import { orderStops, cutoffLocked, shouldAlert, feeSplit } from "./routing";
import { useStore, route, stopsForTenant, attendanceForTenant } from "./store";
import { tick, forceSpeed, nearStop } from "./sim";
import { campus, depot, tenantId } from "./seed";
describe("demo logic", () => {
  beforeEach(() => useStore.getState().reset());
  it("orders nearest neighbour and fixes campus last", () => {
    const r = orderStops(depot, [{ point: campus }, { point: depot }], campus);
    expect(r.stops[0].point).toEqual(depot);
    expect(r.line.at(-1)).toEqual(campus);
  });
  it("locks at cut-off boundary", () => {
    expect(cutoffLocked(21599, "06:00")).toBe(false);
    expect(cutoffLocked(21600, "06:00")).toBe(true);
  });
  it("alerts exactly once per trip stop", () => {
    const key = "trip:student";
    expect(shouldAlert(5, key, [])).toBe(true);
    expect(shouldAlert(2, key, [key])).toBe(false);
    const s = useStore.getState();
    s.start();
    nearStop();
    tick();
    const first = useStore.getState().alerted;
    tick();
    expect(new Set(useStore.getState().alerted).size).toBe(
      useStore.getState().alerted.length,
    );
    expect(first.length).toBeGreaterThan(0);
  });
  it("calculates commission and net payout", () =>
    expect(feeSplit(6500, 5)).toEqual({ commission: 325, net: 6175 }));
  it("walks the eight demo steps", () => {
    let s = useStore.getState();
    s.verify("application-2", true);
    expect(useStore.getState().drivers[1].status).toBe("VERIFIED");
    s.attendance("STU-2026-44", false);
    s.start();
    expect(useStore.getState().students[0].going).toBe(false);
    forceSpeed();
    expect(useStore.getState().speedEvents[0].speed).toBe(76);
    nearStop();
    expect(useStore.getState().alerted.length).toBeGreaterThan(0);
    for (let i = 0; i < 7; i++) {
      s.visit("Arrived");
      s.visit("Picked up");
    }
    s.update((d) => {
      d.trip.point = campus;
    });
    tick();
    expect(useStore.getState().trip.status).toBe("ARRIVED");
    s.emergency("Parent");
    expect(
      useStore
        .getState()
        .sos.some((x) => !x.resolved && x.tenantId === tenantId),
    ).toBe(true);
    s.update((d) => d.sos.forEach((x) => (x.resolved = true)));
    s.pay("fee-0", true);
    expect(useStore.getState().fees[0]).toMatchObject({
      status: "PAID",
      net: 6175,
    });
  });
  it("reject requires reason and attendance respects lock", () => {
    const s = useStore.getState();
    s.verify("application-2", false);
    expect(useStore.getState().drivers[1].status).toBe("PENDING");
    s.update((d) => (d.clock = 21600));
    s.attendance("STU-2026-44", false);
    expect(useStore.getState().students[0].going).toBe(true);
  });
  it("keeps foreign tenant students out of routes and mutations", () => {
    const s = useStore.getState();
    s.update((d) =>
      d.students.push({
        ...d.students[0],
        id: "foreign",
        tenantId: "city",
        name: "City student",
      }),
    );
    s.attendance("foreign", false);
    expect(
      useStore.getState().students.find((x) => x.id === "foreign")?.going,
    ).toBe(true);
    expect(
      route(useStore.getState()).stops.every((x) => x.tenantId === tenantId),
    ).toBe(true);
    expect(stopsForTenant(useStore.getState(), "city")).toHaveLength(1);
    expect(
      attendanceForTenant(useStore.getState()).every(
        (x) => x.tenantId === tenantId,
      ),
    ).toBe(true);
  });
  it("campus entry triggers arrival and explicit drop completes the trip", () => {
    const s = useStore.getState();
    s.start();
    s.update((d) => (d.trip.point = campus));
    tick();
    expect(useStore.getState().trip.status).toBe("ARRIVED");
    s.visit("Dropped at institution");
    expect(useStore.getState().trip.status).toBe("COMPLETED");
  });
  it("payment failures retry without duplicate receipts or changing paid amounts", () => {
    const s = useStore.getState();
    s.pay("fee-0", false);
    expect(useStore.getState().fees[0].status).toBe("FAILED");
    s.pay("fee-0", true);
    const receipt = useStore.getState().fees[0].receipt;
    s.pay("fee-0", true);
    expect(useStore.getState().fees[0].receipt).toBe(receipt);
  });
});
