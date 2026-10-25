import { useState } from "react";
import { useStore } from "../store";
import { Panel, Chip, Counter } from "../components/UI";
export default function SuperAdmin() {
  const state = useStore(),
    s = state.data;
  const [created, setCreated] = useState("");
  if (!s) return null;
  return (
    <>
      <div className="view-heading">
        <div>
          <small>PLATFORM OVERVIEW</small>
          <h2>A safer way forward.</h2>
        </div>
        <Chip>Super Admin</Chip>
      </div>
      <div className="kpis">
        <div className="kpi">
          <strong>
            <Counter value={s.tenants.length} />
          </strong>
          <small>Institutions</small>
        </div>
      </div>
      <Panel title="Connected institutions">
        {s.tenants.map((t) => (
          <div className="tenant-row" key={t.id}>
            <div>
              <strong>{t.name}</strong>
              <small>
                {t.type} · tenant {t.id}
              </small>
            </div>
            <Chip>{t.plan}</Chip>
          </div>
        ))}
      </Panel>
      <Panel title="Onboard an institution">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const r = await state.act("/tenants", {
              name: String(f.get("name")),
              email: String(f.get("email")),
              type: String(f.get("type")),
              plan: String(f.get("plan")),
              adminName: String(f.get("adminName")),
              adminPassword: String(f.get("password")),
            });
            if (r)
              setCreated(
                `Institution created · administrator login ${r.adminCustomId}`,
              );
          }}
        >
          <label>
            Institution name
            <input name="name" required />
          </label>
          <label>
            Contact email
            <input name="email" type="email" required />
          </label>
          <label>
            Institution type
            <select name="type">
              {["SCHOOL", "COLLEGE", "UNIVERSITY", "COACHING"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Plan
            <select name="plan">
              {["Free", "Driver Pro", "Institute", "Enterprise"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Administrator name
            <input name="adminName" required />
          </label>
          <label>
            Administrator initial password
            <input
              name="password"
              type="password"
              minLength={8}
              maxLength={72}
              required
            />
          </label>
          <button className="primary" disabled={state.pending > 0}>
            Create tenant
          </button>
          {created && <div className="notice">{created}</div>}
        </form>
      </Panel>
    </>
  );
}
