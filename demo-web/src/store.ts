import { create } from "zustand";
import { seed, tenantId, depot } from "./seed";
import type { DemoData, Point } from "./seed";
import { cutoffLocked, feeSplit, orderStops } from "./routing";
export const uid = () => crypto.randomUUID().slice(0, 8).toUpperCase();
type Store = DemoData & {
  update: (fn: (s: DemoData) => void) => void;
  reset: () => void;
  notify: (text: string, role?: string, link?: string) => void;
  attendance: (id: string, going: boolean, override?: boolean) => void;
  start: () => void;
  visit: (status: string) => void;
  emergency: (source: string) => void;
  pay: (id: string, success: boolean) => void;
  verify: (id: string, approved: boolean, reason?: string) => void;
};
export const useStore = create<Store>((set, get) => ({
  ...seed(),
  update: (fn) =>
    set((s) => {
      const data = structuredClone(
        Object.fromEntries(
          Object.entries(s).filter(([, v]) => typeof v !== "function"),
        ),
      ) as DemoData;
      fn(data);
      return data;
    }),
  reset: () => set(seed()),
  notify: (text, role = "all", link) =>
    get().update((s) => {
      s.notifications.unshift({ id: uid(), tenantId, role, text, link });
      s.notifications = s.notifications.slice(0, 30);
    }),
  attendance: (id, going, override = false) => {
    if (!get().students.some((x) => x.id === id && x.tenantId === tenantId))
      return;
    if (!override && cutoffLocked(get().clock, get().settings.cutoff)) return;
    get().update((s) => {
      const student = s.students.find(
        (x) => x.id === id && x.tenantId === tenantId,
      );
      if (student) {
        student.going = going;
        s.attendanceVersion++;
        s.trip.next = 0;
      }
    });
    get().notify(
      `${get().students.find((x) => x.id === id)?.name}: ${going ? "Going" : "Not Going"} · route updated`,
      "driver",
    );
  },
  start: () => {
    const s = get();
    if (
      !s.drivers.some(
        (d) =>
          d.id === s.trip.driverId &&
          d.status === "VERIFIED" &&
          d.tenantId === tenantId,
      )
    )
      return;
    s.update((d) => {
      d.trip.status = "IN_PROGRESS";
      d.trip.point = depot;
      d.trip.next = 0;
      d.trip.paused = false;
      d.events.unshift({
        id: uid(),
        tenantId,
        text: "Trip started • route optimized",
      });
    });
  },
  visit: (status) =>
    get().update((s) => {
      if (!["IN_PROGRESS", "ARRIVED"].includes(s.trip.status)) return;
      if (status === "Dropped at institution") {
        if (s.trip.status === "ARRIVED") {
          s.trip.status = "COMPLETED";
          s.events.unshift({ id: uid(), tenantId, text: status });
        }
        return;
      }
      const next = route(s).stops[0];
      if (next) {
        next.visit = status;
        next.boarded = status === "Picked up";
        s.events.unshift({
          id: uid(),
          tenantId,
          text: `${next.name} · ${status}`,
        });
        if (status !== "Arrived") s.trip.paused = false;
      }
    }),
  emergency: (source) => {
    get().update((s) =>
      s.sos.unshift({
        id: uid(),
        tenantId,
        resolved: false,
        source,
        point: s.trip.point,
      }),
    );
    get().notify(`SOS from ${source} · live trip location`, "all", "#live-map");
  },
  pay: (id, success) => {
    get().update((s) => {
      const f = s.fees.find((x) => x.id === id && x.tenantId === tenantId);
      if (f && f.status !== "PAID") {
        f.status = success ? "PAID" : "FAILED";
        if (success) {
          Object.assign(f, feeSplit(f.amount, s.settings.commission));
          f.receipt = `STMS-${uid()}`;
        }
      }
    });
    get().notify(
      success
        ? "Payment received · digital receipt ready"
        : "Payment failed · please retry",
      "parent",
    );
  },
  verify: (id, approved, reason = "") => {
    if (!approved && !reason.trim()) return;
    get().update((s) => {
      const d = s.drivers.find((x) => x.id === id && x.tenantId === tenantId);
      if (d) {
        const old = d.id;
        d.status = approved ? "VERIFIED" : "REJECTED";
        d.reason = reason;
        if (approved) {
          do {
            d.id = `DRV-${uid().slice(0, 4)}`;
          } while (s.drivers.some((x) => x !== d && x.id === d.id));
          s.trip.driverId = d.id;
          s.routes[0].driverId = d.id;
          let vehicle = s.vehicles.find(
            (x) => x.tenantId === tenantId && x.reg === d.reg,
          );
          if (!vehicle) {
            vehicle = { id: uid(), tenantId, reg: d.reg, capacity: 12 };
            s.vehicles.push(vehicle);
          }
          s.routes[0].vehicleId = vehicle.id;
          s.events.unshift({
            id: uid(),
            tenantId,
            text: `${d.name} verified (${old})`,
          });
        }
      }
    });
    get().notify(
      approved
        ? "Driver approved · Verified badge issued"
        : `Application rejected: ${reason}`,
    );
  },
}));
export const activeStudents = (s: DemoData) =>
  s.students.filter(
    (x) =>
      x.tenantId === tenantId &&
      x.going &&
      !["Picked up", "No-show"].includes(x.visit),
  );
const routeCache = new Map<string, string[]>();
export const route = (s: DemoData) => {
  const students = s.students.filter((x) => x.tenantId === tenantId && x.going);
  const key = `${tenantId}:${s.attendanceVersion}:${JSON.stringify(students.map((x) => [x.id, x.point]))}:${s.settings.campus}`;
  let ids = routeCache.get(key);
  if (!ids) {
    ids = orderStops(depot, students, s.settings.campus).stops.map((x) => x.id);
    if (routeCache.size > 30) routeCache.clear();
    routeCache.set(key, ids);
  }
  const stops = ids
    .map((id) => students.find((x) => x.id === id)!)
    .filter((x) => !["Picked up", "No-show"].includes(x.visit));
  return {
    stops,
    line: [
      s.trip.status === "IDLE" ? depot : s.trip.point,
      ...stops.map((x) => x.point),
      s.settings.campus,
    ],
  };
};
export const setPoint = (point: Point) =>
  useStore.getState().update((s) => {
    s.trip.point = point;
  });
// Browser projections keep stop and daily-attendance data in one authoritative student record.
export const stopsForTenant = (s: DemoData, id = tenantId) =>
  s.students
    .filter((x) => x.tenantId === id)
    .map((x) => ({
      id: x.id,
      tenantId: x.tenantId,
      studentId: x.id,
      name: x.stop,
      point: x.point,
    }));
export const attendanceForTenant = (s: DemoData, id = tenantId) =>
  s.students
    .filter((x) => x.tenantId === id)
    .map((x) => ({
      tenantId: x.tenantId,
      studentId: x.id,
      going: x.going,
      boarded: x.boarded,
      visit: x.visit,
    }));
