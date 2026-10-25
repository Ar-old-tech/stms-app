import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Database, Identity } from "./db.js";
import { platform } from "./db.js";
import type { Config } from "./config.js";
import { HttpError } from "./errors.js";
const claims = z.object({
  userId: z.string(),
  tenantId: z.string().nullable(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "DRIVER", "STUDENT"]),
  version: z.number().int(),
  exp: z.number(),
});
export function tokenFor(user: Identity, c: Config) {
  return jwt.sign(user, c.JWT_SECRET, {
    expiresIn: "2h",
    issuer: "stms",
    audience: "stms-web",
    algorithm: "HS256",
  });
}
export async function authenticate(token: string, c: Config, db: Database) {
  let user: Identity;
  try {
    user = claims.parse(
      jwt.verify(token, c.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "stms",
        audience: "stms-web",
      }),
    );
  } catch {
    throw new HttpError(401, "Session expired or invalid. Sign in again.");
  }
  const ok = await db.run(
    user,
    async (q) =>
      (
        await q.query(
          "SELECT id FROM users WHERE id=$1 AND tenant_id IS NOT DISTINCT FROM $2 AND active=true AND token_version=$3",
          [user.userId, user.tenantId, user.version],
        )
      ).rowCount,
  );
  if (!ok) throw new HttpError(401, "Session no longer valid");
  return user;
}
const dummyHash = bcrypt.hash("invalid-login-placeholder", 12);
export async function login(
  id: string,
  password: string,
  c: Config,
  db: Database,
) {
  return db.run(platform, async (q) => {
    const u = (
      await q.query("SELECT * FROM users WHERE custom_id=$1 FOR UPDATE", [id])
    ).rows[0];
    const match = await bcrypt.compare(
      password,
      u?.password_hash ?? (await dummyHash),
    );
    if (!u || !u.active)
      throw new HttpError(401, "Invalid identifier or password");
    if (u.locked_until && new Date(u.locked_until) > new Date())
      return {
        error: new HttpError(
          429,
          "Account temporarily locked. Try again in 15 minutes.",
        ),
      };
    if (!match) {
      await q.query(
        "UPDATE users SET login_failures=login_failures+1,locked_until=CASE WHEN login_failures+1>=5 THEN now()+interval '15 minutes' ELSE NULL END WHERE id=$1 AND tenant_id IS NOT DISTINCT FROM $2",
        [u.id, u.tenant_id],
      );
      return { error: new HttpError(401, "Invalid identifier or password") };
    }
    await q.query(
      "UPDATE users SET login_failures=0,locked_until=NULL WHERE id=$1 AND tenant_id IS NOT DISTINCT FROM $2",
      [u.id, u.tenant_id],
    );
    const user: Identity = {
      userId: u.id,
      tenantId: u.tenant_id,
      role: u.role,
      version: u.token_version,
    };
    return {
      token: tokenFor(user, c),
      user: { ...user, customId: u.custom_id, name: u.name },
    };
  });
}
