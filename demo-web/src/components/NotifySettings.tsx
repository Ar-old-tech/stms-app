import { useEffect, useState } from "react";
import { useStore } from "../store";
import { request } from "../api";
export function NotifySettings() {
  const { session, act, pending } = useStore();
  const [providers, setProviders] = useState<
      { name: string; channel: string; status: string }[]
    >([]),
    [result, setResult] = useState("");
  useEffect(() => {
    let active = true;
    void request<typeof providers>(session.token, "/admin/notify/status")
      .then((r) => {
        if (active) setProviders(r);
      })
      .catch(() => {
        if (active) setResult("Provider status unavailable");
      });
    return () => {
      active = false;
    };
  }, [session.token]);
  return (
    <section>
      <h3>Emergency message providers</h3>
      <p>In-app alerts always work independently of external channels.</p>
      {providers.map((p) => (
        <div className="notice" key={p.name}>
          <strong>{p.name}</strong>
          <p>{p.status}</p>
          <button
            disabled={pending > 0}
            onClick={async () => {
              const r = await act("/admin/notify/test", { channel: p.channel });
              if (r)
                setResult(
                  `${p.channel}: ${r.status.toLowerCase().replaceAll("_", " ")}${r.error ? ` · ${r.error}` : ""}`,
                );
            }}
          >
            Send test message
          </button>
        </div>
      ))}
      <p role="status">{result}</p>
      <small>
        Tests go only to your configured admin phone. Provider acceptance does
        not confirm handset delivery.
      </small>
    </section>
  );
}
