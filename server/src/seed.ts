import bcrypt from "bcrypt";
import type { Db } from "./db.js";
import { Database, platform } from "./db.js";
import { config } from "./config.js";
import { encrypt, decrypt, cnicFingerprint } from "./crypto.js";
import { fileURLToPath } from "node:url";
export const places = [
  ["Committee Chowk", 33.603, 73.068],
  ["Satellite Town", 33.636, 73.065],
  ["Faizabad", 33.659, 73.081],
  ["I-8 Markaz", 33.6683, 73.0759],
  ["Chandni Chowk", 33.614, 73.072],
  ["G-9 Markaz", 33.6951, 73.039],
  ["F-10 Markaz", 33.694, 73.012],
  ["H-8", 33.661, 73.056],
] as const;
export async function seedTenant(
  q: Db,
  tenant: string,
  key: string,
  city = false,
  keepAdmin = false,
) {
  const hash = await bcrypt.hash("demo123", 12);
  const add = async (id: string, name: string, role: string) =>
    (
      await q.query(
        "INSERT INTO users(tenant_id,custom_id,name,role,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [tenant, id, name, role, hash],
      )
    ).rows[0].id as string;
  if (!keepAdmin)
    await add(
      city ? "SCH-02-ADM" : "SCH-01-ADM",
      city ? "City administrator" : "Sunrise administrator",
      "ADMIN",
    );
  const driver = await add(
    city ? "DRV-6723" : "DRV-4821",
    "Imran Khan",
    "DRIVER",
  );
  const drivers = [
    driver,
    ...(!city
      ? [
          await add("PENDING-USMAN", "Usman Ahmed", "DRIVER"),
          await add("PENDING-BILAL", "Bilal Shah", "DRIVER"),
        ]
      : []),
  ];
  for (const [i, id] of drivers.entries()) {
    await q.query(
      "INSERT INTO driver_verifications(tenant_id,driver_id,cnic_number,license_number,license_expiry,vehicle_reg_number,status,cnic_fingerprint) VALUES($1,$2,$3,$4,current_date+($5::int),$6,$7,$8)",
      [
        tenant,
        id,
        encrypt(Buffer.from(`DEMO-IDENTITY-${city ? "CITY" : i + 1}`), key),
        `DEMO-LIC-${city ? "CITY" : i + 1}`,
        i === 1 ? 16 : 365,
        city
          ? "CITY-1122"
          : i === 0
            ? "ICT-1182"
            : i === 1
              ? "RWP-2094"
              : "ICT-7720",
        i === 0 ? "VERIFIED" : "PENDING",
        cnicFingerprint(`DEMO-IDENTITY-${city ? "CITY" : i + 1}`, key),
      ],
    );
  }
  const v = (
    await q.query(
      "INSERT INTO vehicles(tenant_id,reg_number,capacity) VALUES($1,$2,12) RETURNING id",
      [tenant, city ? "CITY-1122" : "ICT-1182"],
    )
  ).rows[0].id;
  const route = (
    await q.query(
      "INSERT INTO routes(tenant_id,name,driver_id,vehicle_id) VALUES($1,'Twin Cities Morning',$2,$3) RETURNING id",
      [tenant, driver, v],
    )
  ).rows[0].id;
  const names = city
    ? ["City Student"]
    : [
        "Ayesha Khan",
        "Hassan Ali",
        "Fatima Ahmed",
        "Omar Farooq",
        "Zainab Malik",
        "Ali Raza",
        "Maryam Shah",
        "Ibrahim Noor",
      ];
  for (const [i, name] of names.entries()) {
    const id = await add(
      city ? "STU-2026-CITY" : i === 0 ? "STU-2026-44" : `STU-2026-${50 + i}`,
      name,
      "STUDENT",
    );
    const p = places[i];
    await q.query(
      "INSERT INTO student_stops(tenant_id,student_id,route_id,stop_name,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6)",
      [tenant, id, route, p[0], p[1], p[2]],
    );
    await q.query(
      "INSERT INTO fee_transactions(tenant_id,student_id,period_month,monthly_fee,platform_commission_pct,net_driver_payout,status,receipt_number) VALUES($1,$2,date_trunc('month',now() AT TIME ZONE 'Asia/Karachi')::date,6500,5,6175,$3,$4)",
      [
        tenant,
        id,
        i === 0 ? "PENDING" : i % 3 === 0 ? "FAILED" : "PAID",
        i === 0 || i % 3 === 0 ? null : `SEED-${tenant}-${i}`,
      ],
    );
  }
  const trip = (
    await q.query(
      "INSERT INTO trips(tenant_id,route_id,driver_id,trip_date) VALUES($1,$2,$3,(now() AT TIME ZONE 'Asia/Karachi')::date) RETURNING id",
      [tenant, route, driver],
    )
  ).rows[0].id;
  await q.query(
    "INSERT INTO trip_events(tenant_id,trip_id,event_type,speed_kmh) VALUES($1,$2,'OVER_SPEED',64)",
    [tenant, trip],
  );
  await q.query(
    "INSERT INTO sos_events(tenant_id,trip_id,raised_by,latitude,longitude,resolved) VALUES($1,$2,$3,33.5973,73.0479,true)",
    [tenant, trip, driver],
  );
}
export async function seed(db: Database, key: string) {
  await db.run(platform, async (q) => {
    for (const v of (
      await q.query(
        "SELECT id,tenant_id,cnic_number FROM driver_verifications WHERE cnic_fingerprint IS NULL",
      )
    ).rows) {
      await q.query(
        "UPDATE driver_verifications SET cnic_fingerprint=$1 WHERE tenant_id=$2 AND id=$3",
        [
          cnicFingerprint(decrypt(v.cnic_number, key).toString(), key),
          v.tenant_id,
          v.id,
        ],
      );
    }
    const hash = await bcrypt.hash("demo123", 12);
    await q.query(
      "INSERT INTO users(custom_id,name,role,password_hash) VALUES('SUP-01','Platform administrator','SUPER_ADMIN',$1) ON CONFLICT(custom_id) DO NOTHING",
      [hash],
    );
    for (const [i, name] of [
      "Sunrise Coaching Center",
      "City College",
    ].entries()) {
      const email = i ? "city@example.test" : "sunrise@example.test";
      if (
        (
          await q.query("SELECT id FROM tenants WHERE contact_email=$1", [
            email,
          ])
        ).rowCount
      )
        continue;
      const t = (
        await q.query(
          "INSERT INTO tenants(name,type,contact_email,plan) VALUES($1,$2,$3,$4) RETURNING id",
          [
            name,
            i ? "COLLEGE" : "COACHING",
            email,
            i ? "Institute" : "Driver Pro",
          ],
        )
      ).rows[0].id;
      await seedTenant(q, t, key, !!i);
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const c = config(),
    db = new Database(c);
  seed(db, c.DOCUMENT_KEY)
    .then(() => console.log("Demo data seeded (existing tenants preserved)"))
    .catch(() => {
      console.error("Seed failed; check migrations and configuration");
      process.exitCode = 1;
    })
    .finally(() => db.close());
}
