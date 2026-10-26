import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Point } from "../model";
import { TILE_URL, TILE_ATTRIBUTION, TILE_ERROR_THRESHOLD } from "../tiles";
import "leaflet/dist/leaflet.css";

type Stop = { id: string; point: Point; stop: string };
type Van = { id: string; point: Point; speed: number; simulated: boolean };
type Props = {
  center?: Point;
  zoom?: number;
  stops?: Stop[];
  line?: Point[];
  campus?: Point;
  arrived?: boolean;
  vans?: Van[];
  onPick?: (point: Point) => void;
  focus?: Point;
};
type VanLayer = {
  marker: L.CircleMarker;
  trail: L.Polyline;
  point: Point;
  target?: Point;
  frame: number;
};
const text = (value: string) => {
  const node = document.createElement("span");
  node.textContent = value;
  return node;
};

export function MapCanvas(props: Props) {
  const element = useRef<HTMLDivElement>(null),
    initial = useRef(props),
    latest = useRef(props);
  latest.current = props;
  const scene = useRef<{
    map: L.Map;
    route: L.Polyline;
    campus: L.CircleMarker;
    stops: Map<string, L.CircleMarker>;
    vans: Map<string, VanLayer>;
  } | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine),
    [errors, setErrors] = useState(0);
  const failed = offline || errors >= TILE_ERROR_THRESHOLD;

  useEffect(() => {
    const map = L.map(element.current!, {
      center: initial.current.center ?? [33.651, 73.043],
      zoom: initial.current.zoom ?? 11,
      maxZoom: 19,
      scrollWheelZoom: false,
      zoomControl: false,
    });
    // Attribution belongs to the map so it survives offline/error states.
    map.attributionControl.addAttribution(TILE_ATTRIBUTION);
    const tiles = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin",
      keepBuffer: 1,
      updateWhenIdle: true,
      detectRetina: false,
    });
    tiles.on("tileerror", () => setErrors((n) => n + 1));
    // Keep one layer for the map's entire lifetime, including failure states.
    if (navigator.onLine) tiles.addTo(map);
    const route = L.polyline([], {
      color: "#21dcf5",
      weight: 3,
      className: "route-line",
    }).addTo(map);
    const campus = L.circleMarker([0, 0], {
      radius: 12,
      color: "#5aefae",
    }).bindTooltip("Institution campus");
    const state = {
      map,
      route,
      campus,
      stops: new Map<string, L.CircleMarker>(),
      vans: new Map<string, VanLayer>(),
    };
    scene.current = state;
    map.on("click", (e) =>
      latest.current.onPick?.([e.latlng.lat, e.latlng.lng]),
    );
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (element.current?.getClientRects().length)
          map.invalidateSize({ pan: false });
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element.current!);
    const visible = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) resize();
    });
    visible.observe(element.current!);
    const online = () => {
      setOffline(false);
      if (!map.hasLayer(tiles)) tiles.addTo(map);
      resize();
    };
    const offline = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", resize);
    resize();
    return () => {
      observer.disconnect();
      visible.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", resize);
      for (const van of state.vans.values()) cancelAnimationFrame(van.frame);
      tiles.off();
      map.remove();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    const state = scene.current;
    if (!state) return;
    const { map, route, campus, stops, vans } = state;
    route.setLatLngs(props.line ?? []);
    if (props.campus) {
      campus.setLatLng(props.campus);
      if (!map.hasLayer(campus)) campus.addTo(map);
      campus.getElement()?.classList.toggle("campus-pulse", !!props.arrived);
    } else if (map.hasLayer(campus)) map.removeLayer(campus);
    const stopIds = new Set((props.stops ?? []).map((s) => s.id));
    for (const [id, marker] of stops)
      if (!stopIds.has(id)) {
        map.removeLayer(marker);
        stops.delete(id);
      }
    for (const [i, stop] of (props.stops ?? []).entries()) {
      let marker = stops.get(stop.id);
      if (!marker) {
        marker = L.circleMarker(stop.point, {
          radius: 6,
          color: "#21dcf5",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip(text(`${i + 1}. ${stop.stop}`));
        stops.set(stop.id, marker);
      }
      marker
        .setLatLng(stop.point)
        .setTooltipContent(text(`${i + 1}. ${stop.stop}`));
    }
    const vanIds = new Set((props.vans ?? []).map((v) => v.id));
    for (const [id, van] of vans)
      if (!vanIds.has(id)) {
        cancelAnimationFrame(van.frame);
        map.removeLayer(van.marker);
        map.removeLayer(van.trail);
        vans.delete(id);
      }
    for (const target of props.vans ?? []) {
      let van = vans.get(target.id);
      if (!van) {
        van = {
          marker: L.circleMarker(target.point, {
            radius: 9,
            color: "white",
            fillColor: "#21dcf5",
            fillOpacity: 1,
            className: "van-marker",
          })
            .addTo(map)
            .bindTooltip("", { permanent: true }),
          trail: L.polyline([], {
            color: "#21dcf5",
            weight: 12,
            opacity: 0.2,
          }).addTo(map),
          point: target.point,
          frame: 0,
        };
        vans.set(target.id, van);
      }
      van.marker.setTooltipContent(
        text(
          `🚐 ${Math.round(target.speed)} km/h${target.simulated ? " · SIMULATED" : ""}`,
        ),
      );
      // Repeated workspace/socket values must not restart the glide.
      if (
        van.target?.[0] === target.point[0] &&
        van.target?.[1] === target.point[1]
      )
        continue;
      van.target = target.point;
      cancelAnimationFrame(van.frame);
      const layer = van,
        from = van.point,
        start = performance.now(),
        reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const draw = (now: number) => {
        const t = reduced ? 1 : Math.min(1, (now - start) / 900);
        layer.point = [
          from[0] + (target.point[0] - from[0]) * t,
          from[1] + (target.point[1] - from[1]) * t,
        ];
        layer.marker.setLatLng(layer.point);
        layer.trail.setLatLngs([
          layer.point,
          [layer.point[0] - 0.001, layer.point[1] + 0.0005],
        ]);
        if (t < 1) layer.frame = requestAnimationFrame(draw);
      };
      layer.frame = requestAnimationFrame(draw);
    }
    if (props.focus) map.panTo(props.focus, { animate: false });
  }, [
    props.line,
    props.stops,
    props.campus,
    props.arrived,
    props.vans,
    props.focus,
  ]);

  return (
    <div className={`map-canvas${failed ? " tiles-unavailable" : ""}`}>
      <div ref={element} className="leaflet-host" />
      {failed && (
        <span className="map-fallback" role="status">
          Map tiles unavailable, tracking still works
        </span>
      )}
    </div>
  );
}
