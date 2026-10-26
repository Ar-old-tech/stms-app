import type { Db, Identity } from './db.js';
import type { Config } from './config.js';
import { z } from 'zod';
import { empty, id, point, type Api, type Context } from './http.js';
import type { Runtime } from './runtime.js';
import { tripAccess } from './runtime.js';
import { HttpError, requireValue } from './errors.js';

export const sosSchema = z.object({
  type: z.enum(['ACCIDENT','MEDICAL','BREAKDOWN','UNSAFE','LOST','OTHER']),
  message: z.string().trim().max(300).default(''),
  studentId: id.optional(), tripId: id.optional(), point: point.optional(),
  confirmed: z.literal(true),
}).strict().superRefine((b, ctx) => {
  if (b.type === 'OTHER' && !b.message) ctx.addIssue({code:'custom',path:['message'],message:'Describe the emergency'});
});

export function sosRoutes(api: Api, rt: Runtime, c: Config) {
 const roles = ['ADMIN','DRIVER','STUDENT','PARENT'] as const;
 const read = async (ctx: Context) => requireValue((await visibleSos(ctx.q,ctx.user,ctx.params.id))[0]);
 const publish = async (ctx: Context, event: any) => {
   const recipients=(await ctx.q.query("SELECT user_id FROM sos_recipients WHERE tenant_id=$1 AND sos_id=$2 AND channel='IN_APP'",[ctx.user.tenantId,event.id])).rows;
   for (const r of recipients) ctx.send(`user:${r.user_id}`,'sos',{id:event.id,status:event.status});
 };
 api.route('get','/sos',[...roles],empty,ctx=>visibleSos(ctx.q,ctx.user));
 api.route('get','/sos/:id',[...roles],empty,read);
 api.route('post','/sos',['DRIVER','STUDENT','PARENT'],sosSchema,async (ctx,b) => {
   const {q,user}=ctx;
   // Serialize requests for one sender across processes, then count committed events.
   await q.query('SELECT id FROM users WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[user.tenantId,user.userId]);
   const count=(await q.query("SELECT count(*)::int AS n FROM sos_events WHERE tenant_id=$1 AND raised_by=$2 AND created_at>now()-interval '10 minutes'",[user.tenantId,user.userId])).rows[0].n;
   if(count>=3) throw new HttpError(429,'Limit: 3 SOS alerts per 10 minutes');
   const studentId=user.role==='STUDENT' ? user.userId : user.role==='PARENT' ? b.studentId : null;
   if(user.role==='STUDENT' && b.studentId && b.studentId!==user.userId) throw new HttpError(404,'Not found');
   if(user.role==='PARENT' && (!studentId || !(await q.query('SELECT 1 FROM parent_students WHERE tenant_id=$1 AND parent_id=$2 AND student_id=$3',[user.tenantId,user.userId,studentId])).rowCount)) throw new HttpError(404,'Not found');
   const trip=b.tripId ? await tripAccess(q,user,b.tripId) : null;
   if(trip && studentId && !(await q.query('SELECT 1 FROM student_stops WHERE tenant_id=$1 AND student_id=$2 AND route_id=$3',[user.tenantId,studentId,trip.route_id])).rowCount) throw new HttpError(404,'Not found');
   if(user.role==='DRIVER' && !trip) throw new HttpError(400,'A driver SOS requires an assigned trip');
   const sample=trip ? (await q.query('SELECT latitude,longitude FROM trip_events WHERE tenant_id=$1 AND trip_id=$2 AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY created_at DESC LIMIT 1',[user.tenantId,trip.id])).rows[0] : null;
   const p=b.point ?? rt.live.get(`${user.tenantId}:${trip?.id}`)?.point ?? (sample ? [sample.latitude,sample.longitude] : null);
   if(!p) throw new HttpError(400,'Location unavailable. Enable location or use a trip with a known position.');
   const row=(await q.query('INSERT INTO sos_events(tenant_id,trip_id,raised_by,latitude,longitude,type,message,raised_by_role,student_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[user.tenantId,trip?.id ?? null,user.userId,...p,b.type,b.message,user.role,studentId])).rows[0];
   const audience=await sosAudience(q,user,studentId,trip,c);
   for(const r of audience) await q.query("INSERT INTO sos_recipients(tenant_id,sos_id,user_id,channel,status,sent_at) VALUES($1,$2,$3,'IN_APP','DELIVERED',now())",[user.tenantId,row.id,r.id]);
   await publish(ctx,row);
   return read({...ctx,params:{id:row.id}});
 });
 api.route('post','/sos/:id/seen',[...roles],empty,async ctx=>{
   const event=await read(ctx);
   await ctx.q.query("UPDATE sos_recipients SET status='SEEN' WHERE tenant_id=$1 AND sos_id=$2 AND user_id=$3 AND channel='IN_APP' AND status='DELIVERED'",[ctx.user.tenantId,event.id,ctx.user.userId]);
   await publish(ctx,event); return read(ctx);
 });
 api.route('post','/sos/:id/acknowledge',[...roles],empty,async ctx=>{
   const event=await read(ctx);
   await ctx.q.query("UPDATE sos_events SET status='ACKNOWLEDGED',acknowledged_by=$3,acknowledged_at=now() WHERE tenant_id=$1 AND id=$2 AND status='OPEN'",[ctx.user.tenantId,event.id,ctx.user.userId]);
   await ctx.q.query("UPDATE sos_recipients SET status='ACKNOWLEDGED' WHERE tenant_id=$1 AND sos_id=$2 AND user_id=$3 AND channel='IN_APP'",[ctx.user.tenantId,event.id,ctx.user.userId]);
   const result=await read(ctx); await publish(ctx,result); return result;
 });
 api.route('patch','/admin/sos/:id',['ADMIN'],z.object({resolved:z.literal(true)}).strict(),async ctx=>{
   const event=await read(ctx);
   await ctx.q.query("UPDATE sos_events SET status='RESOLVED',resolved=true,resolved_by=$3,resolved_at=now() WHERE tenant_id=$1 AND id=$2 AND status<>'RESOLVED'",[ctx.user.tenantId,event.id,ctx.user.userId]);
   const result=await read(ctx); await publish(ctx,result); return result;
 });
}

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
