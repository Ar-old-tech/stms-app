import { useState } from "react";
import confetti from "canvas-confetti";
import { ArrowUpRight } from "lucide-react";
import { useStore } from "../store";
import { places } from "../seed";
import { cutoffLocked } from "../routing";
import { LiveMap } from "../components/LiveMap";
import {
  Panel,
  Chip,
  DriverCard,
  Emergency,
  Inbox,
  money,
} from "../components/UI";
import { request } from "../api";
export function celebrate() {
  void confetti({
    particleCount: 100,
    spread: 75,
    colors: ["#21dcf5", "#5aefae", "#ffffff"],
    disableForReducedMotion: true,
  });
}
export default function Parent() {
  const state = useStore(),
    s = state.data;
  const [search, setSearch] = useState(""),
    [sheet, setSheet] = useState<string | null>(null),
    [gateway, setGateway] = useState("JazzCash"),
    [paying, setPaying] = useState(false);
  if (!s?.settings) return null;
  const student = s.students[0],
    trip = s.trip;
  if (!student)
    return (
      <Panel title="Your journey">
        <p>No pickup stop assigned. Contact your administrator.</p>
      </Panel>
    );
  const locked = cutoffLocked(s.clock, s.settings.cutoff);
  const setStop = (point: [number, number], stop: string) =>
    state.act("/students/me/stop", { point, stop }, "PUT");
  async function complete(success: boolean) {
    if (!sheet) return;
    const f = s!.fees.find((x) => x.id === sheet);
    if (!f) return;
    setPaying(true);
    try {
      const session = await state.act(`/fees/${f.id}/pay`, { gateway });
      if (!session) return;
      const signed = await state.act(`/fees/${f.id}/sandbox-complete`, {
        session: session.session,
        success,
      });
      if (!signed) return;
      const response = await fetch(signed.webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-payment-signature": signed.signature,
        },
        body: signed.webhookBody,
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        const b = await response.json();
        throw Error(b.error);
      }
      await state.refresh();
      setSheet(null);
      if (success) celebrate();
    } catch (e) {
      state.reportError(
        e instanceof Error
          ? e.message
          : "Sandbox callback failed. Please retry.",
      );
    } finally {
      setPaying(false);
    }
  }
  return (
    <>
      <div className="view-heading">
        <div>
          <small>PARENT / STUDENT</small>
          <h2>Good morning, {student.name.split(" ")[0]} ☀</h2>
        </div>
        <Chip>Live</Chip>
      </div>
      <LiveMap parent onPick={(p) => void setStop(p, "Custom map pin")} />
      <div className="eta-card">
        <div>
          <small>YOUR VAN IS</small>
          <strong>
            {trip?.status === "ARRIVED" || trip?.status === "COMPLETED"
              ? "At campus"
              : trip?.status === "IN_PROGRESS"
                ? student.boarded
                  ? "On the way to campus"
                  : !student.going
                    ? "Skipping your stop"
                    : trip.eta !== null
                      ? `${Math.max(1, Math.ceil(trip.eta))} min away`
                      : "On its route"
                : "Getting ready"}
          </strong>
        </div>
        <ArrowUpRight />
      </div>
      {trip?.simulated && <Chip>SIMULATED GPS</Chip>}
      <DriverCard />
      <Panel title="Today’s journey">
        <div className="row">
          <span>Morning pickup</span>
          <Chip>{student.going ? "Going" : "Not Going"}</Chip>
        </div>
        <div className="segmented">
          <button
            className={student.going ? "selected" : ""}
            disabled={locked || state.pending > 0}
            onClick={() =>
              void state.act(
                "/students/me/attendance",
                { status: "GOING" },
                "PUT",
              )
            }
          >
            ✓ Going
          </button>
          <button
            className={!student.going ? "selected" : ""}
            disabled={locked || state.pending > 0}
            onClick={() =>
              void state.act(
                "/students/me/attendance",
                { status: "NOT_GOING" },
                "PUT",
              )
            }
          >
            Not Going
          </button>
        </div>
        <small>
          {locked
            ? `Attendance locked after ${s.settings.cutoff} ${s.settings.timezone}.`
            : `Changes allowed until ${s.settings.cutoff} ${s.settings.timezone}.`}
        </small>
        {locked && (
          <button
            disabled={state.pending > 0 || student.overrideRequested}
            onClick={() =>
              void state.act(
                "/students/me/attendance",
                {
                  status: student.going ? "NOT_GOING" : "GOING",
                  requestOverride: true,
                },
                "PUT",
              )
            }
          >
            {student.overrideRequested
              ? "Override requested"
              : "Request admin override"}
          </button>
        )}
        <label>
          Pickup stop
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
                  onClick={async () => {
                    if (await setStop(p.point, p.name)) setSearch("");
                  }}
                >
                  {p.name}
                </button>
              ))}
          </div>
        )}
      </Panel>
      {!s.fees.length && (
        <Panel title="Transport fees">
          <p>No monthly fee record yet.</p>
        </Panel>
      )}
      {s.fees.map((f) => (
        <Panel title={`Transport fee · ${f.month.slice(0, 7)}`} key={f.id}>
          <div className="row">
            <strong>{money(f.amount)}</strong>
            <Chip>{f.status}</Chip>
          </div>
          {f.status === "PAID" ? (
            <details open>
              <summary>View digital receipt</summary>
              <Receipt id={f.id} />
            </details>
          ) : (
            <button className="primary wide" onClick={() => setSheet(f.id)}>
              Pay through SANDBOX <ArrowUpRight size={16} />
            </button>
          )}
        </Panel>
      ))}
      {sheet && (
        <div
          className="sheet"
          role="dialog"
          aria-label="Sandbox payment gateway"
        >
          <h3>Complete your payment</h3>
          <small>SANDBOX · NO REAL MONEY IS TRANSFERRED</small>
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
            disabled={state.pending > 0}
            onClick={() => {
              if (!paying) void complete(true);
            }}
          >
            Sandbox success · {gateway}
          </button>
          <button
            disabled={state.pending > 0}
            onClick={() => {
              if (!paying) void complete(false);
            }}
          >
            Sandbox failure
          </button>
          <button disabled={paying} onClick={() => setSheet(null)}>
            Cancel
          </button>
        </div>
      )}
      <Inbox />
      <Emergency />
    </>
  );
}
export function Receipt({ id }: { id: string }) {
  const { session } = useStore();
  const [error, setError] = useState("");
  async function download() {
    try {
      const r = await request<any>(session.token, `/fees/${id}/receipt`);
      const text = `STMS DIGITAL RECEIPT\n${r.receiptNumber}\n${r.name}\n${money(Number(r.amount))}\n${r.month}\nPaid: ${r.paidAt}\n${r.gatewayRef}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      a.download = `${r.receiptNumber}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Receipt unavailable");
    }
  }
  const { data: s } = useStore(),
    fee = s?.fees.find((x) => x.id === id);
  return (
    <div className="receipt">
      <strong>Payment successful ✓</strong>
      <p>{fee?.receipt}</p>
      <small>{money(fee?.amount ?? 0)} · receipt stored on server</small>
      <button onClick={() => void download()}>Download receipt</button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
