import { describe, it, expect } from "vitest";
import { GpsBuffer, shouldSend } from "./gps";
import type { GpsPoint } from "./gps";
describe("driver GPS reporting", () => {
  const point: GpsPoint = {
    point: [33.6, 73.05],
    speed: 36,
    timestamp: Date.now(),
    simulated: false,
  };
  it("reports at five seconds or ten metres", () => {
    expect(shouldSend(null, point)).toBe(true);
    expect(
      shouldSend(point, { ...point, timestamp: point.timestamp + 1000 }),
    ).toBe(false);
    expect(
      shouldSend(point, { ...point, timestamp: point.timestamp + 5000 }),
    ).toBe(true);
    expect(
      shouldSend(point, {
        ...point,
        point: [33.601, 73.05],
        timestamp: point.timestamp + 1000,
      }),
    ).toBe(true);
  });
  it("buffers offline, restores the scoped queue and flushes in order on reconnect", async () => {
    const values = new Map<string, string>(),
      storage = {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => {
          values.set(k, v);
        },
        removeItem: (k: string) => {
          values.delete(k);
        },
      };
    const sent: number[] = [];
    const buffer = new GpsBuffer(
      "tenant:driver:trip",
      storage,
      async (p) => {
        sent.push(p.timestamp);
      },
      () => {},
    );
    buffer.push(point);
    buffer.push({ ...point, timestamp: point.timestamp + 5000 });
    await buffer.flush(false);
    expect(sent).toHaveLength(0);
    const restored = new GpsBuffer(
      "tenant:driver:trip",
      storage,
      async (p) => {
        sent.push(p.timestamp);
      },
      () => {},
    );
    expect(restored.queued).toBe(2);
    await restored.flush();
    expect(sent).toEqual([point.timestamp, point.timestamp + 5000]);
    expect(restored.queued).toBe(0);
    expect(
      new GpsBuffer(
        "another:tenant:trip",
        storage,
        async () => {},
        () => {},
      ).queued,
    ).toBe(0);
  });
  it("retains failed transmissions for retry", async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const b = new GpsBuffer(
      "scope",
      storage,
      async () => {
        throw Error("Offline");
      },
      () => {},
    );
    b.push(point);
    await b.flush();
    expect(b.queued).toBe(1);
  });
});
