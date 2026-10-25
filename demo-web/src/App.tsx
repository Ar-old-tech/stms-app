import { useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useStore as useZustand } from "zustand";
import { SessionContext, createSession, roleName } from "./store";
import type { SessionStore } from "./store";
import type { Session } from "./model";
import { request } from "./api";
import Driver from "./views/Driver";
import Parent from "./views/Parent";
import Admin from "./views/Admin";
import SuperAdmin from "./views/SuperAdmin";
import Login, { Logo } from "./views/Login";
import { StateBanner, Toast } from "./components/UI";
import "./App.css";
export type Stores = Record<string, SessionStore>;
function Frame({
  store,
  role,
  index,
}: {
  store: SessionStore;
  role: string;
  index: number;
}) {
  const state = useZustand(store);
  return (
    <SessionContext.Provider value={store}>
      <section
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
            {state.data ? (
              role === "Driver" ? (
                <Driver />
              ) : role === "Parent" ? (
                <Parent />
              ) : role === "Admin" ? (
                <Admin />
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
    setStores({ [role]: createSession(session) });
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
      setStores((previous) => {
        const next = { ...previous };
        for (const session of result.sessions) {
          const role = roleName(session.user.role);
          next[role]?.getState().dispose();
          next[role] = createSession(session);
        }
        return next;
      });
      setView("Presenter");
    }
    setBusy(false);
  }
  function logout() {
    Object.values(stores).forEach((s) => s.getState().dispose());
    setStores({});
    setView("Login");
  }
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
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
                  onClick={() => void presenter()}
                >
                  Open Presenter Mode<small>THREE AUTHENTICATED ROLES</small>
                </button>
              )}
            </section>
            <div
              className={
                view === "Presenter" ? "presenter-grid" : "single-role"
              }
            >
              {(view === "Presenter" ? ["Driver", "Parent", "Admin"] : [view])
                .filter((role) => stores[role])
                .map((role, i) => (
                  <Frame
                    role={role}
                    store={stores[role]}
                    index={i}
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
                      DEMO ONLY · helpers use authenticated server endpoints.
                    </small>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        const result = await stores.Admin.getState().act(
                          "/admin/demo/reset",
                          { confirm: "RESET DEMO DATA" },
                        );
                        if (result) await presenter();
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
