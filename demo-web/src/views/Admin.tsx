import { NotifySettings } from "../components/NotifySettings";
import { Delivery } from "../components/Sos";
import { useState } from "react";
import { useStore } from "../store";
import {
  Panel,
  Chip,
  Inbox,
  Counter,
  money,
  DocumentImage,
} from "../components/UI";
import { LiveMap } from "../components/LiveMap";
import { Registration } from "../components/Registration";
import { Receipt } from "./Parent";
export default function Admin({ demoStep = -1 }: { demoStep?: number }) {
  const state = useStore(),
    s = state.data;
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
    }),
    [csv, setCsv] = useState(""),
    [reason, setReason] = useState<Record<string, string>>({}),
    [credentials, setCredentials] = useState<string>("");
  const tab = selection.step === demoStep ? selection.tab : defaultTab,
    setTab = (tab: string) => setSelection({ step: demoStep, tab });
  if (!s?.settings) return null;
  const settings = s.settings;
  return (
    <>
      <div className="view-heading">
        <div>
          <small>INSTITUTION CONTROL</small>
          <h2>Sunrise, in sync.</h2>
        </div>
        <Chip>Live</Chip>
      </div>
      <small>
        {s.tenants[0]?.name} · {s.tenants[0]?.plan}
      </small>
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
            key={t}
            className={t === tab ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div hidden={tab !== "Overview"}>
        <div className="kpis">
          {[
            [
              "Active trips",
              s.trips.filter((t) => t.status === "IN_PROGRESS").length,
            ],
            ["Going today", s.students.filter((x) => x.going).length],
            ["Open SOS", s.sos.filter((x) => !x.resolved).length],
            [
              "Pending drivers",
              s.drivers.filter((x) => x.status === "PENDING").length,
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
              s.fees
                .filter((x) => x.status === "PAID")
                .reduce((n, x) => n + x.amount, 0),
            )}
          </strong>
          <span>{s.date.slice(0, 7)} ↗</span>
        </div>
        <Panel title="Live fleet">
          <LiveMap />
          <small>
            {s.trips.filter((t) => t.status === "IN_PROGRESS").length} active
            vehicles · scoped to your institution
          </small>
        </Panel>
        <Panel title="Operations pulse">
          <p>✓ Attendance synchronised with the server</p>
          <p>
            ◷ {s.drivers.filter((x) => x.status === "PENDING").length} driver
            applications to review
          </p>
          <button onClick={() => setTab("Drivers")}>
            Review verification queue →
          </button>
        </Panel>
        <Inbox />
      </div>

      {tab === "Drivers" && (
        <>
          {s.drivers.map((d) => (
            <Panel title={d.name} key={d.id}>
              <div className="row">
                <Chip>{d.status}</Chip>
                {d.expiry &&
                  new Date(d.expiry).getTime() - Date.now() < 30 * 86400000 && (
                    <Chip>Expires within 30 days</Chip>
                  )}
              </div>
              <small>{d.customId}</small>
              <details>
                <summary>Review documents</summary>
                <p>CNIC: {d.cnic}</p>
                <p>
                  License: {d.license} · expiry {d.expiry?.slice(0, 10)}
                </p>
                <p>Vehicle: {d.reg}</p>
                <div className="documents">
                  {d.photos.map((url, i) => (
                    <DocumentImage
                      key={`${d.id}-${i}`}
                      url={url}
                      label={["CNIC", "License", "Registration"][i]}
                    />
                  ))}
                </div>
              </details>
              {d.reason && <p>{d.reason}</p>}
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
                      disabled={state.pending > 0}
                      onClick={() =>
                        void state.act(
                          `/admin/drivers/${d.id}/verify`,
                          { approved: true },
                          "PATCH",
                        )
                      }
                    >
                      Approve & issue ID
                    </button>
                    <button
                      disabled={state.pending > 0 || !reason[d.id]?.trim()}
                      onClick={() =>
                        void state.act(
                          `/admin/drivers/${d.id}/verify`,
                          { approved: false, reason: reason[d.id] },
                          "PATCH",
                        )
                      }
                    >
                      Reject
                    </button>
                  </div>
                </>
              )}
            </Panel>
          ))}
          <details>
            <summary>Register a driver</summary>
            <Registration submit={(f) => state.act("/drivers/register", f)} />
          </details>
        </>
      )}
      {tab === "Students" && (
        <>
          <Panel title="Bulk CSV import">
            <small>
              Header: name,stop,latitude,longitude · maximum 200 rows.
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
                setCsv(
                  "name,stop,latitude,longitude\nSara Ahmed,Faizabad,33.659,73.081\nHamza Khan,H-8,33.661,73.056",
                )
              }
            >
              Load sample CSV
            </button>
            <button
              className="primary"
              disabled={state.pending > 0 || !s.routes.length}
              onClick={async () => {
                const r = await state.act("/admin/students/import", {
                  csv,
                  routeId: s.routes[0].id,
                });
                if (r) {
                  setCredentials(
                    r.students
                      .map(
                        (x: any) =>
                          `${x.customId} · initial password: ${x.initialPassword}`,
                      )
                      .join("\n"),
                  );
                  setCsv("");
                }
              }}
            >
              Import & issue STU IDs
            </button>
            {credentials && <pre className="credentials">{credentials}</pre>}
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
                {s.students.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {x.name}
                      <small>{x.customId}</small>
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
          {s.students.map((x) => (
            <details key={x.id}>
              <summary>Manage {x.name}</summary>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await state.act(
                    `/admin/students/${x.id}`,
                    {
                      name: String(f.get("name")),
                      routeId: String(f.get("routeId")),
                      stop: String(f.get("stop")),
                      point: [Number(f.get("lat")), Number(f.get("lng"))],
                    },
                    "PUT",
                  );
                }}
              >
                <label>
                  Name
                  <input name="name" defaultValue={x.name} required />
                </label>
                <label>
                  Stop
                  <input name="stop" defaultValue={x.stop} required />
                </label>
                <label>
                  Latitude
                  <input
                    name="lat"
                    type="number"
                    step="any"
                    defaultValue={x.point[0]}
                    required
                  />
                </label>
                <label>
                  Longitude
                  <input
                    name="lng"
                    type="number"
                    step="any"
                    defaultValue={x.point[1]}
                    required
                  />
                </label>
                <label>
                  Route
                  <select name="routeId" defaultValue={x.routeId}>
                    {s.routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary">Save student</button>
                <button
                  type="button"
                  onClick={() =>
                    void state.act(`/admin/students/${x.id}`, {}, "DELETE")
                  }
                >
                  Delete student
                </button>
              </form>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await state.act(`/admin/users/${x.id}/password`, {
                    password: String(f.get("password")),
                  });
                }}
              >
                <label>
                  Reset password
                  <input
                    name="password"
                    type="password"
                    minLength={8}
                    maxLength={72}
                    required
                  />
                </label>
                <button>Reset student password</button>
              </form>
            </details>
          ))}
        </>
      )}
      {tab === "Fleet" && (
        <>
          <Panel title="Vehicles">
            {[...s.vehicles, { id: "new", reg: "", capacity: 12 }].map((v) => (
              <form
                key={v.id}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await state.act(
                    `/admin/vehicles${v.id === "new" ? "" : `/${v.id}`}`,
                    {
                      reg: String(f.get("reg")),
                      capacity: Number(f.get("capacity")),
                    },
                    v.id === "new" ? "POST" : "PUT",
                  );
                }}
              >
                <label>
                  Vehicle registration
                  <input name="reg" defaultValue={v.reg} required />
                </label>
                <label>
                  Capacity
                  <input
                    name="capacity"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={v.capacity}
                    required
                  />
                </label>
                <button>
                  {v.id === "new" ? "Add vehicle" : "Save vehicle"}
                </button>
                {v.id !== "new" && (
                  <button
                    type="button"
                    onClick={() =>
                      void state.act(`/admin/vehicles/${v.id}`, {}, "DELETE")
                    }
                  >
                    Delete vehicle
                  </button>
                )}
              </form>
            ))}
          </Panel>
          <Panel title="Routes & driver assignment">
            {[
              ...s.routes,
              {
                id: "new",
                name: "",
                driverId:
                  s.drivers.find((d) => d.status === "VERIFIED")?.id ?? "",
                vehicleId: s.vehicles[0]?.id ?? "",
                startTime: settings.tripTime,
                direction: "TO_CAMPUS",
              },
            ].map((r) => (
              <form
                key={r.id}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await state.act(
                    `/admin/routes${r.id === "new" ? "" : `/${r.id}`}`,
                    {
                      name: String(f.get("name")),
                      driverId: String(f.get("driverId")),
                      vehicleId: String(f.get("vehicleId")),
                      startTime: String(f.get("startTime")),
                      direction: String(f.get("direction")),
                    },
                    r.id === "new" ? "POST" : "PUT",
                  );
                }}
              >
                <label>
                  Route name
                  <input name="name" defaultValue={r.name} required />
                </label>
                <label>
                  Assigned driver
                  <select name="driverId" defaultValue={r.driverId}>
                    {s.drivers
                      .filter((d) => d.status === "VERIFIED")
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {d.customId}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Assigned vehicle
                  <select name="vehicleId" defaultValue={r.vehicleId}>
                    {s.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.reg}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start time
                  <input
                    name="startTime"
                    type="time"
                    defaultValue={r.startTime}
                    required
                  />
                </label>
                <label>
                  Direction
                  <select name="direction" defaultValue={r.direction}>
                    <option>TO_CAMPUS</option>
                    <option>FROM_CAMPUS</option>
                  </select>
                </label>
                <button>
                  {r.id === "new" ? "Add route" : "Save assignment"}
                </button>
                {r.id !== "new" && (
                  <button
                    type="button"
                    onClick={() =>
                      void state.act(`/admin/routes/${r.id}`, {}, "DELETE")
                    }
                  >
                    Delete route
                  </button>
                )}
              </form>
            ))}
          </Panel>
        </>
      )}
      {tab === "Fees" && (
        <>
          <button
            disabled={state.pending > 0}
            onClick={() => void state.act("/admin/fees/generate", {})}
          >
            Generate monthly Pending fees
          </button>
          {s.fees.map((f) => (
            <Panel
              title={`${s.students.find((x) => x.id === f.studentId)?.name ?? f.studentId} · ${f.month.slice(0, 7)}`}
              key={f.id}
            >
              <div className="row">
                <strong>{money(f.amount)}</strong>
                <Chip>{f.status}</Chip>
              </div>
              <p>
                Commission {money(f.commission)} · Net payout {money(f.net)}
              </p>
              {f.status === "PAID" ? (
                <details>
                  <summary>View receipt</summary>
                  <Receipt id={f.id} />
                </details>
              ) : (
                <button
                  disabled={state.pending > 0}
                  onClick={() => void state.act(`/admin/fees/${f.id}/paid`, {})}
                >
                  Mark as paid (cash)
                </button>
              )}
            </Panel>
          ))}
        </>
      )}
      {tab === "Alerts" && (
        <>
          <Panel title="SOS inbox">
            {s.sos.length ? (
              s.sos.map((x) => (
                <div className="notice" key={x.id}>
                  <div className="row">
                    <strong>{x.source}</strong>
                    <Chip>{x.status ?? (x.resolved ? "Resolved" : "SOS")}</Chip>
                  </div>
                  <p>
                    <strong>{x.type}</strong> {x.message}
                  </p>
                  <p>
                    Acknowledged by:{" "}
                    {x.acknowledged_name ?? "Awaiting acknowledgement"}
                  </p>
                  <Delivery event={x} />
                  <small>
                    Location: {x.point.map((n) => n?.toFixed(4)).join(", ")}
                  </small>
                  {!x.resolved && (
                    <button
                      disabled={state.pending > 0}
                      onClick={() =>
                        void state.act(
                          `/admin/sos/${x.id}`,
                          { resolved: true },
                          "PATCH",
                        )
                      }
                    >
                      Resolve SOS
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p>No emergency alerts.</p>
            )}
          </Panel>
          <Panel title="Admin override requests">
            {s.overrides.length ? (
              s.overrides.map((x) => (
                <div key={x.id}>
                  <p>
                    {s.students.find((y) => y.id === x.id)?.name} · {x.status}
                  </p>
                  <button
                    onClick={() =>
                      void state.act(`/admin/attendance/${x.id}/override`, {
                        approve: true,
                      })
                    }
                  >
                    Approve attendance change
                  </button>
                  <button
                    onClick={() =>
                      void state.act(`/admin/attendance/${x.id}/override`, {
                        approve: false,
                      })
                    }
                  >
                    Decline
                  </button>
                </div>
              ))
            ) : (
              <small>No pending requests. You’re all caught up.</small>
            )}
          </Panel>
          <Panel title="Over-speed log">
            {s.speedEvents.length ? (
              s.speedEvents.map((x) => (
                <p key={x.id}>
                  <Chip>Warning</Chip> {Math.round(x.speed)} km/h · limit 60
                </p>
              ))
            ) : (
              <p>No over-speed events.</p>
            )}
          </Panel>
          <Panel title="Trip events">
            {s.events.map((x) => (
              <p key={x.id}>{x.text}</p>
            ))}
          </Panel>
          <Panel title="Today’s attendance">
            {s.students.map((x) => (
              <p key={x.id}>
                {x.name} · {x.going ? x.visit : "Absent"}{" "}
                {x.boarded ? "✓ Boarded" : ""}
              </p>
            ))}
          </Panel>
          <Inbox />
        </>
      )}
      {tab === "Settings" && (
        <Panel title="Institution settings">
          <NotifySettings />
          <form
            key={JSON.stringify(settings)}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await state.act(
                "/admin/settings",
                {
                  cutoff: String(f.get("cutoff")),
                  tripTime: String(f.get("tripTime")),
                  campus: [Number(f.get("lat")), Number(f.get("lng"))],
                  fee: Number(f.get("fee")),
                  commission: Number(f.get("commission")),
                  ...(s.demoEnabled
                    ? { demoOffsetMinutes: Number(f.get("offset")) }
                    : {}),
                },
                "PUT",
              );
            }}
          >
            {[
              ["cutoff", "Attendance cut-off", settings.cutoff, "time"],
              ["tripTime", "Trip start", settings.tripTime, "time"],
              ["lat", "Campus latitude", settings.campus[0], "number"],
              ["lng", "Campus longitude", settings.campus[1], "number"],
              ["fee", "Monthly fee (PKR)", settings.fee, "number"],
              [
                "commission",
                "Platform commission (%)",
                settings.commission,
                "number",
              ],
            ].map(([key, label, value, type]) => (
              <label key={key}>
                {label}
                <input
                  name={String(key)}
                  type={String(type)}
                  defaultValue={value}
                  step="any"
                  required
                />
              </label>
            ))}
            <small>
              Timezone: {settings.timezone} · cut-off enforced on the server
            </small>
            {s.demoEnabled && (
              <label>
                DEMO ONLY · server time offset (minutes)
                <input
                  name="offset"
                  type="number"
                  min={-1440}
                  max={1440}
                  defaultValue={settings.demoOffsetMinutes}
                />
              </label>
            )}
            <button className="primary" disabled={state.pending > 0}>
              Save settings
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}
