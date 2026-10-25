# Historical browser-only prototype acceptance report

This report describes the earlier simulated prototype. Current real-backend results are in [REAL_QUALITY_REPORT.md](REAL_QUALITY_REPORT.md).

Verified on 25 October 2026 with Node 24.21.0, npm 11.19.0 and Playwright Chromium 156. Tests are local browser tests; the connected browser tool exposed no browser, so the UI walkthrough used the included headless harness and saved screenshots.

## Required workflow

Production build succeeded after each requested milestone: core store/seed/simulation/routing/tests; Parent; Driver; Admin/Super Admin; Presenter/SHOWTIME/polish. Final source was formatted. Changes are isolated to `demo-web`; existing backend, mobile and infrastructure code was not changed.

## Final command output

```text
> npm run build
> tsc -b && vite build && node scripts/build-sw.mjs
vite v8.3.5 building client environment for production...
✓ 2408 modules transformed.
✓ built in 1.18s
Offline shell generated: 17 local assets (4c3964e49349)

> npm test
Test Files  1 passed (1)
     Tests  9 passed (9)

> npm run test:e2e
5 passed (55.6s)

> npm run lint
exit 0; two nonblocking Fast Refresh export warnings

> git diff --check
exit 0
```

Build has zero TypeScript errors. Vite reports one nonblocking 500 kB bundle advisory (568.30 kB raw JavaScript, 177.37 kB gzip). The app deliberately keeps the three presenter roles eagerly available. Lint warnings concern utility exports next to React components and do not indicate runtime failures.

## Eight-step browser walkthrough

| Step | Result | Browser evidence |
|---|---|---|
| 1. Verify pending driver | PASS | Usman approved; issued ID, matching vehicle and Verified parent card |
| 2. Select stop / Not Going | PASS | Satellite Town selected; parent toggle changes before cut-off |
| 3. Start optimized trip | PASS | IN PROGRESS; Ayesha removed from driver’s ordered stops |
| 4. Move van / speed spike | PASS | Live simulation; gauge 76; admin speed log visible |
| 5. Five-minute notification | PASS | Ayesha’s targeted notification appears after explicit admin override restores Going; unit test checks one-time firing |
| 6. Pickup / campus arrival | PASS | Arrival and boarding recorded; geofence switches to Arrived; Dropped at institution available |
| 7. SOS / resolve | PASS | Parent notification and location link; admin pulse and Resolve; final beat resolves the alert |
| 8. Payment / receipt / payout | PASS | Paid, receipt number and download; admin commission PKR 325 and net PKR 6,175 |

The first browser test executes each visible transition using Pause and Skip. A separate production test runs all 88 seconds of autoplay with Playwright’s clock after disconnecting the browser and reloading from the service-worker cache.

## Additional checks

- Nine unit tests: nearest-neighbour route/campus last, inclusive cut-off, one-time ETA alerts, commission/net calculation, eight-step shared-state flow, mandatory rejection reason/attendance lock, tenant-scoped queries/mutations, geofence/drop completion, failed payment retry/idempotent receipt.
- Browser manual actions: attendance toggle, cut-off lock, admin override, sample CSV, real CSV file input, payment failure/retry, two-step SOS, tenant creation.
- Browser document workflow: document review, required rejection reason, rejection/resubmission, three actual image uploads and previews, approval; commission settings save.
- No JavaScript console errors or uncaught browser exceptions during the eight-step scripted walkthrough. External fonts are bundled locally. Browser tests use the supported offline grid to avoid dependence on public map servers.
- Production app-shell reloads offline; all local JS/CSS/fonts are cached. Full autoplay completes offline with no uncaught exceptions.
- No page horizontal overflow at 1920 px or 390 px across all role views. Presenter layout stacks on narrow screens. Screenshots visually inspected.
- Visible keyboard focus and `prefers-reduced-motion` checked in Chromium.

Screenshots are generated in ignored `test-results/`: `presenter-1920.png`, `showtime-complete.png`, `mobile-390.png`, `offline-reload.png`. Failure traces are retained automatically if a future run fails.

## Remaining external verification

Public OSM tile availability and real road/traffic accuracy are not guaranteed or required for the browser-only simulation. The straight-line route and dark grid remain functional. No physical phone GPS, real payment, push delivery, production authentication/security, or emergency-service integration is claimed. See README for the full assumptions and presenter controls.
