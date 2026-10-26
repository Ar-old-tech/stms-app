import { useStore } from "../store";
import type { Point } from "../model";
import { MapCanvas } from "./MapCanvas";
export function LiveMap({
  parent = false,
  onPick,
}: {
  parent?: boolean;
  onPick?: (point: Point) => void;
}) {
  const { data: s } = useStore();
  if (!s?.settings) return null;
  const trips = parent
    ? s.trip
      ? [s.trip]
      : []
    : s.session.role === "ADMIN"
      ? s.trips
      : s.trip
        ? [s.trip]
        : [];
  const stops = parent ? s.students : s.route.stops;
  const fallback = stops.length
    ? [...stops.map((s) => s.point), s.settings.campus]
    : [];
  return (
    <div className="map-wrap" id={parent ? "live-map" : undefined}>
      <MapCanvas
        stops={stops}
        line={parent ? [] : s.route.line.length ? s.route.line : fallback}
        campus={s.settings.campus}
        arrived={s.trip?.status === "ARRIVED"}
        vans={trips.filter(
          (t) => t.status === "IN_PROGRESS" || t.status === "ARRIVED",
        )}
        onPick={onPick}
      />
      <span className="map-label">LIVE SERVER ? ISLAMABAD / RAWALPINDI</span>
      <span className="campus-label">? CAMPUS</span>
    </div>
  );
}
