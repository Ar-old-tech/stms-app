import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useStore } from "../store";
import { tenantId } from "../seed";
export const money = (n: number) => `PKR ${n.toLocaleString()}`;
export function Chip({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`chip ${(tone ?? String(children)).toLowerCase().replaceAll(" ", "-")}`}
    >
      {children}
    </span>
  );
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
export function Emergency({ source }: { source: string }) {
  const [confirm, setConfirm] = useState(false);
  const s = useStore();
  return (
    <div className="emergency">
      <button className="danger" onClick={() => setConfirm(!confirm)}>
        <TriangleAlert size={16} /> Emergency SOS
      </button>
      {confirm && (
        <div role="alert">
          <p>Send your live location to admin and all parents on this trip?</p>
          <button
            className="danger"
            onClick={() => {
              s.emergency(source);
              setConfirm(false);
            }}
          >
            Confirm emergency
          </button>
          <button onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
export function DriverCard() {
  const s = useStore();
  const d = s.drivers.find(
    (x) => x.tenantId === tenantId && x.id === s.trip.driverId,
  );
  return (
    <div className="driver-card">
      <div className="avatar">
        {d?.name
          .split(" ")
          .map((x) => x[0])
          .join("")}
      </div>
      <div>
        <strong>{d?.name ?? "Driver unassigned"}</strong>
        <small>{d?.reg} · Your transport partner</small>
      </div>
      <Chip tone={d?.status === "VERIFIED" ? "verified" : "pending"}>
        <ShieldCheck size={13} />
        {d?.status === "VERIFIED" ? "Verified" : "Pending"}
      </Chip>
    </div>
  );
}
export function Counter({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const progress = reduced ? 1 : Math.min(1, (now - start) / 500);
      setShown(Math.round(from + (value - from) * progress));
      if (progress < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}
export function Toast({ role }: { role: string }) {
  const s = useStore();
  const [dismissed, setDismissed] = useState("");
  const n = s.notifications.find(
    (x) =>
      x.tenantId === tenantId &&
      (x.role === "all" || x.role === role) &&
      (!x.studentId || role !== "parent" || x.studentId === "STU-2026-44"),
  );
  const notificationId = n?.id;
  useEffect(() => {
    if (!notificationId) return;
    const id = setTimeout(() => setDismissed(notificationId), 7000);
    return () => clearTimeout(id);
  }, [notificationId]);
  if (!n || n.id === dismissed) return null;
  return (
    <div className="floating-toast" role="status">
      <small>{role.toUpperCase()} · INCOMING UPDATE</small>
      <span>{n.text}</span>
      {n.link && <a href={n.link}>Live location →</a>}
      <button
        aria-label="Dismiss notification"
        onClick={() => setDismissed(n.id)}
      >
        ×
      </button>
    </div>
  );
}
export function Inbox({ role }: { role: string }) {
  const s = useStore();
  return (
    <div className="inbox" aria-live="polite">
      {s.notifications
        .filter(
          (x) =>
            x.tenantId === tenantId &&
            (x.role === "all" || x.role === role) &&
            (role !== "parent" ||
              !x.studentId ||
              x.studentId === "STU-2026-44"),
        )
        .slice(0, 3)
        .map((x) => (
          <div className="notice" key={x.id}>
            {x.text}
            {x.link && <a href={x.link}>View live location →</a>}
          </div>
        ))}
    </div>
  );
}
