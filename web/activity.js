// Session-only telemetry. Nothing is sent to a server or stored on the device.
const recoveryURL=value=>{try{const url=new URL(value,globalThis.location?.href||'https://local.invalid/');url.searchParams.delete('v');return url.href;}catch{return value;}};
const now=()=>globalThis.performance?.now?.()??Date.now();
export function resourceLabel(value){
  try{const u=new URL(value,globalThis.location?.href||'https://local.invalid/'),p=u.pathname;
    if(u.hostname==='tile.openstreetmap.org')return {label:'Shore & place names',kind:'Shore tiles'};
    if(p.endsWith('/export'))return {label:'Government seabed image',kind:'Seabed imagery'};
    if(p.endsWith('/legend'))return {label:'Publisher colour legend',kind:'Legends'};
    if(p.includes('/contours/'))return {label:'Depth contours',kind:'Survey data'};
    if(p.endsWith('.gz'))return {label:'Numeric depth cells',kind:'Survey data'};
    if(p.includes('/areas/'))return {label:'Beach details & nearby stays',kind:'Beach data'};
    if(p.endsWith('beaches.json'))return {label:'Australian beach directory',kind:'Beach data'};
    if(p.includes('beach-summaries'))return {label:'Beach depth summaries',kind:'Beach data'};
    if(p.includes('catalog.json'))return {label:'Survey catalogue',kind:'Survey data'};
    return {label:p.split('/').pop()||'Resource',kind:'Site data'};
  }catch{return {label:'Resource',kind:'Site data'};}
}
export class ActivityStore {
  constructor(limit=200,clock=now){this.limit=limit;this.clock=clock;this.records=[];this.listeners=new Set();this.sequence=0;this.completed=0;this.failed=0;this.cancelled=0;this.transfer=0;this.knownTransfers=0;this.paint=[];this.queued=0;this.starts=new Map();}
  emit(){for(const listener of this.listeners)listener();}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  begin(meta={}){
    let host='On this device';try{if(meta.url)host=new URL(meta.url,globalThis.location?.href).hostname;}catch{}
    const item={id:++this.sequence,label:meta.label||'Operation',kind:meta.kind||'Site data',host,url:meta.url||'',state:'loading',start:this.clock(),end:null,bytes:null,transfer:null,...meta};this.records.push(item);const second=Math.floor(item.start/1000);this.starts.set(second,(this.starts.get(second)||0)+1);for(const key of this.starts.keys())if(key<second-31)this.starts.delete(key);this.trim();this.emit();
    let finished=false;return {id:item.id,finish:(result={})=>{if(finished)return;finished=true;Object.assign(item,result,{end:this.clock(),state:result.state||'done'});if(item.state==='done'){this.completed++;for(const prior of this.records)if(prior.state==='error'&&((item.url&&recoveryURL(prior.url)===recoveryURL(item.url))||(!item.url&&!prior.url&&item.label===prior.label&&item.kind===prior.kind)))prior.recovered=true;}else if(item.state==='cancelled')this.cancelled++;else if(item.state==='error')this.failed++;this.trim();this.emit();}};
  }
  trim(){while(this.records.length>this.limit){const index=this.records.findIndex(r=>r.state!=='loading');if(index<0)break;this.records.splice(index,1);}}
  resource(entry){
    const candidates=this.records.filter(r=>r.url===entry.name&&r.start<=entry.responseEnd+50&&r.transfer===null),item=Number.isFinite(entry.startTime)?candidates.sort((a,b)=>Math.abs(a.start-entry.startTime)-Math.abs(b.start-entry.startTime))[0]:candidates.at(-1);if(!item)return;
    const sameOrigin=(()=>{try{return new URL(entry.name).origin===globalThis.location?.origin;}catch{return false;}})();
    if(entry.transferSize>0||(sameOrigin&&entry.decodedBodySize>0)){item.transfer=entry.transferSize;item.cached=entry.transferSize===0;this.transfer+=entry.transferSize;this.knownTransfers++;this.emit();}
  }
  queue(count){if(this.queued===count)return;this.queued=count;this.emit();}
  frame(duration){this.paint.push(duration);if(this.paint.length>60)this.paint.shift();}
  snapshot(){return {records:[...this.records],queued:this.queued,starts:[...this.starts],active:this.records.filter(r=>r.state==='loading').length,completed:this.completed,failed:this.records.filter(r=>r.state==='error'&&!r.recovered).length,cancelled:this.cancelled,transfer:this.knownTransfers?this.transfer:null,paint:this.paint.length?this.paint.reduce((a,b)=>a+b,0)/this.paint.length:null};}
  clearFinished(){this.records=this.records.filter(r=>r.state==='loading');this.completed=this.failed=this.cancelled=this.transfer=this.knownTransfers=0;this.starts.clear();this.emit();}
}
export const activity=new ActivityStore();
export async function readResource(url,{fetcher=globalThis.fetch,read='text',parse,label,kind,...options}={}){
  const task=activity.begin({url:String(url),...resourceLabel(url),...(label?{label}:{}),...(kind?{kind}:{})});
  try{
    const response=await fetcher.call(globalThis,url,options);if(!response.ok)throw Error(`Request failed (${response.status})`);
    // Read the body before marking complete, rather than timing headers alone.
    const buffer=await response.arrayBuffer();let result;if(read==='arrayBuffer')result=buffer;else if(read==='blob')result=new Blob([buffer],{type:response.headers.get('content-type')||'application/octet-stream'});else{const text=new TextDecoder().decode(buffer);result=parse?parse(text):read==='json'?JSON.parse(text):text;}
    task.finish({bytes:buffer.byteLength});return result;
  }catch(error){task.finish({state:error?.name==='AbortError'?'cancelled':'error',error:error?.message||'Request failed'});throw error;}
}
export function observeResources(){
  if(typeof PerformanceObserver==='undefined')return;
  try{const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())activity.resource(entry);});observer.observe({type:'resource',buffered:true});return observer;}catch{}
}
export const formatBytes=value=>value===null?'Not exposed':value<1024?`${Math.round(value)} B`:value<1048576?`${(value/1024).toFixed(1)} KB`:`${(value/1048576).toFixed(1)} MB`;
export function installSystemPanel(){
  const $=id=>document.getElementById(id),panel=$('system-panel'),toggle=$('system-toggle');if(!panel||!toggle)return;
  let timer,open=false,filter='all';
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function draw(){
    if(!panel.isConnected||!toggle.isConnected)return;
    const s=activity.snapshot(),online=globalThis.navigator?.onLine!==false;toggle.dataset.busy=String(s.active>0);$('system-label').textContent=s.active?`${s.active} loading`:'System';$('system-indicator').textContent=!online?'Offline':s.active||s.queued?(s.queued?`Working · ${s.queued} tiles queued`:'Working'):s.failed?'Review errors':'Idle';
    if(!open)return;
    $('system-network').textContent=online?'Online':'Offline';$('system-network').dataset.online=String(online);$('system-active').textContent=s.active;$('system-complete').textContent=s.completed;$('system-transfer').textContent=s.transfer===null?'—':formatBytes(s.transfer);$('system-paint').textContent=s.paint===null?'—':`${s.paint.toFixed(1)} ms`;
    const chart=$('system-chart');chart.replaceChildren();const time=now(),buckets=Array(32).fill(0);for(const [second,count] of s.starts){const age=Math.floor(time/1000)-second;if(age>=0&&age<32)buckets[31-age]+=count;}const high=Math.max(2,...buckets);for(const count of buckets){const bar=node('i');bar.style.setProperty('--level',String(Math.max(.06,count/high)));bar.title=`${count} operations started`;chart.append(bar);}
    const services=$('system-services');services.replaceChildren();const groups=new Map();for(const r of s.records){if(!groups.has(r.kind))groups.set(r.kind,{active:0,done:0,error:0});const g=groups.get(r.kind);if(r.state==='loading')g.active++;else if(r.state==='error'&&!r.recovered)g.error++;else g.done++;}for(const [kind,g] of groups){const row=node('div',undefined,'system-service');row.append(node('span',kind),node('small',g.active?`${g.active} loading`:g.error?`${g.error} failed`:`${g.done} finished`,g.active?'busy':g.error?'failed':''));services.append(row);}
    const list=$('system-requests');list.replaceChildren();const rows=s.records.filter(r=>filter==='all'||(filter==='error'?r.state==='error'&&!r.recovered:r.state===filter)).slice(-35).reverse();for(const r of rows){const row=node('li',undefined,'system-request');row.dataset.state=r.recovered?'done':r.state;const dot=node('i',undefined,'request-dot'),body=node('div'),duration=((r.end??time)-r.start)/1000;body.append(node('strong',r.label),node('small',`${r.host} · ${r.state==='loading'?'Loading':r.recovered?'Recovered':r.state==='error'?'Failed':r.state==='cancelled'?'Superseded':r.cached?'Cached':'Finished'} · ${duration.toFixed(1)} s`));if(r.error&&r.state==='error'&&!r.recovered)body.append(node('small',r.error,'request-error'));const size=node('span',r.transfer!==null?formatBytes(r.transfer):r.bytes!==null?`${formatBytes(r.bytes)} read`:'—','request-size');row.append(dot,body,size);list.append(row);}if(!rows.length)list.append(node('li',filter==='loading'?'No operations in progress.':filter==='error'?'No failures in the recent log.':'Operations will appear here as you explore.','system-empty'));
  }
  function schedule(){if(!panel.isConnected||timer)return;timer=setTimeout(()=>{timer=null;draw();},150);}
  function setOpen(value){open=value;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));draw();if(open)$('system-close').focus();else toggle.focus();}
  toggle.onclick=()=>setOpen(!open);$('system-close').onclick=()=>setOpen(false);$('system-clear').onclick=()=>activity.clearFinished();panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);}});
  for(const button of panel.querySelectorAll('[data-activity-filter]'))button.onclick=()=>{filter=button.dataset.activityFilter;for(const b of panel.querySelectorAll('[data-activity-filter]'))b.setAttribute('aria-pressed',String(b===button));draw();};
  activity.subscribe(schedule);globalThis.addEventListener?.('online',schedule);globalThis.addEventListener?.('offline',schedule);const interval=setInterval(()=>{if(!panel.isConnected){clearInterval(interval);return;}if(open)draw();},1000);interval.unref?.();observeResources();draw();
}
