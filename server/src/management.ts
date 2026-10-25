import bcrypt from "bcrypt";
import multer from "multer";
import { z } from "zod";
import type { Api } from "./http.js";
import { empty, id, name, point } from "./http.js";
import type { Config } from "./config.js";
import { HttpError, requireValue } from "./errors.js";
import { decrypt, encrypt, identifier, driverIdentifier } from "./crypto.js";
const admin = ["ADMIN"] as const;
const student = z
  .object({
    name,
    routeId: id,
    stop: z.string().min(1).max(255),
    point,
    password: z.string().min(8).max(72).optional(),
  })
  .strict();
const vehicle = z
  .object({
    reg: z.string().trim().min(2).max(50),
    capacity: z.number().int().min(1).max(100),
  })
  .strict();
const route = z
  .object({
    name,
    driverId: id,
    vehicleId: id,
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default("06:15"),
    direction: z.enum(["TO_CAMPUS", "FROM_CAMPUS"]).default("TO_CAMPUS"),
  })
  .strict();
const fields = z
  .object({
    tenantId: id.optional(),
    name,
    cnic: z.string().min(3).max(30),
    license: z.string().min(2).max(50),
    expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reg: z.string().min(2).max(50),
    password: z.string().min(8).max(72).optional(),
  })
  .strict();
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 3, fields: 8, parts: 11 },
}).fields([
  { name: "cnicPhoto", maxCount: 1 },
  { name: "licensePhoto", maxCount: 1 },
  { name: "vehiclePhoto", maxCount: 1 },
]);
function imageType(b: Buffer) {
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return "image/jpeg";
  if (
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  throw new HttpError(400, "Documents must be PNG, JPEG or WebP images");
}
export function management(api: Api, c: Config) {
  const { app, db } = api;
  app.post("/api/v1/drivers/register", upload, async (req, res) => {
    if (req.user && !["ADMIN", "DRIVER"].includes(req.user.role))
      throw new HttpError(403, "Driver or administrator required");
    const b = fields.parse(req.body);
    const tenant = req.user?.tenantId ?? b.tenantId;
    if (!tenant) throw new HttpError(400, "Institution tenant ID required");
    if (req.user && b.tenantId && b.tenantId !== tenant)
      throw new HttpError(403, "Wrong institution");
    const files = req.files as Record<string, Express.Multer.File[]>;
    const images = ["cnicPhoto", "licensePhoto", "vehiclePhoto"].map((k) =>
      requireValue(files?.[k]?.[0], "All three document photos are required"),
    );
    const mime = images.map((f) => imageType(f.buffer));
    if (!req.user && !b.password)
      throw new HttpError(400, "Password required for a new account");
    const identity = req.user ?? {
      userId: "0",
      tenantId: tenant,
      role: "DRIVER" as const,
      version: 0,
    };
    const result = await db.run(identity, async (q) => {
      requireValue(
        (await q.query("SELECT id FROM tenants WHERE id=$1", [tenant])).rows[0],
      );
      let driverId = req.user?.role === "DRIVER" ? req.user.userId : undefined;
      let customId: string;
      if (driverId) {
        const existing = requireValue(
          (
            await q.query(
              "SELECT status FROM driver_verifications WHERE tenant_id=$1 AND driver_id=$2 FOR UPDATE",
              [tenant, driverId],
            )
          ).rows[0],
        );
        if (existing.status === "VERIFIED")
          throw new HttpError(
            409,
            "Verified documents cannot be replaced without administrator review",
          );
        customId = (
          await q.query(
            "SELECT custom_id FROM users WHERE tenant_id=$1 AND id=$2",
            [tenant, driverId],
          )
        ).rows[0].custom_id;
        await q.query("UPDATE users SET name=$1 WHERE id=$2 AND tenant_id=$3", [
          b.name,
          driverId,
          tenant,
        ]);
      } else {
        customId = identifier("APP");
        driverId = (
          await q.query(
            "INSERT INTO users(tenant_id,custom_id,name,password_hash,role) VALUES($1,$2,$3,$4,'DRIVER') RETURNING id",
            [
              tenant,
              customId,
              b.name,
              await bcrypt.hash(b.password ?? identifier("initial"), 12),
            ],
          )
        ).rows[0].id;
      }
      await q.query(
        "INSERT INTO driver_verifications(tenant_id,driver_id,cnic_number,license_number,license_expiry,vehicle_reg_number) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(driver_id) DO UPDATE SET cnic_number=EXCLUDED.cnic_number,license_number=EXCLUDED.license_number,license_expiry=EXCLUDED.license_expiry,vehicle_reg_number=EXCLUDED.vehicle_reg_number,status='PENDING',rejection_reason=NULL WHERE driver_verifications.tenant_id=$1",
        [
          tenant,
          driverId,
          encrypt(Buffer.from(b.cnic), c.DOCUMENT_KEY),
          b.license,
          b.expiry,
          b.reg,
        ],
      );
      for (const [i, kind] of ["cnic", "license", "vehicle"].entries())
        await q.query(
          "INSERT INTO document_blobs(tenant_id,driver_id,kind,mime_type,contents) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,driver_id,kind) DO UPDATE SET mime_type=EXCLUDED.mime_type,contents=EXCLUDED.contents",
          [
            tenant,
            driverId,
            kind,
            mime[i],
            encrypt(images[i].buffer, c.DOCUMENT_KEY),
          ],
        );
      return { id: driverId, customId, status: "PENDING" };
    });
    api.events.emit("changed", tenant);
    res.status(201).json(result);
  });
  api.route("get", "/admin/drivers", ["ADMIN"], empty, async ({ q, user }) => {
    const rows = (
      await q.query(
        "SELECT u.id,u.custom_id,u.name,v.* FROM driver_verifications v JOIN users u ON u.id=v.driver_id AND u.tenant_id=v.tenant_id WHERE v.tenant_id=$1 ORDER BY u.id",
        [user.tenantId],
      )
    ).rows;
    return rows.map((r) => ({
      ...r,
      id: r.driver_id,
      cnic_number: decrypt(r.cnic_number, c.DOCUMENT_KEY).toString(),
      license_expiring:
        new Date(r.license_expiry).getTime() - Date.now() < 30 * 86400000,
    }));
  });
  app.get("/api/v1/admin/drivers/:id/documents/:kind", async (req, res) => {
    if (
      req.user.role !== "ADMIN" &&
      !(req.user.role === "DRIVER" && req.user.userId === req.params.id)
    )
      throw new HttpError(403, "Document access denied");
    const driver = id.parse(req.params.id),
      kind = z.enum(["cnic", "license", "vehicle"]).parse(req.params.kind);
    const file = await db.run(req.user, async (q) =>
      requireValue(
        (
          await q.query(
            "SELECT mime_type,contents FROM document_blobs WHERE tenant_id=$1 AND driver_id=$2 AND kind=$3",
            [req.user.tenantId, driver, kind],
          )
        ).rows[0],
      ),
    );
    res
      .set("Cache-Control", "no-store")
      .type(file.mime_type)
      .send(decrypt(file.contents, c.DOCUMENT_KEY));
  });
  api.route(
    "patch",
    "/admin/drivers/:id/verify",
    ["ADMIN"],
    z
      .object({
        approved: z.boolean(),
        reason: z.string().max(1000).optional(),
      })
      .strict(),
    async ({ q, user, params }, b) => {
      if (!b.approved && !b.reason?.trim())
        throw new HttpError(400, "Rejection reason required");
      const v = requireValue(
        (
          await q.query(
            "SELECT * FROM driver_verifications WHERE tenant_id=$1 AND driver_id=$2 FOR UPDATE",
            [user.tenantId, params.id],
          )
        ).rows[0],
      );
      if (v.status !== "PENDING")
        throw new HttpError(409, "Only pending applications can be reviewed");
      let customId = (
        await q.query(
          "SELECT custom_id FROM users WHERE tenant_id=$1 AND id=$2",
          [user.tenantId, params.id],
        )
      ).rows[0].custom_id;
      if (b.approved) {
        if (
          new Date(v.license_expiry) <
          new Date(new Date().toISOString().slice(0, 10))
        )
          throw new HttpError(400, "License is expired");
        await q.query("SELECT pg_advisory_xact_lock(926810)");
        do {
          customId = driverIdentifier();
        } while (
          (await q.query("SELECT id FROM users WHERE custom_id=$1", [customId]))
            .rowCount
        );
        await q.query(
          "UPDATE users SET custom_id=$1 WHERE tenant_id=$2 AND id=$3",
          [customId, user.tenantId, params.id],
        );
      }
      await q.query(
        "UPDATE driver_verifications SET status=$1,rejection_reason=$2,reviewed_by=$3,verified_at=CASE WHEN $4 THEN now() ELSE NULL END WHERE tenant_id=$5 AND driver_id=$6",
        [
          b.approved ? "VERIFIED" : "REJECTED",
          b.reason ?? null,
          user.userId,
          b.approved,
          user.tenantId,
          params.id,
        ],
      );
      return { customId, status: b.approved ? "VERIFIED" : "REJECTED" };
    },
  );
  api.route(
    "post",
    "/admin/users/:id/password",
    ["ADMIN"],
    z.object({ password: z.string().min(8).max(72) }).strict(),
    async ({ q, user, params }, b) => {
      const target = requireValue(
        (
          await q.query("SELECT role FROM users WHERE tenant_id=$1 AND id=$2", [
            user.tenantId,
            params.id,
          ])
        ).rows[0],
      );
      if (target.role === "ADMIN" && params.id !== user.userId)
        throw new HttpError(403, "Cannot reset another administrator");
      await q.query(
        "UPDATE users SET password_hash=$1,token_version=token_version+1,locked_until=NULL,login_failures=0 WHERE tenant_id=$2 AND id=$3",
        [await bcrypt.hash(b.password, 12), user.tenantId, params.id],
      );
      api.events.emit("revoke", params.id);
      return { ok: true };
    },
  );
  api.route(
    "post",
    "/admin/students",
    ["ADMIN"],
    student,
    async ({ q, user }, b) => addStudent(q, user.tenantId!, b),
  );
  api.route(
    "put",
    "/admin/students/:id",
    ["ADMIN"],
    student,
    async ({ q, user, params }, b) => {
      requireValue(
        (
          await q.query(
            "SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND role='STUDENT'",
            [user.tenantId, params.id],
          )
        ).rows[0],
      );
      await q.query("UPDATE users SET name=$1 WHERE tenant_id=$2 AND id=$3", [
        b.name,
        user.tenantId,
        params.id,
      ]);
      await q.query(
        "UPDATE student_stops SET route_id=$1,stop_name=$2,latitude=$3,longitude=$4 WHERE tenant_id=$5 AND student_id=$6",
        [b.routeId, b.stop, ...b.point, user.tenantId, params.id],
      );
      return { id: params.id };
    },
  );
  api.route(
    "delete",
    "/admin/students/:id",
    ["ADMIN"],
    empty,
    async ({ q, user, params }) => {
      if (
        !(
          await q.query(
            "DELETE FROM users WHERE tenant_id=$1 AND id=$2 AND role='STUDENT'",
            [user.tenantId, params.id],
          )
        ).rowCount
      )
        throw new HttpError(404, "Student not found");
      return { ok: true };
    },
  );
  api.route(
    "post",
    "/admin/students/import",
    ["ADMIN"],
    z.object({ csv: z.string().min(1).max(200000), routeId: id }).strict(),
    async ({ q, user }, b) => {
      const rows = parseCsv(b.csv);
      const created = [];
      for (const row of rows)
        created.push(
          await addStudent(q, user.tenantId!, { ...row, routeId: b.routeId }),
        );
      return { students: created };
    },
  );
  for (const kind of ["vehicles", "routes"] as const) {
    const schema = kind === "vehicles" ? vehicle : route;
    api.route(
      "get",
      `/admin/${kind}`,
      [...admin],
      empty,
      async ({ q, user }) =>
        (
          await q.query(
            kind === "vehicles"
              ? "SELECT * FROM vehicles WHERE tenant_id=$1 ORDER BY id"
              : "SELECT * FROM routes WHERE tenant_id=$1 ORDER BY id",
            [user.tenantId],
          )
        ).rows,
    );
    api.route(
      "post",
      `/admin/${kind}`,
      [...admin],
      schema,
      async ({ q, user }, b) => {
        if (kind === "routes") await validDriver(q, user.tenantId!, b.driverId);
        return (
          await q.query(
            kind === "vehicles"
              ? "INSERT INTO vehicles(tenant_id,reg_number,capacity) VALUES($1,$2,$3) RETURNING *"
              : "INSERT INTO routes(tenant_id,name,driver_id,vehicle_id,start_time,direction) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            kind === "vehicles"
              ? [user.tenantId, b.reg, b.capacity]
              : [
                  user.tenantId,
                  b.name,
                  b.driverId,
                  b.vehicleId,
                  b.startTime,
                  b.direction,
                ],
          )
        ).rows[0];
      },
    );
    api.route(
      "put",
      `/admin/${kind}/:id`,
      [...admin],
      schema,
      async ({ q, user, params }, b) => {
        if (kind === "routes") {
          await validDriver(q, user.tenantId!, b.driverId);
          const active = (
            await q.query(
              "SELECT id FROM trips WHERE tenant_id=$1 AND route_id=$2 AND status IN('IN_PROGRESS','ARRIVED')",
              [user.tenantId, params.id],
            )
          ).rowCount;
          if (active)
            throw new HttpError(
              409,
              "End the active trip before changing its assignment",
            );
        }
        return requireValue(
          (
            await q.query(
              kind === "vehicles"
                ? "UPDATE vehicles SET reg_number=$1,capacity=$2 WHERE tenant_id=$3 AND id=$4 RETURNING *"
                : "UPDATE routes SET name=$1,driver_id=$2,vehicle_id=$3,start_time=$4,direction=$5 WHERE tenant_id=$6 AND id=$7 RETURNING *",
              kind === "vehicles"
                ? [b.reg, b.capacity, user.tenantId, params.id]
                : [
                    b.name,
                    b.driverId,
                    b.vehicleId,
                    b.startTime,
                    b.direction,
                    user.tenantId,
                    params.id,
                  ],
            )
          ).rows[0],
        );
      },
    );
    api.route(
      "delete",
      `/admin/${kind}/:id`,
      [...admin],
      empty,
      async ({ q, user, params }) => {
        const result = await q.query(
          kind === "vehicles"
            ? "DELETE FROM vehicles WHERE tenant_id=$1 AND id=$2"
            : "DELETE FROM routes WHERE tenant_id=$1 AND id=$2",
          [user.tenantId, params.id],
        );
        if (!result.rowCount) throw new HttpError(404, "Record not found");
        return { ok: true };
      },
    );
  }
  api.route("get", "/admin/settings", ["ADMIN"], empty, async ({ q, user }) =>
    requireValue(
      (await q.query("SELECT * FROM tenants WHERE id=$1", [user.tenantId]))
        .rows[0],
    ),
  );
  api.route(
    "put",
    "/admin/settings",
    ["ADMIN"],
    z
      .object({
        cutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        tripTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        campus: point,
        fee: z.number().min(0).max(1000000),
        commission: z.number().min(0).max(100),
        demoOffsetMinutes: z.number().int().min(-1440).max(1440).optional(),
      })
      .strict(),
    async ({ q, user }, b) => {
      if (b.demoOffsetMinutes !== undefined && c.DEMO_ENABLED !== "true")
        throw new HttpError(403, "Demo helpers are disabled");
      return (
        await q.query(
          "UPDATE tenants SET attendance_cutoff_time=$1,trip_time=$2,destination_lat=$3,destination_lng=$4,monthly_fee=$5,platform_commission_pct=$6,demo_offset_minutes=COALESCE($7,demo_offset_minutes) WHERE id=$8 RETURNING *",
          [
            b.cutoff,
            b.tripTime,
            ...b.campus,
            b.fee,
            b.commission,
            b.demoOffsetMinutes ?? null,
            user.tenantId,
          ],
        )
      ).rows[0];
    },
  );
  api.route(
    "get",
    "/tenants",
    ["SUPER_ADMIN"],
    empty,
    async ({ q }) =>
      (
        await q.query(
          "SELECT id,name,type,plan,contact_email FROM tenants ORDER BY id",
        )
      ).rows,
  );
  api.route(
    "post",
    "/tenants",
    ["SUPER_ADMIN"],
    z
      .object({
        name,
        type: z.enum(["SCHOOL", "COLLEGE", "UNIVERSITY", "COACHING"]),
        plan: z.enum(["Free", "Driver Pro", "Institute", "Enterprise"]),
        email: z.email(),
        adminName: name,
        adminPassword: z.string().min(8).max(72),
      })
      .strict(),
    async ({ q }, b) => {
      const t = (
        await q.query(
          "INSERT INTO tenants(name,type,plan,contact_email) VALUES($1,$2,$3,$4) RETURNING *",
          [b.name, b.type, b.plan, b.email],
        )
      ).rows[0];
      const customId = `SCH-${t.id}-${identifier("ADM").slice(4)}`;
      await q.query(
        "INSERT INTO users(tenant_id,custom_id,name,password_hash,role) VALUES($1,$2,$3,$4,'ADMIN')",
        [t.id, customId, b.adminName, await bcrypt.hash(b.adminPassword, 12)],
      );
      return { tenant: t, adminCustomId: customId };
    },
  );
}
async function validDriver(
  q: import("./db.js").Db,
  tenant: string,
  driver: string,
) {
  const v = (
    await q.query(
      "SELECT driver_id FROM driver_verifications WHERE tenant_id=$1 AND driver_id=$2 AND status='VERIFIED'",
      [tenant, driver],
    )
  ).rows[0];
  if (!v)
    throw new HttpError(400, "Assign a verified driver in this institution");
}
async function addStudent(
  q: import("./db.js").Db,
  tenant: string,
  b: z.infer<typeof student>,
) {
  requireValue(
    (
      await q.query("SELECT id FROM routes WHERE id=$1 AND tenant_id=$2", [
        b.routeId,
        tenant,
      ])
    ).rows[0],
  );
  const customId = `STU-${new Date().getFullYear()}-${identifier("S").slice(2)}`;
  const password = b.password ?? identifier("initial");
  const u = (
    await q.query(
      "INSERT INTO users(tenant_id,custom_id,name,password_hash,role) VALUES($1,$2,$3,$4,'STUDENT') RETURNING id",
      [tenant, customId, b.name, await bcrypt.hash(password, 12)],
    )
  ).rows[0];
  await q.query(
    "INSERT INTO student_stops(tenant_id,student_id,route_id,stop_name,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6)",
    [tenant, u.id, b.routeId, b.stop, ...b.point],
  );
  return { id: u.id, customId, initialPassword: password };
}
export function parseCsv(csv: string) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.shift()?.trim() !== "name,stop,latitude,longitude")
    throw new HttpError(400, "CSV header must be name,stop,latitude,longitude");
  if (!lines.length || lines.length > 200)
    throw new HttpError(400, "Import between 1 and 200 students");
  return lines.map((line) => {
    const r = line.split(",").map((s) => s.trim());
    if (r.length !== 4)
      throw new HttpError(400, "Each CSV row must have four fields");
    return z
      .object({ name, stop: z.string().min(1).max(255), point })
      .parse({ name: r[0], stop: r[1], point: [Number(r[2]), Number(r[3])] });
  });
}
