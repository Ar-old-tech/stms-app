import { distance } from "./routing";
import type { Point } from "./model";
import { ApiError } from "./api";
export type GpsPoint = {
  point: Point;
  speed: number | null;
  timestamp: number;
  simulated: boolean;
};
export function shouldSend(previous: GpsPoint | null, next: GpsPoint) {
  return (
    !previous ||
    next.timestamp - previous.timestamp >= 5000 ||
    distance(previous.point, next.point) >= 10
  );
}
export class GpsBuffer {
  readonly key: string;
  readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  readonly send: (p: GpsPoint) => Promise<unknown>;
  readonly status: (queued: number, error?: string) => void;
  private points: GpsPoint[] = [];
  private sending = false;
  private stopped = false;
  constructor(
    key: string,
    storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    send: (p: GpsPoint) => Promise<unknown>,
    status: (queued: number, error?: string) => void,
  ) {
    this.key = key;
    this.storage = storage;
    this.send = send;
    this.status = status;
    try {
      const raw = JSON.parse(storage.getItem(key) ?? "[]");
      if (Array.isArray(raw))
        this.points = raw
          .filter(
            (p: any) =>
              Array.isArray(p.point) &&
              p.point.length === 2 &&
              p.point.every(
                (n: unknown) => typeof n === "number" && Number.isFinite(n),
              ) &&
              Number.isFinite(p.timestamp) &&
              p.timestamp > Date.now() - 86400000,
          )
          .slice(-1000);
    } catch {
      /* A corrupt queue must not break tracking. */
    }
    this.status(this.points.length);
  }
  push(point: GpsPoint) {
    if (this.stopped) return;
    this.points.push(point);
    this.points = this.points.slice(-1000);
    this.persist();
  }
  private persist() {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.points));
    } catch {
      /* Keep the in-memory queue if storage is full or unavailable. */
    }
    this.status(this.points.length);
  }
  async flush(online = true) {
    if (this.sending || this.stopped || !online) return;
    this.sending = true;
    try {
      while (this.points.length && !this.stopped) {
        const next = this.points[0];
        try {
          await this.send(next);
          this.points.shift();
          this.persist();
        } catch (e) {
          if (e instanceof ApiError && [400, 409, 410].includes(e.status)) {
            this.points.shift();
            this.persist();
            continue;
          }
          this.status(
            this.points.length,
            e instanceof Error ? e.message : "GPS connection unavailable",
          );
          break;
        }
      }
    } finally {
      this.sending = false;
    }
  }
  stop() {
    this.stopped = true;
  }
  get queued() {
    return this.points.length;
  }
}
