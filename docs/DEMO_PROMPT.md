Read AGENTS.md and docs/SRS.md first. IGNORE the Flutter / Spring Boot / Docker
rules in AGENTS.md for this task. This task has its own stack, defined below.

ROLE
You are a senior full-stack engineer and product designer. Build a cinematic,
presentation-grade prototype of STMS (Smart Transport Management System) for a
live demo on Tuesday. Do not ask me questions. Make sensible assumptions and
list them at the end. Work autonomously until everything below passes.

GOAL
One web app in /demo-web that makes judges say "wow" in the first 10 seconds
and then proves every MVP feature from docs/SRS.md section 2.3 actually works.
All data is simulated in the browser (no backend), but the app must behave like
the real product: actions in one role instantly change the other roles.

STACK (fixed)
- Vite + React + TypeScript, plain CSS (no Tailwind). Scaffold with
  `npm create vite@latest demo-web -- --template react-ts` (non-interactive).
- Dependencies, installed with npm and checked against their installed
  versions' docs before use (never guess APIs): leaflet, react-leaflet,
  zustand, framer-motion, canvas-confetti, lucide-react.
- Maps: Leaflet with OpenStreetMap tiles, darkened with a CSS filter
  (invert + hue-rotate + brightness) for a night "command centre" look. If tiles
  fail to load, show a dark grid background; never crash or show blank.
- Must work with `npm run dev` and `npm run build`. No API keys. No backend.

ARCHITECTURE
- src/store.ts: one zustand store as the single source of truth (tenants,
  users, students, stops, drivers, vehicles, routes, attendance, trip, fees,
  sos events, speed events, notifications, simulated clock, settings).
- src/sim.ts: simulation engine (van movement along the route, speed, ETA,
  geofence, 5-minute alert). Ticks every second.
