# Real-backend acceptance report

Verified 25 October 2026 on Windows, Node 24.21.0, PostgreSQL 18.4 (disposable local clusters), and Playwright Chromium. No Neon credentials were configured; tests did not use a production database. Deployment was prepared, not executed.

## Milestones

| Milestone | Implementation                                                                                                       | Validation                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1         | SQL migrations, seed, bcrypt/JWT auth, lockout, tenant transactions/RLS                                              | Server build; 5 PostgreSQL tests; commit `c4b6088`                                    |
| 2         | Management CRUD, CSV, encrypted multipart document upload and verification                                           | Server build; 8 PostgreSQL tests; commit `d035e1e`                                    |
| 3         | Trips, attendance, OSRM/fallback/ETA, safety, notifications, signed sandbox fees and sockets                         | Server build; 14 PostgreSQL tests; commit `b11ec0b`                                   |
| 4         | Preserved UI backed by authenticated API/session stores and live sockets                                             | Client/server builds, transport tests and real-backend browser test; commit `8e86562` |
| 5         | Phone GPS queue/wake lock, labelled bot, real-API Presenter/SHOWTIME, production serving and deployment/privacy docs | Final results below; fifth milestone commit                                           |

## Final output

```text
> npm run build
> npm --prefix demo-web run build && npm --prefix server run build
vite v8.3.5 building client environment for production...
✓ 2441 modules transformed.
✓ built in 610ms
> server@1.0.0 build
> tsc
exit 0; zero TypeScript errors

> cd server; npm test
Test Files  1 passed (1)
     Tests  17 passed (17)
Duration 33.42s

> cd demo-web; npm test
Test Files  2 passed (2)
     Tests  7 passed (7)

> cd demo-web; npm run test:e2e
5 passed (2.3m)

> git diff --check
exit 0
```

The final browser suite passed together. It includes an uninterrupted real-backend SHOWTIME run (about 1.3 minutes) and a separate manual Pause/Skip walkthrough asserting all eight outcomes. No API calls are mocked in these tests. Public tiles are replaced with a deterministic grid/fixture to avoid dependence on a public tile server.

## Eight-step real-backend walkthrough

| Step                        | Result   | Verified behavior                                                                                                                         |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Verify and assign driver | **PASS** | Admin approves Usman, server issues a random `DRV-XXXX` ID, assigns the route/vehicle, and parent receives the Verified driver card       |
| 2. Select stop / Not Going  | **PASS** | Parent persists Satellite Town and Not Going before server-enforced cut-off                                                               |
| 3. Start and optimize       | **PASS** | Assigned driver starts through API; server returns Going stops only, excluding Ayesha; campus remains last                                |
| 4. Move / speed spike       | **PASS** | Labelled simulated GPS uses the authenticated driver endpoint; server logs 76 km/h and admin sees it                                      |
| 5. Proximity notification   | **PASS** | After cut-off, parent explicitly requests Going and admin approves; approaching Ayesha creates/emits her one-time notification            |
| 6. Pickup / arrival         | **PASS** | Driver arrival/pickup writes attendance and trip events; campus GPS enters the 150 m server geofence; Dropped at institution is available |
| 7. SOS / resolve            | **PASS** | Confirmed SOS persists, reaches admin/parents with location link, pulses admin frame, and is resolved through the admin API               |
| 8. Sandbox fee / receipt    | **PASS** | Payment session and exact-body signed webhook mark Paid; receipt persists; PKR 325 commission and PKR 6,175 net appear in admin ledger    |

## Other coverage

- **Authentication:** bcrypt hashes, real JWT claims, expired/invalid tokens, role denial, five-attempt account lockout, admin password-reset revocation and new-password login.
- **Tenant isolation:** tenant A cannot read tenant B students via REST or raw tenant-scoped SQL with forced RLS; unauthorized Socket.IO trip joins and foreign REST trips are refused. Driver route payloads are private to the driver; parents receive only their child’s stop and authorized trip position.
- **Onboarding:** platform admin creates an institution and a usable random `SCH-…-ADM` administrator login; the new tenant starts with empty scoped data.
- **Documents/import:** real multipart images, encrypted durable database blobs, authenticated document access, 2 MB limit, required rejection reason, atomic CSV import and foreign-assignment rejection.
- **Routing/time:** successful OSRM waypoint-index mapping, unavailable-service nearest-neighbour fallback with campus last, inclusive cut-off, explicit post-cut-off override, cached route replacement and trip start.
- **GPS/safety:** five-second/ten-metre reporting thresholds, scoped bounded queue restore, failed-send retention, sampled persistence, once-per-stop proximity dedupe, speed events, campus arrival, boarding/drop completion, SOS and resolution.
- **Fees:** unsigned webhook rejection, signed callback success and replay idempotency, stored payout, receipt authorization, monthly generation idempotency. Demo reset preserves the other tenant.
- **Browser devices:** independent driver/parent contexts use the browser geolocation API, receive live server updates, disconnect/reconnect, and flush a buffered point. These are automated geolocation fixtures, not a physical phone field test.
- **Production UI:** one Express service serves built assets, API and sockets with Helmet/CSP. The production-origin browser test checks real sign-in, visible keyboard focus, reduced-motion configuration and 390 px layout. Desktop 1920 px and all tenant-role 390 px layouts have no page horizontal overflow. Screenshots were visually inspected.

Screenshots are generated in ignored `demo-web/test-results`: `real-presenter-1920.png`, `real-showtime-complete.png`, `real-mobile-390.png`, `real-production-390.png`. Failure traces are retained automatically if a future test fails.

## Nonblocking advisories and environment recovery

Vite reports a 623.23 kB raw / 192.98 kB gzip JavaScript bundle advisory. Client lint exits 0 with four warnings: shared utility exports beside components (2), the SHOWTIME effect’s function dependency, and a render-time license-expiry timestamp. These are not TypeScript or runtime errors.

Windows clean installs initially encountered loaded native-module locks from workspace Vite/preview/test processes. Dependencies were restored with `npm install`, and the final compilation/tests passed. Stop local development/test processes before `npm run setup` on Windows. A preliminary browser run also hit one OS `ERR_NO_BUFFER_SPACE` request; its isolated rerun and then the complete final five-test run passed cleanly. Restricted-sandbox user-lookup failures were resolved by running the authorized PostgreSQL/browser checks outside that sandbox. No failed check is counted as a pass.

## Unverified external behavior / assumptions

Real Neon connectivity, Render provisioning/startup and a physical phone field test remain unverified without the user’s environment/devices. Public OSRM/tile uptime is not guaranteed; fallback behavior is tested. Browser geolocation/wake lock requires HTTPS on phones and foreground browser operation. Closed-browser push and native background services are outside this web stack.

Only the labelled driver bot coordinates, sandbox gateway outcomes, seed identities/placeholders and presentation time offsets remain simulated. All authentication, tenant access, data mutations, notifications, trip events, fee records and receipts use the real backend/database. See the root README for the full assumptions and privacy rules, and DEPLOY.md for exact deployment commands.
