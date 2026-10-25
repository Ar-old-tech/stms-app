# STMS · real web application

The existing mission-control UI in `demo-web` now uses a real TypeScript/Express server, PostgreSQL, bcrypt/JWT authentication and authenticated Socket.IO connections. It no longer mutates a local simulated transport database. The Java/Flutter/infra folders are unchanged; `docs/REAL_PROMPT.md` explicitly selects the web stack for this implementation.

## Local setup

Use Node **24.21.0** (pinned in `.node-version`; at least 22.12 is needed by the client toolchain). From the repository root, install and build both packages:

```powershell
npm run setup
npm run build
cd server
copy .env.example .env
npm install
npm run env:secrets
```

Edit `server/.env` and set `DATABASE_URL` to your Neon connection string including its TLS parameters. `env:secrets` generates independent JWT, webhook and document-encryption secrets in the ignored local file; it preserves existing non-placeholder values and never prints the secrets. Keep this file private and back up the document key securely.

```powershell
npm run migrate
npm run seed
npm run dev
```

Open **http://localhost:3000**. Express serves the built UI, API and sockets from the same origin. For UI hot reload, additionally run `cd demo-web; npm run dev` in another terminal; Vite proxies `/api` and `/socket.io` to port 3000. Root `npm start` serves the production build. No deployment has been executed.

For local PostgreSQL without TLS, set `DATABASE_SSL=false`. Do not disable TLS for Neon. The app fails startup if required configuration is absent. `DEMO_ENABLED=true` is an explicit opt-in to demo login cards, server clock offsets, demo presenter sessions, simulated GPS and seeded-tenant reset. Use `false` for normal operation.

## Seeded accounts

All seeded passwords are **demo123**, stored as bcrypt hashes (cost 12). Seed data and coordinates follow `docs/DEMO_PROMPT.md`, which exists in this repository.

| Login                                     | Role / institution                                                    |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `SUP-01`                                  | Platform administrator                                                |
| `SCH-01-ADM`                              | Sunrise Coaching Center administrator                                 |
| `DRV-4821`                                | Imran Khan, verified, ICT-1182                                        |
| `STU-2026-44`                             | Ayesha Khan, parent/student                                           |
| `PENDING-USMAN`, `PENDING-BILAL`          | Pending driver applications                                           |
| `SCH-02-ADM`, `DRV-6723`, `STU-2026-CITY` | Independent City College accounts, useful for tenant-isolation checks |

There are eight Sunrise students/stops, vehicles/routes, mixed monthly fee states, past safety events and two pending drivers. One license expires within 30 days of seeding. CNICs, license values and uploaded seed-document placeholders are synthetic. No seed document images are invented: the review UI displays “No document uploaded” until real uploads are submitted.

`npm run seed` is idempotent and preserves existing tenant data. The in-app **Reset demo data** action replaces only the seeded Sunrise institution’s operational data, retains the signed-in administrator and leaves City College untouched. It is unavailable outside the seeded institution or with demo helpers disabled. SHOWTIME resets that same seeded dataset before its scripted run. Do not mix real people’s records into the seeded demo institution.

## Two-minute presenter guide

1. Open the service a minute before presenting. Sign in as **Admin**, then choose **Presenter** to open three independent, authenticated role sessions. This is deliberately labelled a demo helper; it is restricted to the seeded Sunrise tenant and the `DEMO_ENABLED` flag.
2. Click **SHOWTIME**. Its eight captions execute real API operations, roughly 90 seconds plus routing/network latency. Pause or Skip using the caption controls. There is no client-side database shortcut.
3. Admin approves Usman and assigns him and his vehicle to the route. Presenter renews the driver session for that actual assigned driver. Ayesha’s parent frame displays the Verified card.
4. Before cut-off, Ayesha selects Satellite Town and marks Not Going. The driver starts; the server optimizes only Going stops. Simulated bot GPS moves through the same telemetry endpoint used by a phone. A forced 76 km/h point creates a server-side speed event.
5. SHOWTIME jumps the **server** clock past cut-off. Ayesha explicitly requests Going, and admin approves the override. The driver approaches her next stop; the server stores and emits the one-time proximity notification.
6. Pickup statuses are recorded through the driver API. Simulated coordinates enter the campus geofence; the **server** marks Arrived. The driver’s Dropped at institution button completes the trip.
7. A confirmed driver SOS creates a row and notifies tenant admin and all parents assigned to that trip with a live-location link. Admin resolves it on the final beat.
8. A clearly labelled **SANDBOX** payment creates a session, a signed callback, a receipt and the payout calculation. PKR 6,500 at 5% yields PKR 325 commission and PKR 6,175 net. No real money moves.

