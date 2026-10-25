import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Retire the old simulated-demo cache. Authenticated API responses are never cached.
if('serviceWorker' in navigator)void navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.map(r=>r.unregister()))).catch(()=>{});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
