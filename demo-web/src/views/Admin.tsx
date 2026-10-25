import { useState } from "react";
import { useStore, uid } from "../store";
import { tenantId, places } from "../seed";
import { Panel, Chip, Inbox, money, Counter } from "../components/UI";
import { LiveMap } from "../components/LiveMap";
export default function Admin({ demoStep = -1 }: { demoStep?: number }) {
  const s = useStore();
  const defaultTab =
    demoStep === 0
      ? "Drivers"
      : demoStep === 3 || demoStep === 6
        ? "Alerts"
        : demoStep === 7
          ? "Fees"
          : "Overview";
  const [selection, setSelection] = useState({
    step: demoStep,
    tab: defaultTab,
  });
  const tab = selection.step === demoStep ? selection.tab : defaultTab;
  const setTab = (tab: string) => setSelection({ step: demoStep, tab });
  const [csv, setCsv] = useState("");
  const [error, setError] = useState("");
  const drivers = s.drivers.filter((x) => x.tenantId === tenantId);
  const students = s.students.filter((x) => x.tenantId === tenantId);
  const fees = s.fees.filter((x) => x.tenantId === tenantId);
  const sos = s.sos.filter((x) => x.tenantId === tenantId);
  const [reason, setReason] = useState<Record<string, string>>({});
  function importCsv() {
    const rows = csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(",").map((x) => x.trim()));
    if (
      !rows.length ||
      rows.some(
        (r) => r.length !== 2 || !r[0] || !places.some((p) => p.name === r[1]),
      )
    ) {
      setError(
        "Use name,stop headers and a known local stop. No rows imported.",
      );
      return;
    }
    s.update((d) =>
      rows.forEach((r) => {
        const id = `STU-2026-${uid()}`;
        d.students.push({
          id,
          tenantId,
          name: r[0],
          stop: r[1],
          point: places.find((p) => p.name === r[1])!.point,
          going: true,
          boarded: false,
          visit: "Waiting",
        });
        d.fees.push({
          id: uid(),
          tenantId,
          studentId: id,
          amount: d.settings.fee,
          status: "PENDING",
          receipt: "",
          commission: 0,
          net: 0,
        });
        d.attendanceVersion++;
      }),
    );
    setCsv("");
    setError("");
    s.notify(`${rows.length} students imported · STU IDs issued`, "admin");
  }
  return (
    <>
      <div className="view-heading">
        <div>
          <small>INSTITUTION CONTROL</small>
          <h2>Sunrise, in sync.</h2>
        </div>
        <Chip>Live</Chip>
      </div>
      <small>Sunrise Coaching Center · Driver Pro</small>
      <nav className="tabs">
        {[
          "Overview",
          "Drivers",
          "Students",
          "Fleet",
          "Fees",
          "Alerts",
          "Settings",
        ].map((t) => (
          <button
            className={t === tab ? "selected" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "Overview" && (
        <>
          <div className="kpis">
            {[
              ["Active trips", s.trip.status === "IN_PROGRESS" ? 1 : 0],
              ["Going today", students.filter((x) => x.going).length],
              ["Open SOS", sos.filter((x) => !x.resolved).length],
              [
                "Pending drivers",
                drivers.filter((x) => x.status === "PENDING").length,
              ],
            ].map(([label, n]) => (
              <div className="kpi" key={label}>
                <strong>
                  <Counter value={Number(n)} />
                </strong>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <div className="collected">
            <small>FEES COLLECTED</small>
            <strong>
              {money(
                fees
                  .filter((x) => x.status === "PAID")
                  .reduce((n, f) => n + f.amount, 0),
              )}
            </strong>
            <span>October 2026 ↗</span>
          </div>
          <Panel title="Live fleet">
            <LiveMap />
            <div className="row">
              <span>
                {s.trip.status === "IN_PROGRESS"
                  ? "1 vehicle reporting"
                  : "No active trips"}
              </span>
              <Chip>{s.trip.status}</Chip>
            </div>
          </Panel>
          <Panel title="Operations pulse">
            <p>✓ Live attendance synchronised</p>
            <p>✓ Routes optimized for today’s riders</p>
            <p>
              ◷ {drivers.filter((d) => d.status === "PENDING").length} driver
              applications to review
            </p>
            <button onClick={() => setTab("Drivers")}>
              Review verification queue →
            </button>
          </Panel>
          <Inbox role="admin" />
        </>
      )}
      {tab === "Drivers" &&
        drivers.map((d) => (
          <Panel key={d.id} title={d.name}>
            <div className="row">
              <Chip>{d.status}</Chip>
              {new Date(d.expiry).getTime() - new Date("2026-10-25").getTime() <
                30 * 86400000 && <Chip>Expires within 30 days</Chip>}
            </div>
            <details>
              <summary>Review documents</summary>
              <p>CNIC: {d.cnic}</p>
              <p>
                License: {d.license} · expires {d.expiry}
              </p>
              <p>Vehicle: {d.reg}</p>
              <div className="documents">
                {["CNIC", "License", "Registration"].map((name, i) =>
                  d.photos[i] ? (
                    <img
                      className="document"
                      src={d.photos[i]}
                      alt={`${name} document`}
                      key={name}
                    />
                  ) : (
                    <div className="document-placeholder" key={name}>
                      ▧<br />
                      {name}
                      <small>SYNTHETIC DOCUMENT</small>
                    </div>
                  ),
                )}
              </div>
            </details>
            {d.status === "PENDING" && (
              <>
                <label>
                  Reason for rejection
                  <input
                    value={reason[d.id] ?? ""}
                    onChange={(e) =>
                      setReason({ ...reason, [d.id]: e.target.value })
                    }
                  />
                </label>
                <div className="actions">
                  <button
                    className="primary"
                    onClick={() => s.verify(d.id, true)}
                  >
                    Approve & issue ID
                  </button>
                  <button
                    disabled={!reason[d.id]?.trim()}
                    onClick={() => s.verify(d.id, false, reason[d.id])}
                  >
                    Reject
                  </button>
                </div>
              </>
            )}
            {d.reason && <p>{d.reason}</p>}
            <small>{d.id}</small>
          </Panel>
        ))}
      {tab === "Students" && (
        <>
          <Panel title="Bulk CSV import">
            <small>
              Format: name,stop · use a local place from the sample.
            </small>
            <textarea
              aria-label="Student CSV"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={5}
            />
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Upload student CSV"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
            <button
              onClick={() =>
                setCsv("name,stop\nSara Ahmed,Faizabad\nHamza Khan,H-8")
              }
            >
              Load sample CSV
            </button>
            <button className="primary" onClick={importCsv}>
              Import & issue STU IDs
            </button>
            {error && <p role="alert">{error}</p>}
          </Panel>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student / ID</th>
                  <th>Stop</th>
                  <th>Today</th>
                </tr>
              </thead>
              <tbody>
                {students.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {x.name}
                      <small>{x.id}</small>
                    </td>
                    <td>{x.stop}</td>
                    <td>
                      <Chip>{x.going ? "Going" : "Not Going"}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "Fees" &&
        fees.map((f) => (
          <Panel
            title={
              students.find((x) => x.id === f.studentId)?.name ?? f.studentId
            }
            key={f.id}
          >
            <div className="row">
              <strong>{money(f.amount)}</strong>
              <Chip>{f.status}</Chip>
            </div>
            <p>
              Commission {money(f.commission)} · Net payout {money(f.net)}
            </p>
            {f.status !== "PAID" ? (
              <button onClick={() => s.pay(f.id, true)}>
                Mark as paid (cash)
              </button>
            ) : (
              <details>
                <summary>View receipt</summary>
                <p>
                  {f.receipt} · October 2026 · {money(f.amount)}
                </p>
              </details>
            )}
          </Panel>
        ))}
      {tab === "Alerts" && (
        <>
          <Panel title="SOS inbox">
            {sos.map((x) => (
              <div className="notice" key={x.id}>
                <div className="row">
                  <strong>{x.source}</strong>
                  <Chip>{x.resolved ? "Resolved" : "SOS"}</Chip>
                </div>
                <a href="#live-map">
                  Live location: {x.point.map((n) => n.toFixed(4)).join(", ")}
                </a>
                {!x.resolved && (
                  <button
                    onClick={() =>
                      s.update((d) => {
                        d.sos.find(
                          (y) => y.id === x.id && y.tenantId === tenantId,
                        )!.resolved = true;
                      })
                    }
                  >
                    Resolve SOS
                  </button>
                )}
              </div>
            ))}
          </Panel>
          <Panel title="Admin override requests">
            {s.overrides
              .filter((x) => x.tenantId === tenantId && !x.resolved)
              .map((x) => (
                <div key={x.id}>
                  {students.find((y) => y.id === x.id)?.name}
                  <button
                    onClick={() => {
                      s.attendance(
                        x.id,
                        !students.find((y) => y.id === x.id)!.going,
                        true,
                      );
                      s.update((d) => {
                        d.overrides.find((y) => y.id === x.id)!.resolved = true;
                      });
                    }}
                  >
                    Approve attendance change
                  </button>
                </div>
              ))}
            {!s.overrides.some((x) => !x.resolved) && (
              <small>No pending requests. You’re all caught up.</small>
            )}
          </Panel>
          <Panel title="Over-speed log">
            {s.speedEvents
              .filter((x) => x.tenantId === tenantId)
              .map((x) => (
                <p key={x.id}>
                  <Chip>Warning</Chip> {x.speed} km/h · limit 60
                </p>
              ))}
          </Panel>
          <Panel title="Trip events">
            {s.events
              .filter((x) => x.tenantId === tenantId)
              .map((x) => (
                <p key={x.id}>{x.text}</p>
              ))}
          </Panel>
          <Panel title="Today’s attendance">
            {students.map((x) => (
              <p key={x.id}>
                {x.name} · {x.going ? x.visit : "Absent"}{" "}
                {x.boarded ? "✓ Boarded" : ""}
              </p>
            ))}
          </Panel>
        </>
      )}
      {tab === "Fleet" && (
        <>
          <Panel title="Vehicle & route management">
            {s.routes
              .filter((x) => x.tenantId === tenantId)
              .map((r) => (
                <div key={r.id}>
                  <label>
                    Route name
                    <input
                      value={r.name}
                      onChange={(e) =>
                        s.update((d) => {
                          d.routes.find((x) => x.id === r.id)!.name =
                            e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    Assigned driver
                    <select
                      value={r.driverId}
                      onChange={(e) =>
                        s.update((d) => {
                          d.routes.find((x) => x.id === r.id)!.driverId =
                            e.target.value;
                          d.trip.driverId = e.target.value;
                        })
                      }
                    >
                      {drivers
                        .filter((d) => d.status === "VERIFIED")
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Vehicle
                    <select
                      value={r.vehicleId}
                      onChange={(e) =>
                        s.update((d) => {
                          d.routes.find((x) => x.id === r.id)!.vehicleId =
                            e.target.value;
                        })
                      }
                    >
                      {s.vehicles
                        .filter((x) => x.tenantId === tenantId)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.reg} · {v.capacity} seats
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                s.update((d) =>
                  d.vehicles.push({
                    id: uid(),
                    tenantId,
                    reg: String(f.get("reg")),
                    capacity: Number(f.get("capacity")),
                  }),
                );
                e.currentTarget.reset();
              }}
            >
              <label>
                New vehicle registration
                <input name="reg" required />
              </label>
              <label>
                Capacity
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  max="80"
                  required
                />
              </label>
              <button>Add vehicle</button>
            </form>
            <button
              onClick={() =>
                s.update((d) =>
                  d.routes.push({
                    id: uid(),
                    tenantId,
                    name: "New campus route",
                    driverId: d.trip.driverId,
                    vehicleId: d.vehicles[0].id,
                  }),
                )
              }
            >
              Add route
            </button>
          </Panel>
        </>
      )}
      {tab === "Settings" && (
        <Panel title="Institution settings">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              s.update((d) => {
                d.settings.cutoff = String(f.get("cutoff"));
                d.settings.tripTime = String(f.get("tripTime"));
                d.settings.fee = Number(f.get("fee"));
                d.settings.commission = Number(f.get("commission"));
                d.settings.campus = [
                  Number(f.get("lat")),
                  Number(f.get("lng")),
                ];
              });
              s.notify("Institution settings saved", "admin");
            }}
          >
            {[
              ["cutoff", "Attendance cut-off", s.settings.cutoff, "time"],
              ["tripTime", "Trip start", s.settings.tripTime, "time"],
              ["fee", "Monthly fee (PKR)", s.settings.fee, "number"],
              [
                "commission",
                "Platform commission (%)",
                s.settings.commission,
                "number",
              ],
              ["lat", "Campus latitude", s.settings.campus[0], "number"],
              ["lng", "Campus longitude", s.settings.campus[1], "number"],
            ].map(([name, label, value, type]) => (
              <label key={name}>
                {label}
                <input
                  name={String(name)}
                  type={String(type)}
                  defaultValue={value}
                  step="any"
                  min={type === "number" ? "0" : undefined}
                  max={name === "commission" ? 100 : undefined}
                  required
                />
              </label>
            ))}
            <button className="primary">Save settings</button>
          </form>
        </Panel>
      )}
    </>
  );
}
