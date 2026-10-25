import { Navigation, Check, Flag } from "lucide-react";
import { useStore } from "../store";
import { LiveMap } from "../components/LiveMap";
import { Panel, Chip, Emergency, Inbox } from "../components/UI";
import { Registration } from "../components/Registration";
export default function Driver() {
  const state = useStore(),
    s = state.data;
  if (!s) return null;
  const d = s.drivers.find((x) => x.id === state.session.user.userId),
    trip = s.trip,
    next = s.route.stops[0];
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
          {d?.name ?? state.session.user.name} · {d?.reg ?? "No vehicle"}
        </span>
        <Chip>{d?.status ?? "PENDING"}</Chip>
      </div>
      <LiveMap />
      <Panel title="Driver phone GPS">
        <label>
          Location source
          <select
            aria-label="Location source"
            value={state.tracking.mode}
            onChange={(e) =>
              state.setTracking({
                mode: e.target.value as "phone" | "bot" | "off",
              })
            }
          >
            <option value="phone">Phone GPS · real location</option>
            {s.demoEnabled && <option value="bot">SIMULATED driver bot</option>}
            <option value="off">Tracking paused</option>
          </select>
        </label>
        <small>{state.tracking.status}</small>
        <small>
          {state.tracking.queued} buffered points · screen wake lock requested
          during active phone tracking
        </small>
      </Panel>
      <div
        className={`speedometer ${(trip?.speed ?? 0) > 60 ? "over-speed" : ""}`}
      >
        <div className="gauge">
          <strong>{Math.round(trip?.speed ?? 0)}</strong>
          <small>KM/H</small>
        </div>
        <div>
          <small>
            {trip?.status.replaceAll("_", " ") ?? "NO TRIP ASSIGNED"}
          </small>
          <h3>
            {(trip?.speed ?? 0) > 60
              ? "Slow down. Stay safe."
              : "Every journey matters."}
          </h3>
          <small>
            {s.route.stops.length} stops remaining · {s.route.source}
          </small>
        </div>
      </div>
      {trip?.simulated && <Chip>SIMULATED GPS · BOT</Chip>}
      {trip?.status === "IDLE" ? (
        <button
          className="primary wide large"
          disabled={state.pending > 0 || d?.status !== "VERIFIED"}
          onClick={() => void state.act(`/trips/${trip.id}/start`, {})}
        >
          <Navigation size={18} /> Start morning trip
        </button>
      ) : trip?.status === "ARRIVED" ? (
        <button
          className="primary wide large"
          disabled={state.pending > 0}
          onClick={() => void state.act(`/trips/${trip.id}/end`, {})}
        >
          <Flag size={18} /> Dropped at institution
        </button>
      ) : trip?.status === "COMPLETED" ? (
        <div className="notice">
          Journey complete. Students delivered safely ✓
        </div>
      ) : trip?.status === "IN_PROGRESS" ? (
        <Panel title="Up next">
          <strong>{next?.stop ?? "Institution campus"}</strong>
          <p>{next?.name ?? "Destination · 150 m geofence"}</p>
          {next && (
            <div className="actions">
              {["Arrived", "Picked up", "No-show"].map((status) => (
                <button
                  key={status}
                  className={status === "Picked up" ? "primary" : ""}
                  disabled={state.pending > 0}
                  onClick={() =>
                    void state.act(
                      `/trips/${trip.id}/stops/${next.id}/status`,
                      { status },
                    )
                  }
                >
                  {status === "Picked up" && <Check size={15} />} {status}
                </button>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        <Panel title="Your journey">
          <p>
            No trip assigned. Ask your administrator to assign your verified
            account to a route.
          </p>
        </Panel>
      )}
      <Panel title="Your optimized route">
        {trip?.status === "IDLE" ? (
          <p>
            Start the trip to receive Going students and their pickup locations.
          </p>
        ) : (
          <ol className="stop-list">
            {s.route.stops.map((x) => (
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
                Institution campus<small>Final destination · fixed</small>
              </span>
              <Flag size={15} />
            </li>
          </ol>
        )}
      </Panel>
      <Inbox />
      <Emergency />
      {d?.status !== "VERIFIED" && (
        <Panel
          title={
            d?.status === "REJECTED"
              ? "Update and resubmit documents"
              : "Driver document submission"
          }
        >
          {d?.reason && <div className="notice error">{d.reason}</div>}
          <Registration
            driver={d}
            submit={(f) => state.act("/drivers/register", f)}
          />
        </Panel>
      )}
    </>
  );
}
