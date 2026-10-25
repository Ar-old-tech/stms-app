# Render + Neon deployment — prepared, not executed

This deploys one Node web service. Express serves the compiled React app, `/api/v1` and Socket.IO from the same HTTPS origin. Do not deploy `demo-web` as a separate static site.

1. Create a Neon PostgreSQL database/branch. Copy its connection string from **Connect**, retaining `sslmode=require` (and any channel-binding parameter Neon supplies). A direct connection is simplest for migrations. Do not paste the URL into source control.
2. Push the five milestone commits to your own repository when ready. In Render, choose **New → Web Service**, connect that repository and select this branch. Leave **Root Directory blank** (repository root). Choose the **Node** runtime and the Free instance type for the presentation.
3. Configure these commands:

   | Setting           | Exact value                                    |
   | ----------------- | ---------------------------------------------- |
   | Build Command     | `npm run setup && npm run build`               |
   | Start Command     | `npm run migrate && npm run seed && npm start` |
   | Health Check Path | `/api/v1/health`                               |
   | Node version      | `24.21.0` (also in `.node-version`)            |

   Setup installs the locked dependencies; the root build compiles client first, then server. Stop local Vite/preview processes before running a clean setup on Windows, because loaded native modules cannot be replaced. The startup migration is advisory-lock protected and transactional; seed is idempotent. It does not reset existing institutions. Running migrations at startup avoids relying on Render’s paid-only pre-deploy command. For a later non-demo installation, remove `npm run seed` from Start Command after provisioning your own accounts.

4. Set environment variables in Render’s dashboard:

   | Variable         | Value                                                                   |
   | ---------------- | ----------------------------------------------------------------------- |
   | `DATABASE_URL`   | Private Neon PostgreSQL connection string with TLS                      |
   | `JWT_SECRET`     | Independently generated random secret, at least 32 characters           |
   | `WEBHOOK_SECRET` | Different independently generated random secret, at least 32 characters |
   | `DOCUMENT_KEY`   | Exactly 64 hex characters (32 random bytes), kept stable and backed up  |
   | `NODE_ENV`       | `production`                                                            |
   | `DEMO_ENABLED`   | `true` for the seeded presentation; `false` for ordinary use            |

   Render supplies `PORT`; the server binds to `0.0.0.0` and reads it. Do not set `DATABASE_SSL=false` for Neon. Generate secrets locally with `npm --prefix server run env:secrets` after copying the example file, then transfer them privately to Render. That script does not print values. Do not reuse the example placeholders or commit the `.env` file.

5. Create/deploy the service yourself. This implementation has **not** created Render resources, submitted credentials, or deployed anything. After deployment, open `/api/v1/health`, sign in as the seeded admin, and confirm Presenter Mode loads. All seeded passwords are `demo123`, so keep this a controlled presentation dataset; turn off demo helpers/change passwords before using real people’s data.
6. For a phone test, open the **HTTPS Render URL** on the driver phone and the same URL on a different parent device. Sign in to the correct accounts. Allow location and notification permission, start the trip, select Phone GPS and keep the browser foregrounded. HTTP over a LAN address generally cannot use geolocation/wake lock; localhost is only a desktop-development exception.
7. Run the eight-step presenter checklist in the README. Verify actual OSRM/tile network availability, the map fallback, driver document uploads, reconnect after turning phone connectivity off/on, and receipt persistence after a restart.

Render Free services sleep after about 15 minutes without HTTP/WebSocket traffic and take roughly a minute to wake. **Open the URL at least a minute before presenting.** Free local files are lost on restart/redeploy; documents are stored encrypted in PostgreSQL and survive. Latest live GPS/routing cache is intentionally in memory and is restored by the next phone point, with the most recent sampled position available meanwhile. Use one service instance. No keep-alive bypass or paid resources are created.

The sandbox gateway never charges JazzCash/Easypaisa. Its signed-callback helper can complete only the authenticated student’s own session; the webhook verifies the raw-body HMAC before altering fee state. Production merchant onboarding and automated payout are outside this task.

References checked for these steps: [Render deployment commands](https://render.com/docs/deploys), [Render Free service limits](https://render.com/docs/free), [Neon connection strings](https://neon.com/docs/connect/connect-from-any-app). Costs/limits can change; review the dashboard before deploying.
