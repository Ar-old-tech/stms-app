import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import { useStore, route } from "../store";
import { tenantId } from "../seed";
import type { Point } from "../seed";
import "leaflet/dist/leaflet.css";
function Pin({ onPick }: { onPick?: (p: Point) => void }) {
  useMapEvents({ click: (e) => onPick?.([e.latlng.lat, e.latlng.lng]) });
  return null;
}
function useGlide(target: Point) {
  const [lat, lng] = target;
  const [point, setPoint] = useState<Point>(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now();
    function draw(now: number) {
      const t = reduced ? 1 : Math.min(1, (now - start) / 900);
      const p: Point = [
        from[0] + (lat - from[0]) * t,
        from[1] + (lng - from[1]) * t,
      ];
      current.current = p;
      setPoint(p);
      if (t < 1) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [lat, lng]);
  return point;
}
export function LiveMap({
  parent = false,
  onPick,
}: {
  parent?: boolean;
  onPick?: (p: Point) => void;
}) {
  const s = useStore();
  const [failed, setFailed] = useState(!navigator.onLine);
  const r = route(s);
  const vanPoint = useGlide(s.trip.point);
  const students = parent
    ? s.students.filter(
        (x) => x.id === "STU-2026-44" && x.tenantId === tenantId,
      )
    : r.stops;
  return (
    <div className="map-wrap" id={parent ? "live-map" : undefined}>
      <MapContainer
        center={[33.651, 73.043]}
        zoom={11}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={true}
      >
        <Pin onPick={onPick} />
        {!failed && (
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            eventHandlers={{ tileerror: () => setFailed(true) }}
          />
        )}
        {!parent && (
          <Polyline
            key={s.attendanceVersion}
            positions={r.line}
            pathOptions={{
              color: "#21dcf5",
              weight: 3,
              className: "route-line",
            }}
          />
        )}
        {students.map((x, i) => (
          <CircleMarker
            key={x.id}
            center={x.point}
            radius={6}
            pathOptions={{ color: "#21dcf5", fillOpacity: 1 }}
          >
            <Tooltip>
              {i + 1}. {x.stop}
            </Tooltip>
          </CircleMarker>
        ))}
        <CircleMarker
          center={s.settings.campus}
          radius={12}
          pathOptions={{
            color: "#5aefae",
            className: s.trip.status === "ARRIVED" ? "campus-pulse" : "",
          }}
        >
          <Tooltip>Sunrise Campus</Tooltip>
        </CircleMarker>
        {s.trip.status !== "IDLE" && (
          <>
            <Polyline
              positions={[vanPoint, [vanPoint[0] - 0.002, vanPoint[1] + 0.001]]}
              pathOptions={{ color: "#21dcf5", weight: 12, opacity: 0.2 }}
            />
            <CircleMarker
              center={vanPoint}
              radius={9}
              pathOptions={{
                color: "#fff",
                fillColor: "#21dcf5",
                fillOpacity: 1,
                className: "van-marker",
              }}
            >
              <Tooltip permanent>🚐 {s.trip.speed} km/h</Tooltip>
            </CircleMarker>
          </>
        )}
      </MapContainer>
      <span className="map-label">
        {failed
          ? "OFFLINE GRID · route available"
          : "LIVE MAP · ISLAMABAD / RAWALPINDI"}
      </span>
      <span className="campus-label">✦ SUNRISE CAMPUS</span>
    </div>
  );
}
