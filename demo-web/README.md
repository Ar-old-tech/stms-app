# STMS web client

This is the preserved React/Vite mission-control interface, now connected to the Express/PostgreSQL backend through authenticated HTTP and Socket.IO. Client state is a cache of authorized server responses, not a simulated transport database.

Use the [root README](../README.md) for setup, seeded logins, the two-minute presenter guide, privacy rules and assumptions. Use [DEPLOY.md](../DEPLOY.md) for the single-service Render/Neon configuration. See [REAL_QUALITY_REPORT.md](REAL_QUALITY_REPORT.md) for current verification results; `QUALITY_REPORT.md` is historical prototype evidence.

```powershell
npm install
npm run dev
```

The development server proxies `/api` and `/socket.io` to the backend on port 3000. For a single-origin production-style local run, build from the repository root and use `cd server; npm run dev` instead; Express serves this client at `http://localhost:3000`.

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests launch an isolated real PostgreSQL-backed service and never use production credentials. Port 3000 must be free. Test reports/screenshots are in ignored `test-results`.

`seed.ts` retains the original demo fixtures and local address catalogue as a reference; live workspaces never load that seed database. All mutations go through `api.ts`/the server, and GPS goes through the authenticated telemetry endpoint. The old simulation engine and service-worker generator were removed.
