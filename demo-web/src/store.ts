import { createContext, useContext } from "react";
import { createStore } from "zustand/vanilla";
import { useStore as useZustand } from "zustand";
import { io } from "socket.io-client";
import { request, ApiError } from "./api";
import type { Session, Workspace } from "./model";
export type ClientState = {
  session: Session;
  data: Workspace | null;
  loading: boolean;
  pending: number;
  error: string;
  connected: boolean;
  tracking: {
    mode: "phone" | "bot" | "off";
    status: string;
    queued: number;
    botRate: number;
  };
  setTracking: (value: Partial<ClientState["tracking"]>) => void;
  refresh: () => Promise<void>;
  act: <T = Record<string, any>>(
    path: string,
    body?: unknown,
    method?: string,
  ) => Promise<T | null>;
  clearError: () => void;
  reportError: (message: string) => void;
  dispose: () => void;
};
export function createSession(session: Session) {
  let again = false,
    disposed = false;
  let refreshPromise: Promise<void> | null = null;
  let joinedTrip = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const store = createStore<ClientState>((set, get) => ({
    session,
    data: null,
    loading: true,
    pending: 0,
    error: "",
    connected: false,
    tracking: {
      mode: "phone",
      status: "GPS starts when your trip starts",
      queued: 0,
      botRate: 1,
    },
    setTracking: (value) =>
      set((s) => ({ tracking: { ...s.tracking, ...value } })),
    refresh: async () => {
      if (disposed) return;
      if (refreshPromise) {
        again = true;
        return refreshPromise;
      }
      refreshPromise = (async () => {
        do {
          again = false;
          try {
            const data = await request<Workspace>(session.token, "/workspace");
            if (!disposed) {
              set({ data, loading: false, error: "" });
              if (
                socket.connected &&
                data.trip &&
                ["DRIVER", "STUDENT"].includes(session.user.role) &&
                joinedTrip !== data.trip.id
              ) {
                joinedTrip = data.trip.id;
                socket.emit("joinTrip", data.trip.id);
              }
            }
          } catch (e) {
            if (!disposed)
              set({
                loading: false,
                error: e instanceof Error ? e.message : "Connection failed",
                ...(e instanceof ApiError && e.status === 401
                  ? { data: null }
                  : {}),
              });
          }
        } while (again && !disposed);
      })().finally(() => {
        refreshPromise = null;
      });
      return refreshPromise;
    },
    act: async (path, body, method) => {
      set((s) => ({ pending: s.pending + 1, error: "" }));
      try {
        const result = await request<any>(session.token, path, body, method);
        await get().refresh();
        return result;
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "Request failed" });
        return null;
      } finally {
        set((s) => ({ pending: Math.max(0, s.pending - 1) }));
      }
    },
    clearError: () => set({ error: "" }),
    reportError: (message) => set({ error: message }),
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
      socket.disconnect();
    },
  }));
  const socket = io({
    auth: { token: session.token },
    autoConnect: false,
    reconnection: true,
  });
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void store.getState().refresh(), 100);
  };
  socket.on("connect", () => {
    joinedTrip = "";
    store.setState({ connected: true });
    void store
      .getState()
      .refresh()
      .then(() => {
        const trip = store.getState().data?.trip;
        if (trip && session.user.role !== "ADMIN")
          socket.emit("joinTrip", trip.id);
      });
  });
  socket.on("disconnect", () => store.setState({ connected: false }));
  socket.on("connect_error", () =>
    store.setState({
      connected: false,
      error: "Live connection unavailable. Data will refresh when reconnected.",
    }),
  );
  socket.on("changed", schedule);
  socket.on("route", schedule);
  socket.on("location", (p) => {
    const data = store.getState().data;
    if (data && data.trip && data.trip.id === p.tripId) {
      store.setState({
        data: {
          ...data,
          trip: {
            ...data.trip,
            point: p.point,
            speed: p.speed,
            timestamp: p.timestamp,
            simulated: p.simulated,
            status: p.status,
            eta: data.trip.eta,
          },
          trips: data.trips.map((t) =>
            t.id === p.tripId
              ? {
                  ...t,
                  point: p.point,
                  speed: p.speed,
                  status: p.status,
                  timestamp: p.timestamp,
                }
              : t,
          ),
        },
      });
    }
    schedule();
  });
  socket.on("notification", (n) => {
    if ("Notification" in window && Notification.permission === "granted")
      new Notification("STMS · Connected journeys", {
        body: n.message,
        tag: `stms-${n.id}`,
      });
    schedule();
  });
  socket.connect();
  void store.getState().refresh();
  const polling = setInterval(() => {
    void store.getState().refresh();
  }, 30000);
  const dispose = store.getState().dispose;
  store.setState({
    dispose: () => {
      clearInterval(polling);
      dispose();
    },
  });
  return store;
}
export type SessionStore = ReturnType<typeof createSession>;
export const SessionContext = createContext<SessionStore | null>(null);
export function useStore() {
  const store = useContext(SessionContext);
  if (!store) throw Error("Missing role session");
  return useZustand(store);
}
export const roleName = (role: Session["user"]["role"]) =>
  ({
    ADMIN: "Admin",
    DRIVER: "Driver",
    STUDENT: "Parent",
    SUPER_ADMIN: "Super Admin",
  })[role];
