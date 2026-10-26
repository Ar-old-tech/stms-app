import type { Db, Identity } from './db.js';
import type { Config } from './config.js';

// Snapshot recipients when raised. All subsequent reads use this same ACL.
export async function sosAudience(q: Db, user: Identity, studentId: string | null, trip: any, c: Config) {
  return (await q.query(`SELECT DISTINCT u.id,u.role FROM users u WHERE u.tenant_id=$1 AND u.active=true AND (
    u.id=$2 OR
    (u.role='ADMIN' AND ($3='DRIVER' OR $6::boolean)) OR
    ($3='DRIVER' AND (
      (u.role='STUDENT' AND EXISTS(SELECT 1 FROM student_stops s WHERE s.tenant_id=$1 AND s.route_id=$5 AND s.student_id=u.id)) OR
      (u.role='PARENT' AND EXISTS(SELECT 1 FROM parent_students p JOIN student_stops s ON s.tenant_id=p.tenant_id AND s.student_id=p.student_id WHERE p.tenant_id=$1 AND p.parent_id=u.id AND s.route_id=$5)))) OR
    ($3<>'DRIVER' AND (u.id=$4 OR
      (u.role='PARENT' AND EXISTS(SELECT 1 FROM parent_students p WHERE p.tenant_id=$1 AND p.student_id=$4 AND p.parent_id=u.id)) OR
      (u.role='DRIVER' AND u.id=$7 AND $8::boolean)))
  ) ORDER BY u.id`, [user.tenantId,user.userId,user.role,studentId,trip?.route_id ?? null,c.SOS_STUDENT_VISIBLE_TO_ADMIN !== 'false',trip?.driver_id ?? null,c.SOS_STUDENT_VISIBLE_TO_DRIVER === 'true'])).rows;
}

export async function visibleSos(q: Db, user: Identity, eventId: string | null = null) {
  return (await q.query(`SELECT s.*,u.name AS source,u.phone, a.name AS acknowledged_name,
    json_build_array(s.latitude,s.longitude) AS point, s.tenant_id AS "tenantId",s.trip_id AS "tripId",
    (SELECT COALESCE(json_agg(json_build_object('role',r.role,'channel',r.channel,'status',r.status,'count',r.n)), '[]'::json) FROM
      (SELECT u2.role,d.channel,d.status,count(*) AS n FROM sos_recipients d JOIN users u2 ON u2.tenant_id=d.tenant_id AND u2.id=d.user_id WHERE d.tenant_id=s.tenant_id AND d.sos_id=s.id GROUP BY u2.role,d.channel,d.status) r) AS recipients
    FROM sos_events s JOIN users u ON u.tenant_id=s.tenant_id AND u.id=s.raised_by
    LEFT JOIN users a ON a.tenant_id=s.tenant_id AND a.id=s.acknowledged_by
    WHERE s.tenant_id=$1 AND ($3::bigint IS NULL OR s.id=$3)
    AND (s.raised_by=$2 OR EXISTS(SELECT 1 FROM sos_recipients d WHERE d.tenant_id=s.tenant_id AND d.sos_id=s.id AND d.user_id=$2 AND d.channel='IN_APP'))
    ORDER BY s.created_at DESC LIMIT 100`, [user.tenantId,user.userId,eventId])).rows;
}
