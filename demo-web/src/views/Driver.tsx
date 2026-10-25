import { useState } from "react";
import { Navigation, Check, Flag } from "lucide-react";
import { useStore, route, uid } from "../store";
import { tenantId } from "../seed";
import { Panel, Chip, Inbox, Emergency } from "../components/UI";
import { LiveMap } from "../components/LiveMap";
export default function Driver() {
  const s = useStore();
  const [register, setRegister] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const d = s.drivers.find(
    (x) => x.tenantId === tenantId && x.id === s.trip.driverId,
  )!;
  const r = route(s);
  return (
    <>
      <div className="view-heading">
        <div>
          <small>DRIVER CONSOLE</small>
          <h2>Let’s get them there.</h2>
        </div>
        <Navigation color="#21dcf5" />
      </div>
      <div className="row subheading">
        <span>
          {d.name} · {d.reg}
        </span>
        <Chip>{d.status}</Chip>
      </div>
      <LiveMap />
      <div className={`speedometer ${s.trip.speed > 60 ? "over-speed" : ""}`}>
        <div className="gauge">
          <strong>{s.trip.speed}</strong>
          <small>KM/H</small>
        </div>
        <div>
          <small>{s.trip.status.replaceAll("_", " ")}</small>
          <h3>
            {s.trip.speed > 60
              ? "Slow down. Stay safe."
              : s.trip.paused
                ? "You’re at the next stop"
                : "Every journey matters."}
          </h3>
          <small>{r.stops.length} stops remaining · optimized live</small>
        </div>
      </div>
      {s.trip.status === "IDLE" ? (
        <button
          className="primary wide large"
          disabled={d.status !== "VERIFIED"}
          onClick={s.start}
        >
          <Navigation size={18} /> Start morning trip
        </button>
      ) : s.trip.status === "ARRIVED" ? (
        <button
          className="primary wide large"
          onClick={() => s.visit("Dropped at institution")}
        >
          <Flag size={18} /> Dropped at institution
        </button>
      ) : s.trip.status === "COMPLETED" ? (
        <div className="notice">All students delivered. Trip complete ✓</div>
      ) : (
        <Panel title="Up next">
          <strong>{r.stops[0]?.stop ?? "Sunrise Campus"}</strong>
          <p>{r.stops[0]?.name ?? "Destination · 150 m arrival geofence"}</p>
          {r.stops.length > 0 && (
            <div className="actions">
              <button onClick={() => s.visit("Arrived")}>Arrived</button>
              <button className="primary" onClick={() => s.visit("Picked up")}>
                <Check size={16} /> Picked up
              </button>
              <button onClick={() => s.visit("No-show")}>No-show</button>
            </div>
          )}
        </Panel>
      )}
      <Panel title="Your optimized route">
        <ol className="stop-list">
          {r.stops.map((x) => (
            <li key={x.id}>
              <span>
                {x.stop}
                <small>{x.name}</small>
              </span>
              <Chip>{x.visit}</Chip>
            </li>
          ))}
          <li>
            <span>
              Sunrise Campus<small>Final destination · fixed</small>
            </span>
            <Flag size={16} />
          </li>
        </ol>
      </Panel>
      <Inbox role="driver" />
      <Emergency source={d.name} />
      <details open={register}>
        <summary
          onClick={(e) => {
            e.preventDefault();
            setRegister(!register);
          }}
        >
          Driver registration / resubmission
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            s.update((data) => {
              const application = {
                id: applicationId ?? `application-${uid()}`,
                tenantId,
                name: String(f.get("name")),
                cnic: String(f.get("cnic")),
                license: String(f.get("license")),
                expiry: String(f.get("expiry")),
                reg: String(f.get("reg")),
                status: "PENDING",
                reason: "",
                photos,
              };
              const existing = data.drivers.findIndex(
                (x) => x.id === applicationId && x.tenantId === tenantId,
              );
              if (existing >= 0) data.drivers[existing] = application;
              else data.drivers.push(application);
            });
            s.notify("Documents submitted · awaiting admin verification");
            setRegister(false);
            setApplicationId(null);
          }}
        >
          <label>
            Full name
            <input name="name" required />
          </label>
          <label>
            CNIC (synthetic demo data only)
            <input name="cnic" required />
          </label>
          <label>
            License number
            <input name="license" required />
          </label>
          <label>
            License expiry
            <input name="expiry" type="date" required />
          </label>
          <label>
            Vehicle registration
            <input name="reg" required />
          </label>
          {["CNIC", "License", "Vehicle registration"].map((name, i) => (
            <label key={name}>
              {name} photo
              <input
                aria-label={`${name} photo`}
                type="file"
                accept="image/*"
                required
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () =>
                      setPhotos((p) => {
                        const a = [...p];
                        a[i] = String(reader.result);
                        return a;
                      });
                    reader.readAsDataURL(file);
                  }
                }}
              />
              {photos[i] && (
                <img
                  className="document"
                  src={photos[i]}
                  alt={`${name} preview`}
                />
              )}
            </label>
          ))}
          <button className="primary">Submit for verification</button>
        </form>
      </details>
      {s.drivers
        .filter((x) => x.tenantId === tenantId && x.status !== "VERIFIED")
        .map((x) => (
          <div className="notice" key={x.id}>
            {x.name}: <Chip>{x.status}</Chip>
            {x.reason && (
              <>
                <p>{x.reason}</p>
                <button
                  onClick={() => {
                    setApplicationId(x.id);
                    setPhotos(x.photos);
                    setRegister(true);
                  }}
                >
                  Resubmit application
                </button>
              </>
            )}
          </div>
        ))}
    </>
  );
}
