import type express from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { EventEmitter } from "node:events";
import type { Database, Identity, Role } from "./db.js";
import { HttpError } from "./errors.js";
export const empty = z.object({}).strict();
export const id = z.string().regex(/^[1-9]\d*$/);
export const name = z.string().trim().min(1).max(100);
export const point = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
]);
export type Context = {
  q: PoolClient;
  user: Identity;
  params: Record<string, string>;
  send: (room: string, event: string, data: unknown) => void;
};
export class Api {
  readonly events = new EventEmitter();
  constructor(
    readonly app: express.Express,
    readonly db: Database,
  ) {}
  route(
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    roles: Role[],
    schema: z.ZodType,
    handler: (ctx: Context, body: any) => Promise<unknown>,
  ) {
    this.app[method](`/api/v1${path}`, async (req, res) => {
      if (!roles.includes(req.user.role))
        throw new HttpError(403, "Your role cannot perform this action");
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.params))
        params[key] = id.parse(value);
      const body = schema.parse(
        method === "get" ? req.query : (req.body ?? {}),
      );
      const outbox: { room: string; event: string; data: unknown }[] = [];
      const result = await this.db.run(req.user, (q) =>
        handler(
          {
            q,
            user: req.user,
            params,
            send: (room, event, data) => outbox.push({ room, event, data }),
          },
          body,
        ),
      );
      for (const msg of outbox) this.events.emit("message", msg);
      if (method !== "get" && /^\/admin\/(students|routes|settings)/.test(path))
        this.events.emit("routing", req.user.tenantId);
      if (method !== "get") this.events.emit("changed", req.user.tenantId);
      res.json(result ?? { ok: true });
    });
  }
}
