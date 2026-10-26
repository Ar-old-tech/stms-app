import { useEffect, useRef, useState } from 'react';
import { MapContainer, CircleMarker, TileLayer, useMap } from 'react-leaflet';
import { useStore } from '../store';
import type { Point, Workspace } from '../model';
import './Sos.css';

export const emergencyTypes = [
 ['ACCIDENT','Accident'],['MEDICAL','Medical emergency'],['BREAKDOWN','Breakdown'],
 ['UNSAFE','Unsafe or harassment'],['LOST','Lost or missing'],['OTHER','Other'],
] as const;
type Alert = Workspace['sos'][number];
export function Delivery({event}:{event:Alert}) {
 return <div className="sos-delivery" aria-live="polite">{event.recipients?.map(r=><span key={`${r.role}-${r.channel}-${r.status}`}>{r.role}: {r.count} · {r.channel==='IN_APP'?'In-app':r.channel} {r.status.toLowerCase().replaceAll('_',' ')} </span>)}
 {!event.recipients?.some(r=>r.channel==='SMS') && <span>SMS not configured</span>}</div>;
}
export function Emergency() {
 const {data:s,session,act,pending}=useStore();
 const [step,setStep]=useState(0),[type,setType]=useState('ACCIDENT'),[message,setMessage]=useState('');
 const [point,setPoint]=useState<Point|null>(null),[studentId,setStudentId]=useState(''),[sent,setSent]=useState('');
 const locating=useRef(0);
 const open=()=>{
  setStep(1);setPoint(null);setStudentId(s?.students[0]?.id??'');
  const generation=++locating.current;
  navigator.geolocation?.getCurrentPosition(p=>{if(locating.current===generation)setPoint([p.coords.latitude,p.coords.longitude]);},()=>{}, {enableHighAccuracy:true,timeout:7000,maximumAge:15000});
 };
 const attached=point??s?.trip?.point;
 const receipt=s?.sos.find(e=>e.id===sent);
 return <div className="emergency">
  <button className="danger" onClick={open}>Emergency SOS</button>
  {receipt && <div className="notice"><strong>Emergency sent · {receipt.status}</strong><Delivery event={receipt}/></div>}
  {step>0 && <div className="sos-dialog-backdrop"><section className="sos-dialog" role="dialog" aria-modal="true" aria-label="Emergency SOS" onKeyDown={e=>{if(e.key==='Escape')setStep(0);}}>
   <h2>{step===1?'What happened?':'Confirm emergency'}</h2>
   {step===1 ? <>
    <div className="sos-types">{emergencyTypes.map(([value,label])=><button autoFocus={value==='ACCIDENT'} key={value} aria-pressed={type===value} onClick={()=>setType(value)}>{label}</button>)}</div>
    {session.user.role==='PARENT' && <label>Child<select value={studentId} onChange={e=>setStudentId(e.target.value)}>{s?.students.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
    <label>Message {type==='OTHER'?'(required)':'(optional)'}<textarea maxLength={300} value={message} onChange={e=>setMessage(e.target.value)}/></label><small>{message.length}/300</small>
    <p>{point?'Current device location attached':attached?'Last known trip position attached':'Waiting for location. Enable location permission to continue.'}</p>
    <button className="danger" disabled={!attached || (type==='OTHER'&&!message.trim()) || (session.user.role==='PARENT'&&!studentId)} onClick={()=>setStep(2)}>Review emergency</button>
   </> : <>
    <strong>{emergencyTypes.find(x=>x[0]===type)?.[1]}</strong><p>{message}</p>
    <p>{session.user.role==='DRIVER'?'Notify tenant admins and student/parent accounts on this trip.':'Notify this child’s linked parents, the student, and configured institution staff.'}</p>
    <p>Location: {attached?.map(n=>n.toFixed(5)).join(', ')}</p>
    <button className="danger" disabled={pending>0 || !attached} onClick={async()=>{
     const r=await act('/sos',{type,message,confirmed:true,point:attached,...(s?.trip?{tripId:s.trip.id}:{}),...(session.user.role==='PARENT'?{studentId}:{})});
     if(r){setSent(r.id);setStep(0);locating.current++;setMessage('');}
    }}>Send emergency now</button><button disabled={pending>0} onClick={()=>setStep(1)}>Back</button>
   </>}
   <button disabled={pending>0} onClick={()=>{setStep(0);locating.current++;}}>Cancel</button>
  </section></div>}
 </div>;
}
function ResizeMap(){const map=useMap();useEffect(()=>{const o=new ResizeObserver(()=>map.invalidateSize());o.observe(map.getContainer());map.invalidateSize();return()=>o.disconnect();},[map]);return null;}
function AlertLocation({event}:{event:Alert}) {
 const [failed,setFailed]=useState(false);
 return <div className="sos-location"><MapContainer center={event.point} zoom={15} style={{height:250,minHeight:250}} scrollWheelZoom={false}>
  <ResizeMap/>{!failed&&<TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{tileerror:()=>setFailed(true)}}/>}<CircleMarker center={event.point} radius={10}/>
 </MapContainer><small>{failed?'Map tiles unavailable, tracking still works · ':''}© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a></small></div>;
}
export function SosReceiver() {
 const {data:s,session,act}=useStore();
 const seen=useRef(new Set<string>()),announced=useRef(new Set<string>());
 const [muted,setMuted]=useState(()=>sessionStorage.getItem('stms-sos-muted')!=='false');
 const [location,setLocation]=useState('');
 const events=s?.sos??[];
 useEffect(()=>{
  for(const e of events.filter(e=>e.status==='OPEN'&&e.raised_by!==session.user.userId)) {
   if(!seen.current.has(e.id)){seen.current.add(e.id);void act(`/sos/${e.id}/seen`,{});}
   if(announced.current.has(e.id))continue;announced.current.add(e.id);
   if('Notification' in window && Notification.permission==='granted')new Notification('STMS EMERGENCY',{body:`${e.type}: ${e.message??''}`,tag:`sos-${e.id}`});
   if(!muted)try{const a=new AudioContext(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);g.gain.value=.05;o.frequency.value=880;o.start();o.stop(a.currentTime+.4);o.onended=()=>void a.close();}catch{/* Audio requires browser permission/user interaction. */}
  }
 },[events,session.user.userId,act,muted]);
 return <>{events.filter(e=>e.status==='OPEN' && e.raised_by!==session.user.userId).map(e=><section className="sos-urgent" role="alert" key={e.id} id={`sos-${e.id}`}>
  <strong>EMERGENCY · {e.type}</strong><h3>{e.source}</h3><p>{e.message}</p><time>{e.created_at?new Date(e.created_at).toLocaleString():''}</time>
  <div className="sos-actions"><a href={`#sos-${e.id}`} onClick={()=>setLocation(location===e.id?'':e.id)}>View live location in app</a>
   {e.phone&&<><a href={`tel:${e.phone}`}>Call</a><a target="_blank" rel="noopener noreferrer" href={`https://wa.me/${e.phone.replace(/\D/g,'')}?text=${encodeURIComponent(`STMS emergency: ${e.type}. ${e.message??''}`)}`}>WhatsApp</a></>}
   <button onClick={()=>void act(`/sos/${e.id}/acknowledge`,{})}>I am on it</button>
  </div>
  {location===e.id&&<AlertLocation event={{...e,point:s?.trips.find(t=>t.id===e.tripId)?.point??e.point}}/>}
  <Delivery event={e}/>
  <button onClick={()=>{setMuted(!muted);sessionStorage.setItem('stms-sos-muted',String(!muted));if('Notification'in window&&Notification.permission==='default')void Notification.requestPermission();}}>{muted?'Unmute SOS sound':'Mute SOS sound'}</button>
 </section>)}</>;
}
