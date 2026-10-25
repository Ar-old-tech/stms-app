import { useStore, uid } from "../store";
import { Panel, Chip } from "../components/UI";
export default function SuperAdmin() {
  const s = useStore();
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
          <strong>{s.tenants.length}</strong>
          <small>Institutions</small>
        </div>
        <div className="kpi">
          <strong>{s.students.length}</strong>
          <small>Students</small>
        </div>
      </div>
      <Panel title="Connected institutions">
        {s.tenants.map((t) => (
          <div className="tenant-row" key={t.id}>
            <div>
              <strong>{t.name}</strong>
              <small>
                {t.type} · {t.id}
              </small>
            </div>
            <Chip>{t.plan}</Chip>
          </div>
        ))}
      </Panel>
      <Panel title="Onboard an institution">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              id = uid();
            s.update((d) =>
              d.tenants.push({
                id,
                tenantId: id,
                name: String(f.get("name")),
                type: String(f.get("type")),
                plan: String(f.get("plan")),
              }),
            );
            e.currentTarget.reset();
          }}
        >
          <label>
            Institution name
            <input name="name" required />
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
          <button className="primary">Create tenant</button>
        </form>
      </Panel>
    </>
  );
}
