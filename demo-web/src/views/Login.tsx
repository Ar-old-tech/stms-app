import { useState } from "react";
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
}: {
  onLogin: (role: string) => void;
}) {
  const [error, setError] = useState("");
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
          One connected system for the people who matter most. Safer journeys,
          from the first pickup to the last mile.
        </p>
        <div className="login-metrics">
          <span>
            100%<small>Phone-powered</small>
          </span>
          <span>
            0<small>Hardware required</small>
          </span>
          <span>
            Live<small>Peace of mind</small>
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
            const roles: Record<string, string> = {
              "SUP-01": "Super Admin",
              "SCH-01-ADM": "Admin",
              "DRV-4821": "Driver",
              "STU-2026-44": "Parent",
            };
            const role = roles[String(f.get("id")).trim()];
            if (role && f.get("password") === "demo123") onLogin(role);
            else setError("Check your demo identifier and password.");
          }}
        >
          <label>
            Login identifier
            <input name="id" placeholder="e.g. STU-2026-44" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              placeholder="demo123"
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="primary wide">Sign in →</button>
        </form>
        <div className="divider">OR EXPLORE THE DEMO</div>
        <div className="demo-cards">
          {["Driver", "Parent", "Admin", "Super Admin"].map((r, i) => (
            <button key={r} onClick={() => onLogin(r)}>
              <strong>
                {["🚐", "⌖", "▦", "◈"][i]} {r}
              </strong>
              <small>Demo login →</small>
            </button>
          ))}
        </div>
        <button className="wide" onClick={() => onLogin("Presenter")}>
          Open Presenter Mode · all roles together
        </button>
        <small>
          Simulated environment · synthetic identities · no real payments
        </small>
      </div>
    </div>
  );
}