The collapsible control panel has bot controls, 1×/3×/6× bot speed, server clock jumps, simulated speed/SOS/location controls and seeded reset. These controls are honest about what is simulated. They cannot bypass server permissions or cut-off rules.

## Real driver phone GPS

Sign in on the driver’s phone using its own account and start its assigned trip. Leave Location source on **Phone GPS · real location**, allow location permission, and keep the page in the foreground. The app uses `watchPosition`, sends after about five seconds or ten metres, reports speed in km/h (deriving it server-side when the browser supplies no speed), and requests a screen wake lock. Unsupported/denied GPS or wake lock is shown in the driver UI.

GPS points are buffered in a per-tenant/per-driver/per-trip session-storage queue while disconnected, retried on reconnect, bounded to 1,000 points and 24 hours, and cleared on sign-out. Only the latest trip position is kept in server memory; persistent samples are written at most once per minute. Older/duplicate timestamps cannot move a vehicle backwards. HTTPS is required on phones; localhost is a development-only secure-context exception. A browser page cannot guarantee background tracking while the OS suspends it—this is not a native foreground service.

Parents and drivers join only their authorized `trip:{id}` room. Admins join only their tenant admin room. No platform-wide vehicle channel exists. Expired/revoked tokens are rejected and sockets are disconnected; membership is rechecked when assignments change. Parent payloads exclude other students’ stops and driver documents. Route order/geometry is delivered privately to the driver, not to parent trip rooms.

## Fees and routing

- `cd server; npm run fees` generates missing Pending records for the current tenant-local month; Admin → Fees has the same idempotent button. Schedule this command monthly using your hosting scheduler if desired.
- Sandbox sessions are owned by the paying student and expire after 15 minutes. The webhook verifies an HMAC-SHA256 signature over the **exact raw body** before updating the ledger. Amounts are loaded from PostgreSQL, not trusted from callbacks. Repeated success callbacks keep the same receipt. Cash marking is admin-only. This does not integrate production JazzCash/Easypaisa merchant accounts or transfer payouts.
- The server calls public OSRM Trip with fixed source/destination, maps `waypoint_index` back to student order, and uses a three-second timeout. Any malformed/unavailable response falls back to nearest-neighbour ordering. Results are cached per tenant/route/date and invalidated by attendance, stop, route or destination changes; trip start recomputes. ETA for the next unvisited stop is refreshed at most every 30 seconds (or when that next stop changes), with haversine fallback. Persistent notification deduplication survives server restarts.

## Tests and quality gates

