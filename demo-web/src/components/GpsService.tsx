import { useEffect } from "react";
import { useStore as useZustand } from "zustand";
import type { SessionStore } from "../store";
import { request } from "../api";
import { GpsBuffer, shouldSend } from "../gps";
import type { GpsPoint } from "../gps";
import { distance } from "../routing";
import type { Point } from "../model";
export function GpsService({ store }: { store: SessionStore }) {
  const state = useZustand(store),
    trip = state.data?.trip,
    active = trip?.status === "IN_PROGRESS",
    mode = state.tracking.mode,
    tripId = trip?.id;
  useEffect(() => {
    if (!active || !tripId || mode !== "phone") return;
    let watch: number | undefined,
      previous: GpsPoint | null = null,
      wake: WakeLockSentinel | undefined,
      closed = false;
    const set = (status: string, queued = store.getState().tracking.queued) =>
      store.getState().setTracking({ status, queued });
    const queue = new GpsBuffer(
      `stms-gps:${state.session.user.tenantId}:${state.session.user.userId}:${tripId}`,
      sessionStorage,
      (p) => request(state.session.token, `/trips/${tripId}/telemetry`, p),
      (n, e) => set(e ?? `Phone GPS active · ${n} points buffered`, n),
    );
    const flush = () => void queue.flush(navigator.onLine);
    async function wakeUp() {
      if (
        !closed &&
        document.visibilityState === "visible" &&
        "wakeLock" in navigator
      ) {
        try {
          wake = await navigator.wakeLock.request("screen");
        } catch {
          set("GPS active · keep your screen awake manually");
        }
      }
    }
    void wakeUp();
    const visibility = () => {
      void wakeUp();
      flush();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", flush);
    const interval = setInterval(flush, 5000);
    if (!navigator.geolocation) set("This browser does not support GPS");
    else
      watch = navigator.geolocation.watchPosition(
        (p) => {
          const next: GpsPoint = {
            point: [p.coords.latitude, p.coords.longitude],
            speed:
              p.coords.speed === null
                ? null
                : Math.max(0, p.coords.speed * 3.6),
            timestamp: p.timestamp,
            simulated: false,
          };
          if (shouldSend(previous, next)) {
            previous = next;
            queue.push(next);
            flush();
          }
        },
        (error) =>
          set(
            `GPS permission/location unavailable: ${error.message}. Use HTTPS and allow location, or use the labelled demo bot.`,
          ),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    flush();
    return () => {
      closed = true;
      queue.stop();
      clearInterval(interval);
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", visibility);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      void wake?.release().catch(() => {});
    };
  }, [
    active,
    tripId,
    mode,
    state.session.token,
    state.session.user.tenantId,
    state.session.user.userId,
    store,
  ]);
  useEffect(() => {
    if (!active || !tripId || mode !== "bot") return;
    let busy = false,
      last: Point | undefined;
    store
      .getState()
      .setTracking({ status: "SIMULATED driver bot · authenticated GPS API" });
    const timer = setInterval(async () => {
      if (busy) return;
      const current = store.getState();
      const s = current.data;
      if (!s?.trip || s.trip.status !== "IN_PROGRESS") return;
      const target = s.route.stops[0]?.point ?? s.settings!.campus;
      const from = last ?? s.trip.point;
      const meters = distance(from, target),
        move = Math.min(
          1,
          (10 * current.tracking.botRate) / Math.max(1, meters),
        );
      const next: Point = [
        from[0] + (target[0] - from[0]) * move,
        from[1] + (target[1] - from[1]) * move,
      ];
      last = next;
      busy = true;
      try {
        await request(current.session.token, `/trips/${tripId}/telemetry`, {
          point: next,
          speed: meters < 20 ? 0 : 36 * current.tracking.botRate,
          timestamp: Date.now(),
          simulated: true,
        });
      } catch (e) {
        store.getState().setTracking({
          status: e instanceof Error ? `Bot: ${e.message}` : "Bot disconnected",
        });
      } finally {
        busy = false;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [active, tripId, mode, store]);
  return null;
}
