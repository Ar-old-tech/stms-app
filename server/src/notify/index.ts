import type { Config } from "../config.js";
import type { Database, Identity } from "../db.js";
import { platform } from "../db.js";
import { empty, type Api } from "../http.js";
import { z } from "zod";
import { deliver, maskedPhone, type NotificationProvider } from "./provider.js";
import { TwilioSms } from "./twilio_sms.js";
import { TwilioWhatsapp } from "./twilio_whatsapp.js";
import type { Server } from "node:http";
import { HttpError } from "../errors.js";

export class Notifier {
  readonly providers: NotificationProvider[];
  private work = new Set<Promise<void>>();
  private busy = new Set<string>();
  constructor(
    private db: Database,
    private api: Api,
    private c: Config,
    http: Server,
    providers?: NotificationProvider[],
  ) {
    this.providers = providers ?? [new TwilioSms(c), new TwilioWhatsapp(c)];
    api.events.on("sos-dispatch", (user: Identity, id: string) =>
      this.enqueue(user, id),
    );
    const poll = setInterval(() => void this.resume(), 30000);
    poll.unref();
    http.once("close", () => clearInterval(poll));
    void this.resume();
    api.route("get", "/admin/notify/status", ["ADMIN"], empty, async () =>
      this.providers.map((p) => ({
        channel: p.channel,
        name: p.name,
        configured: p.configured,
        status: p.configured
          ? "Configured · provider acceptance only"
          : "Not configured",
      })),
    );
    const tests = new Map<string, number>();
    api.route(
      "post",
      "/admin/notify/test",
      ["ADMIN"],
      z.object({ channel: z.enum(["SMS", "WHATSAPP"]) }).strict(),
      async ({ q, user }, b) => {
        const key = `${user.tenantId}:${user.userId}`;
        if (Date.now() - (tests.get(key) ?? 0) < 60000)
          throw new HttpError(429, "Wait one minute before another test");
        tests.set(key, Date.now());
        const phone = (
          await q.query(
            "SELECT phone FROM users WHERE tenant_id=$1 AND id=$2",
            [user.tenantId, user.userId],
          )
        ).rows[0]?.phone;
        if (!phone)
          return {
            status: "NOT_CONFIGURED",
            error:
              "Your admin account has no phone. Ask your operator to configure it.",
          };
        const provider = this.providers.find((p) => p.channel === b.channel)!;
        return deliver(
          provider,
          phone,
          "STMS test message. No emergency was raised.",
        );
      },
    );
  }
  async resume() {
    try {
      const rows = await this.db.run(
        platform,
        async (q) =>
          (
            await q.query(
              "SELECT DISTINCT tenant_id,sos_id FROM sos_recipients WHERE status='PENDING' AND channel<>'IN_APP' LIMIT 100",
            )
          ).rows,
      );
      for (const r of rows)
        this.enqueue(
          { tenantId: r.tenant_id, userId: "0", role: "ADMIN", version: 0 },
          r.sos_id,
        );
    } catch {
      /* A later poll retries a transient database failure. */
    }
  }
  enqueue(user: Identity, id: string) {
    const key = `${user.tenantId}:${id}`;
    if (this.busy.has(key)) return;
    this.busy.add(key);
    const job = this.dispatch(user, id)
      .catch(() => {})
      .finally(() => {
        this.work.delete(job);
        this.busy.delete(key);
      });
    this.work.add(job);
  }
  async settled() {
    await Promise.all([...this.work]);
  }
  private async dispatch(user: Identity, id: string) {
    const rows = await this.db.run(
      user,
      async (q) =>
        (
          await q.query(
            `SELECT d.*,u.phone,s.type,s.message,s.raised_by_role,COALESCE(child.name,sender.name) AS name
   FROM sos_recipients d JOIN users u ON u.tenant_id=d.tenant_id AND u.id=d.user_id
   JOIN sos_events s ON s.tenant_id=d.tenant_id AND s.id=d.sos_id
   JOIN users sender ON sender.tenant_id=s.tenant_id AND sender.id=s.raised_by
   LEFT JOIN users child ON child.tenant_id=s.tenant_id AND child.id=s.student_id AND s.raised_by_role='PARENT'
   WHERE d.tenant_id=$1 AND d.sos_id=$2 AND d.status='PENDING' AND d.channel<>'IN_APP'`,
            [user.tenantId, id],
          )
        ).rows,
    );
    await Promise.all(
      rows.map(async (r) => {
        const claimed = await this.db.run(
          user,
          async (q) =>
            (
              await q.query(
                "UPDATE sos_recipients SET status='PROCESSING' WHERE tenant_id=$1 AND sos_id=$2 AND user_id=$3 AND channel=$4 AND status='PENDING' RETURNING user_id",
                [user.tenantId, id, r.user_id, r.channel],
              )
            ).rowCount,
        );
        if (!claimed) return;
        const p = this.providers.find((p) => p.channel === r.channel);
        const text = `STMS EMERGENCY: ${r.type} raised by ${r.name}. ${r.message}. Live location: ${(this.c.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/#sos-${id}`;
        const result = p
          ? await deliver(p, r.phone, text)
          : { status: "NOT_CONFIGURED", error: "Provider not configured" };
        await this.db.run(user, (q) =>
          q.query(
            "UPDATE sos_recipients SET status=$5,error=$6,sent_at=now() WHERE tenant_id=$1 AND sos_id=$2 AND user_id=$3 AND channel=$4",
            [
              user.tenantId,
              id,
              r.user_id,
              r.channel,
              result.status,
              result.error,
            ],
          ),
        );
        if (result.status === "FAILED")
          console.warn(
            `SOS ${id} ${r.channel} failed for ${maskedPhone(r.phone)}`,
          );
      }),
    );
    const audience = await this.db.run(
      user,
      async (q) =>
        (
          await q.query(
            "SELECT user_id FROM sos_recipients WHERE tenant_id=$1 AND sos_id=$2 AND channel='IN_APP'",
            [user.tenantId, id],
          )
        ).rows,
    );
    for (const r of audience)
      this.api.events.emit("message", {
        room: `user:${r.user_id}`,
        event: "sos",
        data: { id },
      });
  }
}
