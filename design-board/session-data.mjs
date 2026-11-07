// Fictional display fixtures, not decoded vendor exports or compatibility promises.
const builds = [
 ['garmin','Garmin Descent','Garmin Dive','FIT export study',[8.2,10.4,12.6,11.8,9.3,13.2,10.1,8.5]],
 ['suunto','Suunto Ocean','Suunto app','FIT export study',[6.2,8.4,10.2,9.8,11.6,8.1]],
 ['apple','Apple Watch Ultra','Oceanic+','Dive-log export study',[5.2,7.4,8.6,7.8,6.3]],
];
export const SESSION_EXAMPLES=builds.map(([id,device,app,origin,depths])=>{
 let cursor=180;
 const dives=depths.map((depth,i)=>{
  const duration=46+i*4,interval=i?115+i*8:null,start=cursor;
  const samples=[[0,0],[.15,.38],[.35,.88],[.5,1],[.67,.9],[.87,.35],[1,0]].map(([t,d])=>({seconds:Math.round(t*duration),depth:Math.round(d*depth*10)/10}));
  if(id==='suunto'&&i===2)samples[3].depth=null;
  cursor+=duration+115+(i+1)*8;
  return {id:i+1,start,duration,maxDepth:depth,surfaceInterval:interval,samples,temperature:id==='apple'?null:18.2-i*.1};
 });
 return {id,device,app,origin,location:'Portsea Beach',date:'29 October 2026',startTime:'07:12 AEDT',diver:'Alex',privacy:'Private',title:'A little longer in the blue.',notes:'An unhurried morning along the reef with Maya. We stayed close to shore, took turns watching each other, and found a small cuttlefish tucked beneath the ledge. Coffee afterwards, still full of salt.',elapsed:cursor+120,dives,manual:null};
});
SESSION_EXAMPLES.push({...SESSION_EXAMPLES[0],id:'manual',device:'Manual entry',app:'FinFolk logbook',origin:'Entered by the diver',dives:[],elapsed:2700,manual:{maxDepth:8,longest:55,count:6,underwater:280}});
export function sessionSummary(session){const dives=session.dives;return session.manual||{count:dives.length,maxDepth:Math.max(0,...dives.map(d=>d.maxDepth)),longest:Math.max(0,...dives.map(d=>d.duration)),underwater:dives.reduce((sum,d)=>sum+d.duration,0)};}
export const timeLabel=seconds=>seconds==null?'Not recorded':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');

const identities=[
 ['#ff7k2p9x','2026-10-29','29 October 2026','Portsea Beach','A little longer in the blue.'],
 ['#ff4m8r2v','2026-10-25','25 October 2026','Greenfield Beach','A quiet stretch of coast.'],
 ['#ff6w3n8q','2026-10-18','18 October 2026','Camp Cove','A morning in the shallows.'],
 ['#ff9b5h2s','2026-10-11','11 October 2026','Bondi Beach','Just us and the reef.'],
];
SESSION_EXAMPLES.forEach((session,i)=>{const [code,day,date,location,title]=identities[i];Object.assign(session,{code,day,date,location,title});});

if(globalThis.__finfolkSandbox)SESSION_EXAMPLES.push(...globalThis.__finfolkSandbox.detailedSessions().filter(s=>!SESSION_EXAMPLES.some(existing=>existing.id===s.id)));
