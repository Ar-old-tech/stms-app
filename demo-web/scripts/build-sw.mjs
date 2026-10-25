import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [
  "./",
  "./index.html",
  "./favicon.svg",
  ...(await readdir("dist/assets")).map((x) => `./assets/${x}`),
];
const version = createHash("sha256")
  .update(await readFile("dist/index.html"))
  .digest("hex")
  .slice(0, 12);
await writeFile(
  "dist/sw.js",
  `const CACHE='stms-demo-${version}';const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('stms-demo-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreVary:true})).then(cached=>cached||fetch(e.request).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):Response.error())))})`,
);
console.log(
  `Offline shell generated: ${files.length} local assets (${version})`,
);
