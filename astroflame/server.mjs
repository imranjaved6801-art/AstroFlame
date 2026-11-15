import http from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';import {refresh} from './data-service.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));const port=Number(process.env.PORT||8787);
const ttl=60*60*1000;let latest={},lastAttempt=0,inflight;
try{latest=JSON.parse(await readFile(path.join(root,'snapshot.json'),'utf8'));Object.values(latest.sources||{}).forEach(s=>s.status='saved');}catch{}
async function update(){if(inflight)return inflight;if(Date.now()-lastAttempt<ttl)return latest;lastAttempt=Date.now();inflight=refresh(latest).then(async data=>{latest=data;await writeFile(path.join(root,'last-response.json'),JSON.stringify(data,null,2)).catch(()=>{});return data}).finally(()=>inflight=null);return inflight;}
const files=new Map([['/','Astroflame-Dasboard.html'],['/Astroflame-Dasboard.html','Astroflame-Dasboard.html']]);
const server=http.createServer(async(req,res)=>{try{
 const route=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(route==='/api/research'){
  const data=await update();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return;
 }
 if(route==='/api/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,service:'Astroflame NASA research',refreshIntervalSeconds:ttl/1000}));return;}
 if(!files.has(route)){res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(await readFile(path.join(root,files.get(route))));
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Research service could not complete the request.'}));console.error(e.message);}});
server.listen(port,'127.0.0.1',()=>console.log('Astroflame: http://localhost:'+port+'\nNASA reports refresh on first load and at most hourly. Leave this window open.'));
