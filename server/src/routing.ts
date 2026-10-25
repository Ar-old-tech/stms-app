export type Point = [number, number];
export type Stop = {
  id: string;
  studentId: string;
  name: string;
  stop: string;
  point: Point;
  visit: string;
  boarded: boolean;
};
export const depot: Point = [33.5973, 73.0479];
export function distance(a: Point, b: Point) {
  const r = Math.PI / 180,
    x = (b[0] - a[0]) * r,
    y = (b[1] - a[1]) * r;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(x / 2) ** 2 +
          Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(y / 2) ** 2,
      ),
    )
  );
}
export function nearest(start: Point, stops: Stop[], campus: Point) {
  const remaining = [...stops],
    ordered: Stop[] = [];
  let p = start;
  while (remaining.length) {
    remaining.sort((a, b) => distance(p, a.point) - distance(p, b.point));
    const next = remaining.shift()!;
    ordered.push(next);
    p = next.point;
  }
  return {
    stops: ordered,
    line: [start, ...ordered.map((x) => x.point), campus],
    source: "fallback" as string,
  };
}
export async function optimize(
  start: Point,
  stops: Stop[],
  campus: Point,
  fetcher = fetch,
) {
  const points = [start, ...stops.map((x) => x.point), campus];
  if (!stops.length) return nearest(start, stops, campus);
  try {
    const url = `https://router.project-osrm.org/trip/v1/driving/${points.map((p) => `${p[1]},${p[0]}`).join(";")}?source=first&destination=last&roundtrip=false&geometries=geojson&overview=full`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw Error();
    const data = (await response.json()) as {
      code: string;
      waypoints: { waypoint_index: number }[];
      trips: { geometry: { coordinates: number[][] } }[];
    };
    if (
      data.code !== "Ok" ||
      data.waypoints.length !== points.length ||
      data.waypoints[0].waypoint_index !== 0 ||
      data.waypoints.at(-1)?.waypoint_index !== points.length - 1
    )
      throw Error();
    const indexes = data.waypoints.map((x) => x.waypoint_index);
    if (
      new Set(indexes).size !== points.length ||
      indexes.some((x) => x < 0 || x >= points.length)
    )
      throw Error();
    const line = data.trips[0].geometry.coordinates.map(
      (p) => [p[1], p[0]] as Point,
    );
    if (
      line.length < 2 ||
      line.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
    )
      throw Error();
    return {
      stops: stops
        .map((s, i) => ({ s, order: data.waypoints[i + 1].waypoint_index }))
        .sort((a, b) => a.order - b.order)
        .map((x) => x.s),
      line,
      source: "OSRM",
    };
  } catch {
    return nearest(start, stops, campus);
  }
}
export async function etaMinutes(start: Point, end: Point, fetcher = fetch) {
  try {
    const response = await fetcher(
      `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=false`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) throw Error();
    const result = (await response.json()) as {
      code: string;
      routes: { duration: number }[];
    };
    const duration = result.routes?.[0]?.duration;
    if (result.code !== "Ok" || !Number.isFinite(duration) || duration < 0)
      throw Error();
    return duration / 60;
  } catch {
    return distance(start, end) / 600;
  }
}
export function tenantClock(
  tenant: { timezone: string; demo_offset_minutes: number },
  now = Date.now(),
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tenant.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now + tenant.demo_offset_minutes * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    seconds:
      Number(get("hour")) * 3600 +
      Number(get("minute")) * 60 +
      Number(get("second")),
  };
}
export function cutoffLocked(seconds: number, cutoff: string) {
  const [h, m] = cutoff.split(":").map(Number);
  return seconds >= h * 3600 + m * 60;
}
export function splitFee(amount: number, pct: number) {
  const commission = Math.round(amount * pct) / 100;
  return { commission, net: Math.round((amount - commission) * 100) / 100 };
}
