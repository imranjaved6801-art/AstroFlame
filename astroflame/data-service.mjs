import {parseSaffire,parseBass,parseFlex,parseSlice} from './parsers.mjs';
import {createHash} from 'node:crypto';
export const sources={saffire:'20240002981',bass:'20210011385',flex:'20150023456',slice:'20160012298'};
const parser={saffire:parseSaffire,bass:parseBass,flex:parseFlex,slice:parseSlice};
export async function loadSource(name,request=fetch){
 const id=sources[name],api='https://ntrs.nasa.gov/api/citations/'+id;
 const res=await request(api,{signal:AbortSignal.timeout(25000)});
 if(!res.ok)throw new Error('NASA record HTTP '+res.status);
 const meta=await res.json();if(meta.distribution!=='PUBLIC')throw new Error('NASA record is no longer public');
 const file=meta.downloads?.find(d=>d.links?.fulltext&&!d.draft);if(!file)throw new Error('NASA full text is unavailable');
 const url=new URL(file.links.fulltext,'https://ntrs.nasa.gov');
 if(url.origin!=='https://ntrs.nasa.gov'||!url.pathname.startsWith('/api/citations/'+id+'/downloads/'))throw new Error('Unexpected NASA download location');
 const txt=await request(url.href,{signal:AbortSignal.timeout(30000)});if(!txt.ok)throw new Error('NASA full text HTTP '+txt.status);
 const text=await txt.text();if(text.length>8_000_000)throw new Error('NASA response exceeds supported size');
 const data=parser[name](text);
 return {id,name,title:meta.title,citationURL:'https://ntrs.nasa.gov/citations/'+id,apiURL:api,fulltextURL:url.href,published:meta.publicationDate||meta.distributionDate,checkedAt:new Date().toISOString(),sha256:createHash('sha256').update(text).digest('hex'),status:'fresh',parserVersion:'1.0.0',data};
}
export async function refresh(previous={},request=fetch){
 const settled=await Promise.allSettled(Object.keys(sources).map(name=>loadSource(name,request)));
 const next={schemaVersion:1,generatedAt:new Date().toISOString(),sources:{},kind:'published-research',telemetry:false};
 settled.forEach((result,i)=>{const name=Object.keys(sources)[i];if(result.status==='fulfilled')next.sources[name]=result.value;else{
  const error=result.reason?.message||String(result.reason);
  // Never silently carry forward a withdrawn/not-public record.
  const withdrawn=/no longer public|HTTP (403|404|410)/.test(error);
  next.sources[name]={...(withdrawn?{}:previous.sources?.[name]),id:sources[name],name,status:withdrawn?'unavailable':'stale',error,attemptedAt:next.generatedAt};
 }});
 return next;
}
