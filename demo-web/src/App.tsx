import { SosReceiver } from "./components/Sos";
import { useEffect, useState, useRef } from "react";
import { motion, MotionConfig } from "framer-motion";
import {
  SlidersHorizontal,
  Play,
  Pause,
  SkipForward,
  VolumeX,
  Volume2,
} from "lucide-react";
import { useStore as useZustand } from "zustand";
import { SessionContext, createSession, roleName } from "./store";
import type { SessionStore } from "./store";
import type { Session } from "./model";
import { request } from "./api";
import Driver from "./views/Driver";
import Parent, { celebrate } from "./views/Parent";
import Admin from "./views/Admin";
import SuperAdmin from "./views/SuperAdmin";
import Login, { Logo } from "./views/Login";
import { StateBanner, Toast } from "./components/UI";
import "./App.css";
import { GpsService } from "./components/GpsService";
import { captions, stepDemo, reset, jumpClock, sendGps } from "./presenter";
export type Stores = Record<string, SessionStore>;
function Frame({
  store,
  role,
  index,
  demoStep = -1,
  hidden = false,
}: {
  store: SessionStore;
  role: string;
  index: number;
  demoStep?: number;
  hidden?: boolean;
}) {
  const state = useZustand(store);
  return (
    <SessionContext.Provider value={store}>
      <section
        hidden={hidden}
        className={`role-column ${role === "Admin" && state.data?.sos.some((x) => !x.resolved) ? "sos-pulse" : ""}`}
      >
        <div className="frame-label">
          <span>
            <b>0{index + 1}</b>{" "}
            {role === "Admin"
              ? "THE COMMAND CENTRE"
              : role === "Parent"
                ? "THE PEACE OF MIND"
                : role === "Super Admin"
                  ? "THE PLATFORM"
                  : "THE JOURNEY"}
          </span>
          <small>
            <span className="live-dot" /> AUTHENTICATED
          </small>
        </div>
        <motion.div
          className="phone-frame"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="phone-top">
            <span>STMS / {role.toUpperCase()}</span>
            <span>● ▰</span>
          </div>
          <div className="phone-content" data-role={role}>
            <StateBanner />
            <SosReceiver />
            {state.data ? (
              role === "Driver" ? (
                <Driver />
              ) : role === "Parent" ? (
                <Parent />
              ) : role === "Admin" ? (
                <Admin demoStep={demoStep} />
              ) : (
                <SuperAdmin />
              )
            ) : (
              <div className="panel">
                <h3>
                  {state.loading
                    ? "Connecting to your workspace…"
                    : "Workspace unavailable"}
                </h3>
                <p>
                  {state.error || "Fetching your institution’s data securely."}
                </p>
                <button onClick={() => void state.refresh()}>Retry</button>
              </div>
            )}
          </div>
          <Toast />
          <div className="phone-home" />
        </motion.div>
      </section>
    </SessionContext.Provider>
  );
}
export default function App() {
  const [stores, setStores] = useState<Stores>({}),
    [view, setView] = useState("Login"),
    [demoEnabled, setDemoEnabled] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [controls, setControls] = useState(false);
  const storesRef = useRef<Stores>({});
  const [step, setStep] = useState(-1),
    [playing, setPlaying] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [muted, setMuted] = useState(true);
  function install(next: Stores) {
    storesRef.current = next;
    setStores(next);
  }
  async function replace(sessions: Session[]) {
    const next = { ...storesRef.current };
    for (const session of sessions) {
      const role = roleName(session.user.role);
      next[role]?.getState().dispose();
      next[role] = createSession(session);
    }
    install(next);
    for (const store of Object.values(next)) await store.getState().refresh();
  }
  useEffect(() => {
    void request<{ demoEnabled: boolean }>(undefined, "/config")
      .then((c) => setDemoEnabled(c.demoEnabled))
      .catch(() =>
        setError(
          "Cannot reach the server. Start the backend, then retry signing in.",
        ),
      );
  }, []);
  function loggedIn(session: Session) {
    Object.values(stores).forEach((s) => s.getState().dispose());
    const role = roleName(session.user.role);
    install({ [role]: createSession(session) });
    setView(role);
    setError("");
  }
  async function presenter() {
    const admin = stores.Admin;
    if (!admin) return;
    setBusy(true);
    const result = await admin
      .getState()
      .act<{ sessions: Session[] }>("/admin/demo/presenter-sessions", {});
    if (result) {
      await replace(result.sessions);
      setView("Presenter");
    }
    setBusy(false);
  }
  function logout() {
    Object.values(stores).forEach((s) => s.getState().dispose());
    install({});
    setPlaying(false);
    setStep(-1);
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("stms-gps:")) sessionStorage.removeItem(key);
    setView("Login");
  }
  async function advance() {
    if (busy) return;
    if (step >= 7) {
      setPlaying(false);
      return;
    }
    setBusy(true);
    try {
      await stepDemo(step + 1, () => storesRef.current, replace);
      setStep(step + 1);
      setElapsed(0);
      if (step + 1 === 7) celebrate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "SHOWTIME stopped");
      setPlaying(false);
    } finally {
      setBusy(false);
    }
  }
  async function showtime() {
    setBusy(true);
    setPlaying(false);
    setError("");
    try {
      await reset(storesRef.current, replace);
      setView("Presenter");
      await stepDemo(0, () => storesRef.current, replace);
      setStep(0);
      setElapsed(0);
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "SHOWTIME could not start");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!playing || busy) return;
    const timer = setTimeout(() => {
      if (elapsed >= 8) void advance();
      else setElapsed(elapsed + 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [playing, busy, elapsed, step]);
  async function control(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo action failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        {stores.Driver && (
          <GpsService
            key={stores.Driver.getState().session.token}
            store={stores.Driver}
          />
        )}
        <header className="topbar">
          <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
            <Logo />
            <span>
              STMS<small>CONNECTED JOURNEYS</small>
            </span>
          </a>
          <nav className="role-nav">
            {Object.keys(stores).map((role) => (
              <button
                key={role}
                className={view === role ? "active" : ""}
                onClick={() => setView(role)}
              >
                {role}
              </button>
            ))}
            {stores.Admin && demoEnabled && (
              <button
                disabled={busy}
                className={view === "Presenter" ? "active" : ""}
                onClick={() => void presenter()}
              >
                Presenter
              </button>
            )}
          </nav>
          <div className="top-actions">
            <small>REAL SERVER · LIVE DATA</small>
            <button
              className="icon-button"
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
              onClick={() => {
                setMuted(!muted);
                sessionStorage.setItem("stms-muted", String(!muted));
              }}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button onClick={logout}>
              {view === "Login" ? "Sign in" : "Sign out"}
            </button>
          </div>
        </header>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {view === "Login" ? (
          <Login onLogin={loggedIn} demoEnabled={demoEnabled} />
        ) : (
          <main>
            <section className="hero">
              <div>
                <div className="eyebrow">
                  <span className="live-dot" /> CONNECTED PRODUCT EXPERIENCE{" "}
                  <span className="edition">ISLAMABAD / RAWALPINDI</span>
                </div>
                <h1>
                  Small journeys. <span>Extraordinary peace of mind.</span>
                </h1>
                <p>One van. Every family. Connected to the real server.</p>
              </div>
              {stores.Admin && demoEnabled && (
                <button
                  className="showtime"
                  disabled={busy}
                  onClick={() => void showtime()}
                >
                  <Play size={16} /> SHOWTIME
                  <small>REAL API · ABOUT 90 SEC</small>
                </button>
              )}
            </section>
            {step >= 0 && (
              <div className="showtime-caption">
                <div>
                  <small>
                    REAL API WALKTHROUGH · {step + 1} / 8{" "}
                    {busy ? " · APPLYING…" : ""}
                  </small>
                  <strong>{captions[step]}</strong>
                  <div className="progress">
                    <span
                      style={{ width: `${((step + elapsed / 9) / 8) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="actions">
                  <button
                    aria-label={playing ? "Pause showtime" : "Resume showtime"}
                    disabled={busy}
                    onClick={() => {
                      setPlaying(!playing);
                      if (playing)
                        stores.Driver?.getState().setTracking({ mode: "off" });
                    }}
                  >
                    {playing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button
                    aria-label="Skip to next demo step"
                    disabled={busy || step >= 7}
                    onClick={() => void advance()}
                  >
                    <SkipForward size={15} />
                  </button>
                  <button
                    onClick={() => {
                      setPlaying(false);
                      setStep(-1);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
            <div
              className={
                view === "Presenter" ? "presenter-grid" : "single-role"
              }
            >
              {["Driver", "Parent", "Admin", "Super Admin"]
                .filter((role) => stores[role])
                .map((role, i) => (
                  <Frame
                    hidden={view !== "Presenter" && view !== role}
                    role={role}
                    store={stores[role]}
                    index={i}
                    demoStep={step}
                    key={`${role}:${stores[role].getState().session.token}`}
                  />
                ))}
            </div>
            {stores.Admin && demoEnabled && (
              <section className="controls">
                <button
                  className="control-toggle"
                  onClick={() => setControls(!controls)}
                >
                  <SlidersHorizontal size={16} /> Demo control panel{" "}
                  <span>{controls ? "−" : "+"}</span>
                </button>
                {controls && (
                  <div className="control-body">
                    <small>
                      DEMO ONLY · fake GPS uses the same driver endpoint. Clock
                      changes are server-enforced.
                    </small>
                    <button
                      disabled={busy || !stores.Driver}
                      onClick={() =>
                        stores.Driver?.getState().setTracking({ mode: "bot" })
                      }
                    >
                      Enable SIMULATED driver bot
                    </button>
                    <button
                      disabled={busy || !stores.Driver}
                      onClick={() =>
                        stores.Driver?.getState().setTracking({ mode: "off" })
                      }
                    >
                      Stop driver bot
                    </button>
                    <label>
                      Bot speed
                      <select
                        defaultValue="1"
                        onChange={(e) =>
                          stores.Driver?.getState().setTracking({
                            botRate: Number(e.target.value),
                          })
                        }
                      >
                        {[1, 3, 6].map((n) => (
                          <option key={n} value={n}>
                            {n}× SIMULATED
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void control(() => jumpClock(storesRef.current, 345))
                      }
                    >
                      Before cut-off · 05:45
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void control(() => jumpClock(storesRef.current, 375))
                      }
                    >
                      After cut-off · 06:15
                    </button>
                    <button
                      disabled={busy || !stores.Driver}
                      onClick={() =>
                        void control(() =>
                          sendGps(
                            storesRef.current,
                            storesRef.current.Driver.getState().data!.trip!
                              .point,
                            76,
                          ),
                        )
                      }
                    >
                      Force SIMULATED over-speed
                    </button>
                    <button
                      disabled={busy || !stores.Driver}
                      onClick={() =>
                        void control(async () => {
                          const driver = storesRef.current.Driver;
                          const r = await driver.getState().act("/sos", {
                            tripId: driver.getState().data!.trip!.id,
                            confirmed: true,
                            type: "BREAKDOWN",
                            message:
                              "Demo emergency: vehicle needs assistance.",
                          });
                          if (!r) throw Error(driver.getState().error);
                        })
                      }
                    >
                      Trigger confirmed demo SOS
                    </button>
                    <button
                      disabled={busy || !stores.Driver}
                      onClick={() =>
                        void control(() => {
                          storesRef.current.Driver.getState().setTracking({
                            mode: "off",
                          });
                          const d = storesRef.current.Driver.getState().data!;
                          return sendGps(
                            storesRef.current,
                            d.route.stops[0]?.point ?? d.settings!.campus,
                            20,
                          );
                        })
                      }
                    >
                      Move SIMULATED van near next stop
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await reset(storesRef.current, replace);
                          setStep(-1);
                          setPlaying(false);
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Reset failed",
                          );
                        }
                        setBusy(false);
                      }}
                    >
                      Reset demo data
                    </button>
                  </div>
                )}
              </section>
            )}
            <footer>
              <span>Built around trust. Driven by connection.</span>
              <span>
                STMS © 2026 ·{" "}
                {demoEnabled ? "DEMO HELPERS ENABLED" : "LIVE SERVICE"}
              </span>
            </footer>
          </main>
        )}
      </div>
    </MotionConfig>
  );
}