```powershell
cd server
npm test
npm run build
cd ../demo-web
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Server tests use real PostgreSQL: an isolated schema under `TEST_DATABASE_URL`, or a disposable embedded PostgreSQL cluster if that variable is absent. The embedded test role is non-superuser with row-level security forced. No production `DATABASE_URL` is used by the tests. Browser tests start their own isolated backend; port 3000 must be free. Some restricted Windows environments require permission to launch the local test database/browser.

See [REAL_QUALITY_REPORT.md](demo-web/REAL_QUALITY_REPORT.md) for results and per-step acceptance. Builds produce a nonblocking Vite bundle-size advisory. Dependencies are exact-pinned with lockfiles. Installed package READMEs/type declarations and the official [Express 5](https://expressjs.com/en/5x/api.html), [Socket.IO 4](https://socket.io/docs/v4/), [node-postgres](https://node-postgres.com/features/queries), [Zod](https://zod.dev/basics), [browser geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition) and [wake lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) APIs guided implementation.

## SRS 13: data privacy and security

- Passwords are bcrypt hashes; JWTs are short-lived, issuer/audience/algorithm checked and held only in client memory. Admin password reset increments the token version to invalidate existing sessions. Five failed logins lock the account for 15 minutes, independently of IP rate limiting.
- All tenant data tables have tenant IDs, composite tenant foreign keys and forced PostgreSQL RLS policies. SQL data values are parameterized. Platform-wide access is limited to authenticated platform administration and narrowly scoped authentication/seed/HMAC-webhook bootstrap operations. The database app account must not be a superuser or have `BYPASSRLS`.
- Documents and CNIC values are encrypted **on the server** using AES-256-GCM and `DOCUMENT_KEY`, then stored in PostgreSQL `bytea`. Images are bounded to 2 MB each, checked for PNG/JPEG/WebP signatures, and available only through authenticated, tenant-scoped document endpoints. They never go into the application’s filesystem or a public bucket.
- No secrets, tokens or CNIC values are logged. Environment files are ignored by Git. HTTPS and database TLS are required for hosted use. Helmet provides secure headers and a restrictive CSP. API/document responses are `no-store`; the old simulation service worker is retired.
- Children’s locations and identity documents are sensitive. Obtain parental consent, publish retention/privacy terms, minimize access, back up the encryption key separately, and restrict database access. The browser queue contains only bounded location telemetry and is not client-encrypted, as requested; use a trusted, locked driver device and sign out after use.
- SOS reaches the institution and assigned parents only. No police, ambulance or emergency-service dispatch is claimed.

## Schema and endpoint extensions required by REAL_PROMPT

Appendix A tables retain their purpose; geometry becomes latitude/longitude. Plain SQL migrations add explicit tenant IDs/foreign keys, timezone/settings/demo offset, token-version/lockout fields, per-stop visit and override state, Arrived trip state, sandbox session/receipt fields, and durable notification deduplication. `document_blobs` and `notifications` are the requested additional tables. These changes support the real requirements rather than introduce unrelated product scope.

Section 10.1 endpoint names are preserved. Because that section enumerates only the original core routes, these necessary extensions are documented rather than hidden: `/auth/me`, `/config`, `/workspace`, `/tenants`, `/admin/settings`, `/admin/users/:id/password`, `/admin/students/import`, resource PUT/DELETE routes, `/admin/drivers/:id/documents/:kind`, `/admin/attendance/:id/override`, `/trips/:id/telemetry`, `/admin/sos/:id`, `/admin/fees`, `/admin/fees/generate`, `/admin/fees/:id/paid`, `/fees/:id/receipt`, `/fees/:id/sandbox-complete`, and gated `/admin/demo/{reset,presenter-sessions}`. Bodies and path IDs are validated. The SRS telemetry publish channel is represented by the authenticated `telemetry` Socket.IO event or the equivalent driver HTTP endpoint.

## Assumptions and remaining limits

- Default timezone is Asia/Karachi. The time offset affects server attendance/trip dates and is always labelled DEMO ONLY. Attendance is per day; same-day morning/afternoon routes share the declaration, as represented by Appendix A. The UI presenter demonstrates the morning route; the API supports both directions with reversed endpoints.
- One student account represents one child. Address suggestions reuse the ten local demo places; map pins persist real coordinates. This is not a live general-purpose geocoder.
- A verified driver is explicitly assigned by admin. Approval changes its custom login ID but keeps its stable database identity and existing JWT identity. New drivers receive an APP login until approval. CSV credentials are displayed only to the importing admin and should be handed to families privately. CSV is the documented unquoted four-column format.
- The deployment is a **single process/instance**, because the latest-position map and routing cache are in memory. PostgreSQL holds all durable data; a restart restores sampled positions and notifications, and fresh phone telemetry resumes live tracking. Scale-out would require a shared live store/Socket.IO adapter, intentionally outside this stack.
- Browser notifications arrive while a connected page is open (if permission is granted). Closed-browser push/FCM and native background tracking are not implemented by this web-only task.
- Real Neon connectivity, public OSRM availability, a physical phone field test and Render deployment remain external checks until credentials/hosting/devices are supplied. No actual payment gateway or automated payout is claimed. Only GPS bot coordinates, payment-gateway outcomes, seed identities/documents and presentation clock offsets remain simulated.

Deployment instructions are in [DEPLOY.md](DEPLOY.md).
