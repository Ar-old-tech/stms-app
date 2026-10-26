# STMS – Agent Instructions

## Project
Smart Transport Management System: multi-tenant platform for school/college/
coaching-center van transport. Source of truth: docs/SRS.md. If code and SRS
disagree, stop and ask; never silently deviate.

## Stack (fixed, do not substitute)
- Backend: Java 21, Spring Boot 3, PostgreSQL + PostGIS, Redis, Flyway migrations
- Routing: OSRM (docker). Geocoding: Nominatim. Maps: OpenStreetMap via flutter_map
- Mobile + admin web: Flutter (roles: driver, student/parent, admin)
- Push: Firebase Cloud Messaging
- Constraint: free/open-source services only; driver's phone is the GPS device
- Note: the SRS mentions a React admin portal. We are NOT using React; the
  admin portal is built with Flutter Web.

## Non-negotiable rules
1. Every query and WebSocket subscription is tenant-scoped. Never expose one
   tenant's data to another. Per-trip topics only: /topic/trips/{tripId}/location.
2. Live vehicle positions live in Redis, never written to Postgres per update.
3. Schema changes only via Flyway migrations, following SRS Appendix A.
4. Passwords: BCrypt/Argon2. Never log secrets, CNIC numbers or tokens.
5. Pin dependency versions. Before using a library API, check its docs for the
   pinned version; do not guess method names (e.g. flutter_map uses
   initialCenter/initialZoom).
6. No invented endpoints, tables or fields. Use SRS section 10 and Appendix A.

## Workflow
- For each task: (a) restate the goal and list files you will touch,
  (b) implement, (c) write tests, (d) run build + tests and show the output,
  (e) summarize what changed and what is still unverified.
- Keep changes small and scoped to the phase I name. Do not refactor
  unrelated code.
- If something is ambiguous (see SRS section 17.2 open decisions), ask first
  instead of choosing.

## Commands
- Backend: `cd backend; ./mvnw verify`
- Infra: `docker compose -f infra/docker-compose.yml up -d`
- Mobile: `cd mobile; flutter analyze; flutter test`  