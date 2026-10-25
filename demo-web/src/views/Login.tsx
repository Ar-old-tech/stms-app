import { useState } from "react";
import { request } from "../api";
import type { Session } from "../model";
import { Registration } from "../components/Registration";
export function Logo() {
  return (
    <svg
      width="42"
      height="48"
      viewBox="0 0 42 48"
      fill="none"
      aria-label="STMS van pin"
    >
      <path
        d="M21 45S3 29 3 19a18 18 0 0 1 36 0c0 10-18 26-18 26Z"
        stroke="#21dcf5"
        strokeWidth="2"
      />
      <rect x="11" y="11" width="20" height="18" rx="4" fill="#21dcf5" />
      <path d="M15 15h12v7H15z" fill="#07121c" />
      <circle cx="15" cy="27" r="2" fill="white" />
      <circle cx="27" cy="27" r="2" fill="white" />
    </svg>
  );
}
export default function Login({
  onLogin,
  demoEnabled,
}: {
  onLogin: (s: Session) => void;
  demoEnabled: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(customId: string, password: string) {
    setBusy(true);
    setError("");
    try {
      const session = await request<Session>(undefined, "/auth/login", {
        customId,
        password,
      });
      if ("Notification" in window && Notification.permission === "default")
        void Notification.requestPermission().catch(() => {});
      onLogin(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="login-story">
        <Logo />
        <small>SMART TRANSPORT MANAGEMENT SYSTEM</small>
        <h1>
          Every journey.
          <br />
          <em>Someone’s world.</em>
        </h1>
        <p>
          Real connections. Safer journeys. Your driver’s phone connects the
          first pickup to the last mile.
        </p>
        <div className="login-metrics">
          <span>
            Live<small>Phone GPS</small>
          </span>
          <span>
            Secure<small>Tenant accounts</small>
          </span>
          <span>
            One<small>Connected journey</small>
          </span>
        </div>
      </div>
      <div className="login-form">
        <small>WELCOME TO STMS</small>
        <h2>Your journey starts here.</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void login(String(f.get("id")), String(f.get("password")));
          }}
        >
          <label>
            Login identifier
            <input
              name="id"
              autoComplete="username"
              placeholder="e.g. STU-2026-44"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? "Signing in…" : "Sign in →"}
          </button>
        </form>
        {demoEnabled && (
          <>
            <div className="divider">
              SEEDED DEMO ACCOUNTS · REAL SERVER LOGIN
            </div>
            <div className="demo-cards">
              {[
                ["Driver", "DRV-4821"],
                ["Parent", "STU-2026-44"],
                ["Admin", "SCH-01-ADM"],
                ["Super Admin", "SUP-01"],
              ].map(([role, id]) => (
                <button
                  key={id}
                  disabled={busy}
                  onClick={() => void login(id, "demo123")}
                >
                  <strong>{role}</strong>
                  <small>{id} →</small>
                </button>
              ))}
            </div>
          </>
        )}
        <details>
          <summary>Register as a driver</summary>
          <small>
            Your institution provides its tenant ID. Approval is required before
            driving.
          </small>
          <Registration
            publicRegistration
            submit={(f) => request(undefined, "/drivers/register", f)}
          />
        </details>
        <small>
          Forgot your password? Ask your institution administrator to reset it.
        </small>
        <small>
          Location and alert permissions are optional until you start driving.
          Payments are clearly labelled SANDBOX.
        </small>
      </div>
    </div>
  );
}
