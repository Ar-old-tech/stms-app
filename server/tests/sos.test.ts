import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { testDatabase } from './database.js';
import { createApp } from '../src/app.js';
import { platform } from '../src/db.js';
let env: Awaited<ReturnType<typeof testDatabase>>, server: ReturnType<typeof createApp>;
const tokens: Record<string,string>={}, ids: Record<string,string>={}, sockets: Socket[]=[];
let tripId='';
beforeAll(async()=>{
 env=await testDatabase();server=createApp(env.db,env.c);server.finish();
 await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));
 for(const key of ['SCH-01-ADM','DRV-4821','STU-2026-44','STU-2026-51','PAR-2026-44','PAR-2026-51','SCH-02-ADM']) {
  const r=await request(server.app).post('/api/v1/auth/login').send({customId:key,password:'demo123'});
  expect(r.status).toBe(200);tokens[key]=r.body.token;ids[key]=r.body.user.userId;
 }
 await env.db.run(platform,async q=>{
  const trip=(await q.query('SELECT * FROM trips WHERE driver_id=$1',[ids['DRV-4821']])).rows[0];tripId=trip.id;
  const route=(await q.query("INSERT INTO routes(tenant_id,name) VALUES($1,'Other trip') RETURNING id",[trip.tenant_id])).rows[0];
  await q.query('UPDATE student_stops SET route_id=$1 WHERE tenant_id=$2 AND student_id=$3',[route.id,trip.tenant_id,ids['STU-2026-51']]);
 });
});
afterAll(async()=>{for(const s of sockets)s.disconnect();await server?.runtime.close();await env?.close();});
const api=(key:string)=>({
 get:(path:string)=>request(server.app).get('/api/v1'+path).auth(tokens[key],{type:'bearer'}),
 post:(path:string,body:unknown={})=>request(server.app).post('/api/v1'+path).auth(tokens[key],{type:'bearer'}).send(body),
});
async function verify(eventId:string, allowed:string[]) {
 for(const key of Object.keys(tokens)) {
  const r=await api(key).get('/sos/'+eventId);expect(r.status,key).toBe(allowed.includes(key)?200:404);
  const list=await api(key).get('/sos');expect(list.body.some((e:any)=>e.id===eventId),key).toBe(allowed.includes(key));
  const workspace=await api(key).get('/workspace');expect(workspace.body.sos.some((e:any)=>e.id===eventId),key).toBe(allowed.includes(key));
 }
}
it('enforces driver/student family visibility identically in REST, workspace and private sockets',async()=>{
 const received:Record<string,string[]>={};
 for(const key of Object.keys(tokens)) {
  received[key]=[];
  const socket=io(`http://127.0.0.1:${(server.http.address() as any).port}`,{auth:{token:tokens[key]},transports:['websocket'],autoConnect:false});sockets.push(socket);
  socket.on('sos',e=>received[key].push(e.id));
  await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);socket.connect();});
 }
 for(const [sender,type,allowed] of [
  ['DRV-4821','ACCIDENT',['DRV-4821','SCH-01-ADM','STU-2026-44','PAR-2026-44']],
  ['STU-2026-44','UNSAFE',['STU-2026-44','PAR-2026-44','SCH-01-ADM']],
 ] as const) {
  const r=await api(sender).post('/sos',{tripId,type,confirmed:true,point:[33.6,73.04],message:'Need help'});
  expect(r.status).toBe(200);await verify(r.body.id,[...allowed]);
  // REST round-trips above allow the socket packets to arrive without arbitrary sleeps.
  for(const key of Object.keys(tokens)) expect(received[key].includes(r.body.id),key).toBe((allowed as readonly string[]).includes(key));
 }
});
it('validates, limits each sender, acknowledges and resolves without exposing an unauthorized id',async()=>{
 const student=api('STU-2026-51');
 for(const body of [{type:'OTHER',message:''},{type:'MEDICAL',message:'x'.repeat(301)},{type:'INVALID'},{type:'MEDICAL',point:[100,0]}]) {
  expect((await student.post('/sos',{confirmed:true,point:[33.6,73.04],...body})).status).toBe(400);
 }
 let event:any;
 for(let i=0;i<3;i++){const r=await student.post('/sos',{type:'MEDICAL',confirmed:true,point:[33.6,73.04]});expect(r.status).toBe(200);event=r.body;}
 expect((await student.post('/sos',{type:'MEDICAL',confirmed:true,point:[33.6,73.04]})).status).toBe(429);
 expect((await api('PAR-2026-44').post(`/sos/${event.id}/acknowledge`)).status).toBe(404);
 const seen=await api('PAR-2026-51').post(`/sos/${event.id}/seen`);expect(seen.body.recipients.some((r:any)=>r.status==='SEEN')).toBe(true);
 const ack=await api('PAR-2026-51').post(`/sos/${event.id}/acknowledge`);expect(ack.body.status).toBe('ACKNOWLEDGED');expect(ack.body.acknowledged_by).toBe(ids['PAR-2026-51']);
 const resolved=await request(server.app).patch(`/api/v1/admin/sos/${event.id}`).auth(tokens['SCH-01-ADM'],{type:'bearer'}).send({resolved:true});
 expect(resolved.status).toBe(200);expect(resolved.body.status).toBe('RESOLVED');expect(resolved.body.resolved_by).toBe(ids['SCH-01-ADM']);
 expect((await api('PAR-2026-44').post('/sos',{studentId:ids['STU-2026-51'],type:'LOST',confirmed:true,point:[33.6,73.04]})).status).toBe(404);
});
