import { useStore, activeStudents, route, uid } from "./store";
import { distance, shouldAlert } from "./routing";
import { tenantId } from "./seed";
export function tick() {
  const s = useStore.getState();
  s.update((d) => {
    d.clock += d.speed;
    if (d.trip.status !== "IN_PROGRESS") return;
    const target = route(d).stops[0]?.point ?? d.settings.campus;
    const meters = distance(d.trip.point, target);
    if (distance(d.trip.point, d.settings.campus) < 150) {
      d.trip.status = "ARRIVED";
      d.trip.speed = 0;
      d.notifications.unshift({
        id: uid(),
        tenantId,
        role: "all",
        text: "Safely arrived at the institution",
      });
      return;
    }
    if (d.trip.paused) {
      d.trip.speed = 0;
      return;
    }
    d.trip.speed = d.trip.speed > 60 ? d.trip.speed : 36;
    const move = Math.min(
      1,
      ((d.trip.speed / 3.6) * d.speed * 8) / Math.max(meters, 1),
    );
    d.trip.point = [
      d.trip.point[0] + (target[0] - d.trip.point[0]) * move,
      d.trip.point[1] + (target[1] - d.trip.point[1]) * move,
    ];
    if (meters < 50 && activeStudents(d).length) d.trip.paused = true;
    let total = 0,
      previous = d.trip.point;
    for (const stop of route(d).stops) {
      total += distance(previous, stop.point);
      previous = stop.point;
      const eta = total / 600;
      const key = `${d.trip.id}:${stop.id}`;
      if (shouldAlert(eta, key, d.alerted)) {
        d.alerted.push(key);
        d.notifications.unshift({
          id: uid(),
          tenantId,
          role: "parent",
          studentId: stop.id,
          text: `${stop.name}: van is ${Math.max(1, Math.ceil(eta))} minutes away`,
        });
      }
    }
  });
}
export function forceSpeed() {
  useStore.getState().update((s) => {
    s.trip.speed = 76;
    s.speedEvents.unshift({ id: uid(), tenantId, speed: 76 });
    s.events.unshift({
      id: uid(),
      tenantId,
      text: "Over-speed warning • 76 km/h",
    });
  });
  useStore.getState().notify("Over-speed warning · 76 km/h", "admin");
}
export function nearStop() {
  const s = useStore.getState();
  const p = route(s).stops[0]?.point ?? s.settings.campus;
  s.update((d) => {
    d.trip.point = [p[0] + 0.0001, p[1]];
    d.trip.paused = false;
  });
  tick();
}