- src/seed.ts: all seed data. src/routing.ts: route logic.
- src/views/{Driver,Parent,Admin,SuperAdmin,Login}.tsx, src/components/*.
- Keep tenantId on every record and filter by it in selectors (so the real
  backend can replace this later).

SEED DATA (Islamabad / Rawalpindi, Pakistan; coordinates approximate, adjust
so every point is plausible and on land)
- Campus (destination): 33.6426, 72.9930. Depot (driver start): 33.5973, 73.0479.
- 8 student stops: Committee Chowk 33.6030,73.0680; Satellite Town
  33.6360,73.0650; Faizabad 33.6590,73.0810; I-8 Markaz 33.6683,73.0759;
  Chandni Chowk 33.6140,73.0720; G-9 Markaz 33.6951,73.0390;
  F-10 Markaz 33.6940,73.0120; H-8 33.6610,73.0560.
- Tenants: "Sunrise Coaching Center" (COACHING, plan Driver Pro) and "City
  College" (COLLEGE, plan Institute).
- Logins (password demo123 for all): SUP-01 (super admin), SCH-01-ADM (admin of
  Sunrise), DRV-4821 Imran Khan (VERIFIED driver, vehicle ICT-1182),
  STU-2026-44 Ayesha Khan (parent/student). Plus one-click "Demo login" cards.
- 8 students (Ayesha is one of them), 2 more drivers in PENDING state with
  CNIC, license number, vehicle reg and document photo placeholders; one
  license expires within 30 days. Fees in PKR for the month (mix of Paid,
  Pending, Failed). A few past SOS and over-speed events. Cut-off 06:00.

FEATURES (all required; IDs refer to docs/SRS.md)
SUPER ADMIN: platform stats, tenant list, create tenant with type
(school/college/university/coaching) and plan (FR-T1).
TENANT ADMIN:
- Dashboard with animated KPI counters: active trips, students going today,
  open SOS, pending drivers, fees collected.
- Live fleet map of all vehicles on active trips (FR-T5).
- Driver verification queue: view CNIC, license, vehicle reg, document photos;
  Approve (issues a DRV-XXXX id and the Verified badge) or Reject with a
  required reason; license-expiry warning badge (FR-D2, D3, D4).
- Vehicles, routes, driver assignment (FR-T3).
- Students: table, bulk CSV import (textarea with a "Load sample CSV" button
  and a real file input) that issues STU ids (FR-T4, FR-A2).
- Settings: cut-off time, trip times, campus location, fee amount, platform
  commission % (FR-T2, FR-F3).
- Fee ledger: Pending/Paid/Failed, manual "mark as paid", commission and net
  driver payout, receipt view (FR-F1, F3).
- Alerts centre: SOS inbox with Resolve, over-speed log, trip events log,
  today's attendance record, and "admin override" requests after cut-off.
DRIVER:
- Registration form (CNIC, license + expiry, vehicle reg, three document photo
  uploads with previews) -> Pending -> Verified/Rejected with reason and
  resubmit (FR-D1 to D3).
- Start trip: map shows ONLY students marked Going, in optimized order, with
  the route drawn (FR-V1, V2). Route logic: nearest-neighbour from the start
  with the campus fixed as the last point; optionally fetch the real road
  line from the public OSRM demo server with a 3-second timeout and fall back
  to straight segments on any failure. Cache per attendance version.
- At each stop the van pauses; the driver taps Arrived, Picked up or No-show;
  at the end taps Dropped at institution (FR-V3).
- Toast when a student changes status (FR-V4).
- Speedometer gauge; over 60 km/h flashes red, logs an event the admin sees
  (FR-V5).
- Emergency button with a two-step confirmation (FR-V6).
- Entering a 150 m geofence around the campus marks the trip Arrived (FR-X2).
PARENT / STUDENT:
- Pick the stop by address search (mock geocoder with about 10 local places)
  or by tapping the map to drop a pin (FR-S1).
- Going / Not Going toggle, default Going, locked after cut-off with a clear
  message and a "request admin override" button (FR-S2, S3).
- Live van position, ETA, trip status including arrival at the institution,
  and a Verified driver card with badge and vehicle number (FR-S4, D3).
- Push-style notification when ETA to my stop is 5 minutes or less, fired
  once per stop (FR-S5).
- Fees: status, pay through a simulated gateway sheet (JazzCash / Easypaisa
  choice, success and failure paths), then confetti, a receipt screen with a
  receipt number, and a notification (FR-S6, F2).
- Emergency button (FR-X1): notifies admin and all parents on the trip with a
  live-location link inside the notification.

THE "BOMBASTIC" LAYER (required, this is what wins the room)
1. Presenter Mode (default view): three phone-style frames side by side
   (Driver | Parent | Admin dashboard) on one screen, all sharing the same
   store, so a tap in one visibly changes the others. A top bar switches to
   single-role full-screen views.
2. SHOWTIME button: an auto-play of the full demo (about 90 seconds, pausable,
   skippable). It performs the 8 steps below by itself, with a large caption
   overlay narrating each step ("Admin verifies the driver...", etc.).
3. Demo Control Panel (collapsible): simulation speed 1x/3x/6x, jump clock to
   before/after cut-off, force over-speed, trigger SOS, move van near the next
   stop, reset demo data.
4. Motion: the van glides smoothly with a glowing trail; the route line
   animates in; markers pop in; ETA and KPI numbers count up; toasts slide in
   with a soft sound (muted by default, with a mute toggle); SOS makes the
   whole admin frame pulse red; payment success fires confetti; geofence
   arrival triggers a campus pulse ring.
5. Design direction: a dark "mission-control" look. Deep navy base, one vivid
   electric-cyan accent, amber for warnings, red for SOS, green for verified.
   Use a distinctive font pairing from Google Fonts with local fallbacks
   (headline: Sora or Space Grotesk; body: Inter), glassmorphism panels used
   sparingly, consistent status chips (Verified, Pending, Going, Not Going,
   Paid, Failed), large touch targets in the driver UI. Beautiful empty,
   loading and error states. No overflow at 390 px phone width or 1920 px
   desktop width.
6. A polished login screen with the STMS logo mark (draw a simple SVG van-pin
   mark), tagline, and the one-click demo login cards.

DEMO SCRIPT THAT MUST WORK END TO END (also what SHOWTIME plays)
1. Admin approves a Pending driver; the Verified badge appears for parents.
2. Parent picks a stop and marks Not Going before the cut-off.
3. Driver starts the trip; that stop disappears and the route re-optimizes
   live with an animation.
4. The van moves; a forced speed spike shows the over-speed warning; admin
   sees the log.
5. The 5-minute alert fires on the parent frame.
6. Driver records Arrived / Picked up; the campus geofence marks Arrived.
7. Emergency alert reaches admin and parents; admin resolves it.
8. Parent pays a fee; confetti; receipt; admin ledger shows Paid with the
   driver net payout.

QUALITY GATES (do not report done until all pass)
- `npm run build` succeeds with zero TypeScript errors.
- Unit tests (vitest) for: route ordering with campus fixed last, cut-off
  lock logic, ETA alert fires exactly once per stop, fee commission and net
  payout. `npm test` passes.
- No console errors during the full demo script. Everything also works offline
  except map tiles and the optional OSRM line.
- Keyboard focus visible, respects prefers-reduced-motion.

WORKFLOW
Plan briefly (file list and dependency versions), then build in this order,
running `npm run build` after each milestone: (1) store, seed, sim, routing
and tests; (2) Parent view; (3) Driver view; (4) Admin and Super Admin views;
(5) Presenter Mode, Control Panel, SHOWTIME, motion and polish. At the end:
walk the 8-step script yourself, report pass/fail per step, list any
assumptions, and give the exact commands to run the app (`cd demo-web`,
`npm install`, `npm run dev`). Create demo-web/README.md with a 2-minute
presenter guide.