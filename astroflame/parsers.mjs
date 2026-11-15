// Source-specific parsers. Unknown table layouts fail closed, never invent values.
export const clean = text => text.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const nums=s=>(s.match(/\d[\d,]*(?:\.\d+)?|\.\d+/g)||[]).map(v=>Number(v.replaceAll(',','')));
function demand(ok,msg){if(!ok)throw new Error(msg);}
const round=n=>Math.round(n*100000)/100000;
export function parseSaffire(raw){
 const t=clean(raw), table=t.slice(t.indexOf('Table 1. Saffire IV-VI'));
 demand(table.startsWith('Table 1.'),'Saffire Table 1 missing');
 const get=(start,end)=>{const a=table.indexOf(start);demand(a>=0,'Missing '+start);const b=table.indexOf(end,a+start.length);demand(b>a,'Missing '+end);const v=nums(table.slice(a+start.length,b));demand(v.length===5,'Unexpected Saffire column count: '+start);return v;};
 const lengths=get('Length (cm)','Air Flow Rate'),flows=get('Air Flow Rate (cm/s)','Flow Direction'),pressures=get('Ambient Pressure (kPa)','Oxygen Concentration'),oxygen=get('Oxygen Concentration (mol %)','Free volume');
 const ids=['IV-1','V-2','VI-2','VI-3','VI-4'];
 const gasStart=t.indexOf('IV-1 SIBAL',t.indexOf('Table 2. Saffire'));
 demand(gasStart>0,'Saffire Table 2 missing');
 const tail=t.slice(gasStart,t.indexOf('*Empty fields',gasStart));
 return ids.map((id,i)=>{
  const a=tail.indexOf(id),b=i<4?tail.indexOf(ids[i+1],a):tail.length;
  let row=tail.slice(a+id.length,b).replace(/\b[12]-sided\b/g,'');const v=nums(row);
  demand(v.length>=8&&v.length<=10,'Unexpected Saffire gas row '+id);
  const co=v.at(-1),co2=v.at(-3),duration=v[0];
  demand(co>=0&&co2>0&&duration>0&&oxygen[i]>0&&oxygen[i]<100&&pressures[i]>0,'Invalid Saffire values');
  return {id,name:'Saffire '+id.split('-')[0],fuel:['SIBAL cloth','Cotton jersey','SIBAL cloth','Two-sided acrylic','One-sided acrylic'][i],pressure:pressures[i],o2:oxygen[i],lengthMM:lengths[i]*10,flow:flows[i],duration,co,co2,sourceId:'20240002981',table:'Tables 1 and 2'};
 });
}
export function parseBass(raw){
 const t=clean(raw),rows=[];const matches=[...t.matchAll(/\b(O\d+[a-z]?)\s+(\d+[Mm]?)\s+(\d+(?:\.\d+)?)-mm\s+(clear|black)\s+(?:PMMA\s+)?rod/gi)];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],chunk=t.slice(m.index,matches[i+1]?.index??m.index+1500);
  const gas=chunk.match(/(?:Cont|7s)\s+\d+\s+\d+\s+(?:postburn only\s+)?([^]*?)$/i);
  if(!gas)continue;
  const tokens=gas[1].split(/\s+/).slice(0,8).map(x=>x.replace('–','-'));
  if(tokens.length!==8||!tokens.slice(0,6).every(x=>/^[-+]?\d+(?:\.\d+)?$/.test(x)))continue;
  const v=tokens.map(Number);const o2=v[0],endO2=v[1],co2=v[4],endCO2=v[5],co=v[6],endCO=v[7];
  demand(o2>0&&o2<100&&endO2>0&&endO2<100&&co2>=0&&endCO2>=0,'Invalid BASS gas columns');
  const row={id:m[1],sample:m[2],diameter:Number(m[3]),color:m[4].toLowerCase(),o2,endO2,co2,endCO2,co:Number.isFinite(co)?co:null,endCO:Number.isFinite(endCO)?endCO:null,coText:tokens[6],endCOText:tokens[7],mode:chunk.match(/\b(Stagnation|Concurrent)\b/)?.[1]??null,sourceId:'20210011385',table:'Table A.5'};
  if(!rows.some(x=>x.id.toLowerCase()===row.id.toLowerCase()))rows.push(row);
 }
 for(const id of ['O6','O7','O8a','O8b','O9'])demand(rows.some(r=>r.id===id),'Missing BASS row '+id);
 return rows;
}
export function parseFlex(raw){
 const t=clean(raw);const ti=t.slice(t.indexOf('TABLE I.—'),t.indexOf('TABLE II.—')),tii=t.slice(t.indexOf('TABLE II.—'),t.indexOf('TABLE III.—')),tiii=t.slice(t.indexOf('TABLE III.—'),t.indexOf('TABLE IV.—'));
 demand(ti&&tii&&tiii,'FLEX tables missing');
 const oxygen1=ti.match(/(0\.\d+) oxygen mole fraction/),oxygen2=tii.match(/(0\.\d+) oxygen mole fraction/),carbon1=ti.match(/(0\.\d+) carbon dioxide mole fraction/),carbon2=tii.match(/(0\.\d+) carbon dioxide mole fraction/);
 demand(oxygen1&&oxygen2&&carbon1&&carbon2,'FLEX ambient composition unavailable');
 const out=[];const add=(id,size,p,o,c,gas,table,fuel='Methanol')=>{demand(size>0&&p>0&&o>0&&o<=100,'Invalid FLEX values');out.push({id:'FLEX '+id,name:'FLEX '+id,phase:'Liquid',fuel,p:round(p*101.325),o,size,kind:'drop diameter',flow:null,c,gas,sourceId:'20150023456',ref:table});};
 for(const [id,part,o,c,gas,table] of [['001',ti,+oxygen1[1]*100,+carbon1[1]*100,'Cabin air','Table I'],['010',tii,+oxygen2[1]*100,+carbon2[1]*100,'CO₂-enriched atmosphere','Table II']]){
  const m=part.match(new RegExp('\\b'+id+'\\s+[^]*?Methanol\\s+(\\d+\\.\\d+)\\s+(\\d+\\.\\d+)'));demand(m,'Missing FLEX '+id);add(id,+m[1],+m[2],o,c,gas,table);
 }
 const m=tii.match(/015 016 017 018 .*?Methanol Methanol Methanol Heptane (\d+\.\d+) (\d+\.\d+) (\d+\.\d+) (\d+\.\d+) \d+ (\d+\.\d+) (\d+\.\d+) (\d+\.\d+) (\d+\.\d+)/);
 demand(m,'FLEX 017 column layout changed');add('017',+m[3],+m[7],+oxygen2[1]*100,+carbon2[1]*100,'CO₂-enriched atmosphere','Table II');
 for(const [start,end,index,id] of [['019 020 021 022 023','024 025',0,'019'],['024 025 026 027 028','029 030',1,'025']]){
  const chunk=tiii.slice(tiii.indexOf(start)+start.length,tiii.indexOf(end));const block=chunk.match(/((?:(?:Methanol|Heptane)\s+){5})([\d.\s]+)No No No No No ([\d.\s]+)/);
  demand(block,'FLEX '+id+' column layout changed');const sizes=nums(block[2]),vals=nums(block[3]);demand(sizes.length===5&&vals.length===15,'FLEX column counts');add(id,sizes[index],vals[index],vals[index+5]*100,null,(vals[index+10]*100)+'% N₂','Table III',block[1].trim().split(/\s+/)[index]);
 }
 return out;
}
export function parseSlice(raw){const t=clean(raw);const m=t.match(/Case Fuel nozzle I\.D\. Fuel type.*?A (\d+(?:\.\d+)?) mm.*?Coﬂow air: (\d+(?:\.\d+)?) cm\/s.*?(\d+)% CH4/);demand(m,'SLICE Series A layout changed');return {name:'SLICE · Series A',phase:'Gas',fuel:'Methane mixture',p:null,o:null,size:+m[1],kind:'nozzle bore',flow:+m[2],c:null,gas:m[3]+'% CH₄ in fuel stream',sourceId:'20160012298',ref:'Series A'};}
