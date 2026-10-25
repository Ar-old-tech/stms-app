import pg from "pg";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
pg.types.setTypeParser(1082, (value: string) => value);
export type Role = "SUPER_ADMIN" | "ADMIN" | "DRIVER" | "STUDENT";
export type Identity = {
  userId: string;
  tenantId: string | null;
  role: Role;
  version: number;
};
export type Db = Pick<PoolClient, "query">;
export class Database {
  readonly pool: pg.Pool;
  constructor(
    c: Pick<Config, "DATABASE_URL" | "DATABASE_SSL">,
    schema?: string,
  ) {
    this.pool = new pg.Pool({
      connectionString: c.DATABASE_URL,
      max: 10,
      ...(schema ? { options: `-c search_path=${schema},public` } : {}),
      ...(c.DATABASE_SSL === "false" ? { ssl: false } : {}),
    });
  }
  async run<T>(
    user: Pick<Identity, "tenantId" | "role">,
    fn: (db: PoolClient) => Promise<T>,
  ) {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        "SELECT set_config('app.tenant_id',$1,true),set_config('app.platform',$2,true)",
        [user.tenantId ?? "", user.role === "SUPER_ADMIN" ? "true" : "false"],
      );
      const value = await fn(db);
      await db.query("COMMIT");
      return value;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}
export const platform = { tenantId: null, role: "SUPER_ADMIN" as const };
