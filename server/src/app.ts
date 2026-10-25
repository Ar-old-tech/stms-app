import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { createServer } from "node:http";
import type { Database, Identity } from "./db.js";
import type { Config } from "./config.js";
import { authenticate, login } from "./auth.js";
import { HttpError } from "./errors.js";
import { Api } from "./http.js";
import { management } from "./management.js";
import multer from "multer";
import { Runtime } from './runtime.js';
import { operations,webhook } from './operations.js';
import { workspace } from './workspace.js';
declare global {
  namespace Express {
    interface Request {
      user: Identity;
      rawBody?:Buffer;
    }
  }
}
export function createApp(db: Database, c: Config) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https://tile.openstreetmap.org",
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "1mb",verify(req,_res,buffer){(req as express.Request).rawBody=Buffer.from(buffer)} }));
  const api = new Api(app, db);
  const http=createServer(app);
  const runtime=new Runtime(db,c,api,http);
  app.get('/api/v1/config',(_req,res)=>res.json({demoEnabled:c.DEMO_ENABLED==='true'}));
  webhook(api,c);
  app.get(["/health", "/api/v1/health"], async (_req, res) => {
    await db.pool.query("SELECT 1");
    res.json({ status: "ok" });
  });
  app.post(
    "/api/v1/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: c.NODE_ENV === "test" ? 1000 : 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    async (req, res) => {
      const b = z
        .object({
          customId: z.string().trim().min(1).max(50),
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(req.body);
      const result = await login(b.customId, b.password, c, db);
      if (result.error) throw result.error;
      res.json(result);
    },
  );
  app.use("/api/v1", async (req, _res, next) => {
    try {
      const value = req.headers.authorization;
      if (!value && req.method === "POST" && req.path === "/drivers/register") {
        next();
        return;
      }
      if (!value?.startsWith("Bearer "))
        throw new HttpError(401, "Sign in required");
      req.user = await authenticate(value.slice(7), c, db);
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/v1/auth/me", (req, res) => res.json(req.user));
  app.get("/api/v1/admin/students", async (req, res) => {
    if (req.user.role !== "ADMIN")
      throw new HttpError(403, "Administrator role required");
    res.json(
      await db.run(
        req.user,
        async (q) =>
          (
            await q.query(
              "SELECT id,custom_id,name FROM users WHERE tenant_id=$1 AND role='STUDENT' ORDER BY id",
              [req.user.tenantId],
            )
          ).rows,
      ),
    );
  });
  management(api, c);
  operations(api,runtime,c);
  workspace(api,runtime,c);
  return {
    app,
    api,
    runtime,
    http,
    finish() {
      app.use((_req, res) => res.status(404).json({ error: "Not found" }));
      app.use(
        (
          error: unknown,
          _req: express.Request,
          res: express.Response,
          _next: express.NextFunction,
        ) => {
          if (error instanceof multer.MulterError) {
            res
              .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
              .json({
                error:
                  "Upload rejected. Use three images, each no larger than 2 MB.",
              });
            return;
          }
          if (error instanceof SyntaxError) {
            res.status(400).json({ error: "Invalid JSON" });
            return;
          }
          if (error instanceof z.ZodError) {
            res
              .status(400)
              .json({
                error: "Invalid request",
                fields: error.issues.map((x) => ({
                  path: x.path,
                  message: x.message,
                })),
              });
            return;
          }
          if (error instanceof HttpError) {
            res.status(error.status).json({ error: error.message });
            return;
          }
          const code = (error as { code?: string })?.code;
          if (code === "23505" || code === "23503" || code === "23514") {
            res
              .status(409)
              .json({
                error: "Record conflicts with existing data or an assignment",
              });
            return;
          }
          res.status(500).json({ error: "Request failed. Please try again." });
        },
      );
    },
  };
}
