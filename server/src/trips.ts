import type { Db } from "./db.js";
import { requireValue } from "./errors.js";
import { tenantClock } from "./routing.js";

// All callers use the tenant's clock, including its explicit demo offset.
export async function ensureDailyTrips(
  q: Db,
  tenant: string,
  routeId: string | null = null,
) {
  const t = requireValue(
    (await q.query("SELECT * FROM tenants WHERE id=$1", [tenant])).rows[0],
  );
  const clock = tenantClock(t);
  // Serialize against route reassignment before reading the assigned driver.
  await q.query(
    "SELECT id FROM routes WHERE tenant_id=$1 AND ($2::bigint IS NULL OR id=$2) ORDER BY id FOR UPDATE",
    [tenant, routeId],
  );
  await q.query(
    `INSERT INTO trips(tenant_id,route_id,driver_id,trip_date)
     SELECT r.tenant_id,r.id,r.driver_id,$2 FROM routes r
     JOIN users u ON u.tenant_id=r.tenant_id AND u.id=r.driver_id AND u.role='DRIVER' AND u.active=true
     JOIN driver_verifications v ON v.tenant_id=r.tenant_id AND v.driver_id=r.driver_id
     WHERE r.tenant_id=$1 AND v.status='VERIFIED' AND r.vehicle_id IS NOT NULL AND ($3::bigint IS NULL OR r.id=$3)
     ON CONFLICT(tenant_id,route_id,trip_date) DO UPDATE SET driver_id=EXCLUDED.driver_id
     WHERE trips.status='IDLE' AND trips.driver_id IS DISTINCT FROM EXCLUDED.driver_id`,
    [tenant, clock.date, routeId],
  );
  return { t, clock };
}
