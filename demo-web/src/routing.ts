import type { Point } from "./seed";
export function distance(a: Point, b: Point) {
  const r = Math.PI / 180;
  const dlat = (b[0] - a[0]) * r,
    dlng = (b[1] - a[1]) * r;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(dlat / 2) ** 2 +
          Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dlng / 2) ** 2,
      ),
    )
  );
}
export function orderStops<T extends { point: Point }>(
  start: Point,
  stops: T[],
  end: Point,
) {
  const remaining = [...stops],
    ordered: T[] = [];
  let p = start;
  while (remaining.length) {
    remaining.sort((a, b) => distance(p, a.point) - distance(p, b.point));
    const s = remaining.shift()!;
    ordered.push(s);
    p = s.point;
  }
  return { stops: ordered, line: [start, ...ordered.map((s) => s.point), end] };
}
export function cutoffLocked(clock: number, cutoff: string) {
  const [h, m] = cutoff.split(":").map(Number);
  return clock >= h * 3600 + m * 60;
}
export function feeSplit(amount: number, pct: number) {
  const commission = Math.round(amount * pct) / 100;
  return { commission, net: Math.round((amount - commission) * 100) / 100 };
}
export function shouldAlert(eta: number, key: string, seen: string[]) {
  return eta <= 5 && eta >= 0 && !seen.includes(key);
}
