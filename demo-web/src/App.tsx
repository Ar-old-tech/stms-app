import { useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import {
  Play,
  Pause,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  RotateCcw,
} from "lucide-react";
import Driver from "./views/Driver";
import Parent, { celebrate } from "./views/Parent";
import Admin from "./views/Admin";
import SuperAdmin from "./views/SuperAdmin";
import Login, { Logo } from "./views/Login";
import { useStore, route } from "./store";
import { tick, forceSpeed, nearStop } from "./sim";
import { tenantId } from "./seed";
import "./App.css";
import { Toast } from "./components/UI";
const captions = [
  "Admin verifies the driver. Trust becomes visible.",
  "Ayesha changes her plans. Her stop is skipped.",
  "One tap starts a smarter, optimized journey.",
  "Live speed monitoring. Safety in every second.",
  "Five minutes away. Parents know before the van arrives.",
  "Pickup recorded. Safe arrival at the institution.",
  "One SOS. Everyone connected. Admin resolves it.",
  "One payment. Instant receipt. Transparent driver payout.",
];
function perform(step: number) {
  const s = useStore.getState();
  switch (step) {
    case 0:
      s.verify("application-2", true);
      break;
    case 1:
      s.update((d) => {
        d.clock = 20700;
        d.students[0].stop = "Satellite Town";
        d.students[0].point = [33.636, 73.065];
      });
      s.attendance("STU-2026-44", false);
      break;
    case 2:
      s.start();
      break;
    case 3:
      forceSpeed();
      break;
    case 4:
      s.attendance("STU-2026-44", true, true);
      // Bring Ayesha back with an explicit admin override, then demonstrate her alert.
      while (
        route(useStore.getState()).stops[0]?.id !== "STU-2026-44" &&
        route(useStore.getState()).stops.length
      ) {
        s.visit("Arrived");
        s.visit("Picked up");
      }
      nearStop();
      s.update((d) => {
        d.trip.speed = 36;
      });
      break;
    case 5:
      for (let i = 0; i < useStore.getState().students.length; i++) {
        s.visit("Arrived");
        s.visit("Picked up");
      }
      s.update((d) => {
        d.trip.point = d.settings.campus;
        d.trip.paused = false;
      });
      tick();
      break;
    case 6:
      s.emergency("Driver");
      break;
    case 7:
      s.update((d) =>
        d.sos
          .filter((x) => x.tenantId === tenantId)
          .forEach((x) => (x.resolved = true)),
      );
      s.pay("fee-0", true);
      celebrate();
      break;
  }
}
export default function App() {
  const s = useStore();
  const [view, setView] = useState("Presenter");
  const [controls, setControls] = useState(false);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (step >= 0 && !playing) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [step, playing]);
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (elapsed + 1 >= 11) {
        if (step === 7) setPlaying(false);
        else {
          perform(step + 1);
          setStep(step + 1);
        }
        setElapsed(0);
      } else {
        setElapsed(elapsed + 1);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [elapsed, playing, step]);
  useEffect(() => {
    if (s.muted || !s.notifications.length) return;
    try {
      const audio = new AudioContext(),
        osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.connect(gain);
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0.025, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);
      osc.frequency.value = 640;
      osc.start();
      osc.stop(audio.currentTime + 0.2);
      osc.onended = () => void audio.close();
    } catch {
      /* Sound is optional. */
    }
  }, [s.notifications.length, s.muted]);
  const sos = s.sos.some((x) => x.tenantId === tenantId && !x.resolved);
  function showtime() {
    s.reset();
    setView("Presenter");
    setStep(0);
    setElapsed(0);
    setPlaying(true);
    perform(0);
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
            {["Presenter", "Driver", "Parent", "Admin", "Super Admin"].map(
              (v) => (
                <button
                  key={v}
                  className={view === v ? "active" : ""}
                  onClick={() => setView(v)}
                >
                  {v}
                </button>
              ),
            )}
          </nav>
          <div className="top-actions">
            <span className="time">
              {new Date(s.clock * 1000).toISOString().slice(11, 19)}
              <small>PKT · SIMULATED</small>
            </span>
            <button
              className="icon-button"
              aria-label={s.muted ? "Unmute sounds" : "Mute sounds"}
              onClick={() =>
                s.update((d) => {
                  d.muted = !d.muted;
                })
              }
            >
              {s.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button onClick={() => setView("Login")}>Sign in</button>
          </div>
        </header>
        {view === "Login" ? (
          <Login onLogin={setView} />
        ) : (
          <main>
            <section className="hero">
              <div>
                <div className="eyebrow">
                  <span className="live-dot" /> LIVE PRODUCT EXPERIENCE{" "}
                  <span className="edition">ISLAMABAD / RAWALPINDI</span>
                </div>
                <h1>
                  Small journeys. <span>Extraordinary peace of mind.</span>
                </h1>
                <p>One van. Every family. Always connected.</p>
              </div>
              <button className="showtime" onClick={showtime}>
                <Play size={18} fill="currentColor" /> SHOWTIME{" "}
                <small>90 SEC DEMO</small>
              </button>
            </section>
            {step >= 0 && (
              <motion.div
                className="showtime-caption"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div>
                  <small>THE CONNECTED JOURNEY · {step + 1} / 8</small>
                  <strong>{captions[step]}</strong>
                  <div className="progress">
                    <span
                      style={{ width: `${((step + elapsed / 11) / 8) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="actions">
                  <button
                    aria-label={playing ? "Pause showtime" : "Resume showtime"}
                    onClick={() => setPlaying(!playing)}
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    aria-label="Skip to next demo step"
                    onClick={() => {
                      if (step < 7) {
                        perform(step + 1);
                        setStep(step + 1);
                        setElapsed(0);
                      } else setPlaying(false);
                    }}
                  >
                    <SkipForward size={16} />
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
              </motion.div>
            )}
            <div
              className={
                view === "Presenter" ? "presenter-grid" : "single-role"
              }
            >
              {(view === "Presenter"
                ? ["Driver", "Parent", "Admin"]
                : [view]
              ).map((v, i) => (
                <section
                  className={`role-column ${v === "Admin" && sos ? "sos-pulse" : ""}`}
                  key={v}
                >
                  <div className="frame-label">
                    <span>
                      <b>0{i + 1}</b>{" "}
                      {v === "Admin"
                        ? "THE COMMAND CENTRE"
                        : v === "Parent"
                          ? "THE PEACE OF MIND"
                          : "THE JOURNEY"}
                    </span>
                    <small>
                      <span className="live-dot" /> SYNCED
                    </small>
                  </div>
                  <motion.div
                    className="phone-frame"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className="phone-top">
                      <span>
                        STMS /{" "}
                        {v === "Admin"
                          ? "ADMIN"
                          : v === "Parent"
                            ? "FAMILY"
                            : "DRIVE"}
                      </span>
                      <span>● ▰</span>
                    </div>
                    <div className="phone-content" data-role={v}>
                      {v === "Driver" ? (
                        <Driver />
                      ) : v === "Parent" ? (
                        <Parent />
                      ) : v === "Admin" ? (
                        <Admin demoStep={step} />
                      ) : (
                        <SuperAdmin />
                      )}
                    </div>
                    <Toast role={v.toLowerCase()} />
                    <div className="phone-home" />
                  </motion.div>
                </section>
              ))}
            </div>
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
                  <label>
                    Simulation speed
                    <select
                      value={s.speed}
                      onChange={(e) =>
                        s.update((d) => {
                          d.speed = Number(e.target.value);
                        })
                      }
                    >
                      {[1, 3, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}×
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() =>
                      s.update((d) => {
                        d.clock = 20700;
                      })
                    }
                  >
                    Before cut-off · 05:45
                  </button>
                  <button
                    onClick={() =>
                      s.update((d) => {
                        d.clock = 22500;
                      })
                    }
                  >
                    After cut-off · 06:15
                  </button>
                  <button onClick={forceSpeed}>Force over-speed</button>
                  <button onClick={() => s.emergency("Demo control")}>
                    Trigger SOS
                  </button>
                  <button onClick={nearStop}>Move near next stop</button>
                  <button
                    onClick={() => {
                      s.update((d) => {
                        d.students
                          .filter((x) => x.tenantId === tenantId)
                          .forEach((x) => (x.visit = "Picked up"));
                        d.trip.point = d.settings.campus;
                        d.trip.status = "IN_PROGRESS";
                        d.trip.paused = false;
                      });
                      tick();
                    }}
                  >
                    Enter campus geofence
                  </button>
                  <button
                    onClick={() => {
                      s.reset();
                      setStep(-1);
                      setPlaying(false);
                    }}
                  >
                    <RotateCcw size={14} /> Reset demo
                  </button>
                  <small>
                    Route: {route(s).stops.length} active stops · local browser
                    simulation
                  </small>
                </div>
              )}
            </section>
            <footer>
              <span>Built around trust. Driven by connection.</span>
              <span>STMS © 2026 · INTERACTIVE PROTOTYPE</span>
            </footer>
          </main>
        )}
      </div>
    </MotionConfig>
  );
}
