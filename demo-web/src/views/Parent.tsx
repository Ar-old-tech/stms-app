import { useState } from "react";
import confetti from "canvas-confetti";
import { MapPin, ArrowUpRight } from "lucide-react";
import { useStore, route } from "../store";
import { tenantId, places } from "../seed";
import { cutoffLocked, distance } from "../routing";
import { LiveMap } from "../components/LiveMap";
import {
  Panel,
  Chip,
  DriverCard,
  Emergency,
  Inbox,
  money,
} from "../components/UI";
export function celebrate() {
  void confetti({
    particleCount: 100,
    spread: 75,
    colors: ["#21dcf5", "#5aefae", "#ffffff"],
    disableForReducedMotion: true,
  });
}
export default function Parent() {
  const s = useStore();
  const student = s.students.find(
    (x) => x.id === "STU-2026-44" && x.tenantId === tenantId,
  )!;
  const fee = s.fees.find(
    (x) => x.studentId === student.id && x.tenantId === tenantId,
  )!;
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState(false);
  const [gateway, setGateway] = useState("JazzCash");
  const locked = cutoffLocked(s.clock, s.settings.cutoff);
  const idx = route(s).stops.findIndex((x) => x.id === student.id);
  const eta =
    idx < 0
      ? null
      : Math.max(
          1,
          Math.ceil(
            route(s)
              .stops.slice(0, idx + 1)
              .reduce(
                (n, x, i, arr) =>
                  n + distance(i ? arr[i - 1].point : s.trip.point, x.point),
                0,
              ) / 600,
          ),
        );
  const setStop = (point: [number, number], name: string) =>
    s.update((d) => {
      const a = d.students.find((x) => x.id === student.id)!;
      a.point = point;
      a.stop = name;
      d.attendanceVersion++;
    });
  return (
    <>
      <div className="view-heading">
        <div>
          <small>PARENT / STUDENT</small>
          <h2>
            Good morning, Ayesha<span>☀</span>
          </h2>
        </div>
        <Chip>Live</Chip>
      </div>
      <LiveMap parent onPick={(p) => setStop(p, "Custom map pin")} />
      <div className="eta-card">
        <div>
          <small>YOUR VAN IS</small>
          <strong>
            {s.trip.status === "IDLE"
              ? "Getting ready"
              : s.trip.status === "ARRIVED" || s.trip.status === "COMPLETED"
                ? "At campus"
                : eta
                  ? `${eta} min away`
                  : student.boarded
                    ? "On the way to campus"
                    : "Skipping your stop"}
          </strong>
        </div>
        <span className="live-dot" />
        <ArrowUpRight />
      </div>
      <DriverCard />
      <Panel title="Today’s journey">
        <div className="row">
          <span>Morning pickup</span>
          <Chip>{student.going ? "Going" : "Not Going"}</Chip>
        </div>
        <div className="segmented">
          <button
            disabled={locked}
            className={student.going ? "selected" : ""}
            onClick={() => s.attendance(student.id, true)}
          >
            ✓ Going
          </button>
          <button
            disabled={locked}
            className={!student.going ? "selected" : ""}
            onClick={() => s.attendance(student.id, false)}
          >
            Not Going
          </button>
        </div>
        <small>
          {locked
            ? `Attendance locked after ${s.settings.cutoff}. Request an admin override.`
            : `You can change your plans until ${s.settings.cutoff}.`}
        </small>
        {locked && (
          <button
            onClick={() => {
              s.update((d) => {
                if (
                  !d.overrides.some((x) => x.id === student.id && !x.resolved)
                )
                  d.overrides.push({
                    id: student.id,
                    tenantId,
                    resolved: false,
                  });
              });
              s.notify("Attendance override requested", "admin");
            }}
          >
            Request admin override
          </button>
        )}
        <label>
          <MapPin size={14} /> Pickup stop
          <input
            aria-label="Search pickup address"
            placeholder="Search your neighbourhood"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <small>Current: {student.stop} · or tap the map</small>
        {search && (
          <div className="search-results">
            {places
              .filter((p) =>
                p.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    setStop(p.point, p.name);
                    setSearch("");
                  }}
                >
                  {p.name}
                </button>
              ))}
          </div>
        )}
      </Panel>
      <Panel title="Transport fee · October 2026">
        <div className="row">
          <strong>{money(fee.amount)}</strong>
          <Chip>{fee.status}</Chip>
        </div>
        {fee.status !== "PAID" ? (
          <button className="primary wide" onClick={() => setSheet(true)}>
            Pay securely <ArrowUpRight size={16} />
          </button>
        ) : (
          <details open>
            <summary>View digital receipt</summary>
            <div className="receipt">
              <strong>Payment successful ✓</strong>
              <p>{fee.receipt}</p>
              <small>
                {student.name} · {money(fee.amount)} · October 2026
              </small>
              <a
                download={`${fee.receipt}.txt`}
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(`STMS RECEIPT\n${fee.receipt}\n${student.name}\n${money(fee.amount)}\nPAID`)}`}
              >
                Download receipt
              </a>
            </div>
          </details>
        )}
      </Panel>
      {sheet && (
        <div
          className="sheet"
          role="dialog"
          aria-label="Simulated payment gateway"
        >
          <h3>Complete your payment</h3>
          <small>DEMO GATEWAY · no money is transferred</small>
          <select
            aria-label="Payment method"
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
          >
            <option>JazzCash</option>
            <option>Easypaisa</option>
          </select>
          <button
            className="primary"
            onClick={() => {
              s.pay(fee.id, true);
              celebrate();
              setSheet(false);
            }}
          >
            Simulate success · {gateway}
          </button>
          <button
            onClick={() => {
              s.pay(fee.id, false);
              setSheet(false);
            }}
          >
            Simulate failure
          </button>
          <button onClick={() => setSheet(false)}>Cancel</button>
        </div>
      )}
      <Inbox role="parent" />
      <Emergency source="Ayesha Khan" />
    </>
  );
}
