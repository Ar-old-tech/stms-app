# STMS · Connected Journeys

A browser-only, shared-state presentation prototype for the STMS MVP. Production backend, Flutter and infrastructure files are untouched. All identities, documents, GPS, alerts and payments are simulated. Do not enter real identity documents.

## Run

Use Node 24 (tested with 24.21.0) and npm 11.

```sh
cd demo-web
npm install
npm run dev
```

Open the local URL printed by Vite. Presenter Mode is the default. All four role logins use `demo123`: `SUP-01`, `SCH-01-ADM`, `DRV-4821`, `STU-2026-44`. Demo login cards bypass typing.

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

For offline reloads use `npm run build` then `npm run preview`. Open the preview URL once online to install the local app-shell cache. After that, the app reloads without network. Only map tiles are external; the grid takes over when unavailable. Google Fonts are bundled locally through Fontsource. The running dev app also works with the network disconnected, but a fresh dev-page load requires its local Vite server.

## Two-minute presenter guide

- **0:00–0:10:** Open Presenter Mode at 1920 px, browser zoom 80–100% depending on the projector. Point out the three independently scrollable frames: driver, parent, admin. They share a single live state. Click **SHOWTIME** for an 88-second walkthrough. Pause/resume or skip captions using the overlay controls.
- **0:10–0:25:** Admin approves Usman. His random driver ID and green Verified badge immediately appear on the parent’s driver card. Synthetic documents and license expiry are reviewable in Admin → Drivers.
- **0:25–0:40:** Ayesha chooses Satellite Town and marks Not Going before 06:00. Start the trip: her stop disappears from the driver route. SHOWTIME explicitly restores Going with an admin override for the later proximity-alert demonstration.
- **0:40–0:55:** The vehicle moves; a 76 km/h spike turns the gauge red and appears in Admin → Alerts. At 1×, physical travel is compressed eightfold to make the city route demoable. The simulation runs once each second.
- **0:55–1:10:** The van approaches Ayesha; her five-minute notification appears once for this trip and stop. Arrived/Picked up events record boarding. The 150 m campus geofence switches the trip to Arrived. The driver can then tap Dropped at institution.
- **1:10–1:25:** SOS reaches admin and parents with a live-location link. The admin frame pulses red. Resolve it in Alerts. SHOWTIME resolves it on the final beat.
- **1:25–1:40:** Simulated payment produces confetti, receipt number, downloadable text receipt, and an updated admin ledger. PKR 6,500 at 5% yields PKR 325 commission and PKR 6,175 net driver payout.
- **1:40–2:00:** Open Demo control panel: jump past cut-off, request and approve an attendance override; reset before the next presentation. Show Admin → Students → Load sample CSV, or upload a real two-column CSV. Super Admin creates tenants with type and plan. Sign in opens the role login screen.

## Implementation and assumptions

- One active Sunrise morning pickup trip and one selected child are demonstrated. City College is a separate, empty tenant available in the platform list; there is no City role login. Creating a tenant creates its platform record, not a second preconfigured fleet.
- The demo prompt explicitly selects React/Vite instead of the production stack. No backend/API endpoints, real WebSocket subscriptions, payment gateways, authentication tokens, document storage, or emergency-service dispatch are involved.
- All operational records carry `tenantId`; tenant selectors and mutations enforce Sunrise scope. Platform administrators alone render the cross-tenant list. Student records hold the authoritative pickup stop and daily attendance; `stopsForTenant` and `attendanceForTenant` project those records without duplicating state. `users` holds the seeded login identities.
- All changes are in memory and reset on page reload or Reset demo. The service worker caches code/assets, never identity documents or runtime state.
- The cut-off is inclusive at 06:00. After cut-off, the administrator approves the opposite attendance choice requested by the single-child demo. Morning and afternoon declarations are not combined; this prototype demonstrates morning only.
- Routing uses deterministic nearest-neighbour order from the depot, with campus fixed last, cached by tenant/attendance version/coordinates. Straight segments are used intentionally; the optional OSRM request is omitted so presentations have no road-routing network dependency. ETA uses accumulated remaining straight-line route distance at 36 km/h, not traffic predictions. Presentation travel is compressed eightfold, separately from 1×/3×/6× clock speed.
- To demonstrate all script features with one child, SHOWTIME explicitly returns Ayesha to Going by admin override before her proximity alert. It fast-forwards the remaining pickup events and campus location on the arrival beat. Manual controls remain independent.
- Document placeholders and uploaded image previews are browser-only. Driver resubmission requires fresh values and document selections. License warnings use the fixed demo date, 25 October 2026.
- CSV format is `name,stop`, with a known place from the ten-place mock geocoder. Names containing commas/quoted CSV fields are outside this deliberately small import format. A failed import adds no rows.
- Gateway success/failure, receipts and manual cash marking are simulations. Fee/commission setting changes apply to future imports/payments; previously paid ledger amounts are retained. Receipts download as text. No automated driver payout occurs.
- Google Fonts Space Grotesk/Inter are self-hosted via Fontsource 5.3.0 (OFL-1.1), with system font fallbacks. OSM attribution is retained. Maps use night-filtered tiles and an explicit grid fallback. Keyboard focus and reduced-motion preferences are respected.

## Pinned dependencies and API references

Installed package READMEs and declaration files were inspected for the exact installed versions. All direct dependencies and development tools are exact-pinned in `package.json` and locked in `package-lock.json`.

| Package           | Version | APIs used / documentation                                                                                                                |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| React / React DOM | 19.3.1  | Hooks and createRoot; installed declarations                                                                                             |
| Vite              | 8.3.5   | [Build and preview](https://vite.dev/guide/build)                                                                                        |
| Leaflet           | 1.9.4   | [Map, paths and tiles](https://leafletjs.com/reference-1.9.4.html)                                                                       |
| React Leaflet     | 5.0.0   | [MapContainer and useMapEvents](https://react-leaflet.js.org/docs/api-map/)                                                              |
| Zustand           | 5.0.16  | [create, getState, set](https://zustand.docs.pmnd.rs/apis/create); installed README                                                      |
| Framer Motion     | 14.6.0  | Installed exports; [motion](https://motion.dev/docs/react-motion-component), [MotionConfig](https://motion.dev/docs/react-motion-config) |
| canvas-confetti   | 1.9.4   | Installed README: particleCount, spread, colors, disableForReducedMotion                                                                 |
| lucide-react      | 1.61.0  | Installed README/declarations: icon exports and size/color props                                                                         |
| Vitest            | 5.0.5   | Installed runner and types                                                                                                               |
| Playwright        | 1.64.1  | Installed README/types: locators, offline context, clock, screenshots                                                                    |

See [QUALITY_REPORT.md](QUALITY_REPORT.md) for the acceptance script and verification results.
