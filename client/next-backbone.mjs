import substrate from '@xtalk/substrate/substrate.js';
import page from '@xtalk/substrate/page-core.js';
import events from '@xtalk/event/base-model.js';
import memory from '@xtalk/db/system/impl-memory.js';
import cacheUtil from '@xtalk/db/system/memory-util.js';
import {operations,operation,restOperation,affectedDomains} from './operations.mjs';
export {operations,restOperation};
export function stableKey(value){if(Array.isArray(value))return '['+value.map(stableKey).join(',')+']';if(value && typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stableKey(value[k])).join(',')+'}';return JSON.stringify(value);}
export function createBackbone(actor,transport,{node=substrate.node_create({id:'finfolk:'+actor}),space='member:'+actor,onMutation=()=>{}}={}){
 const schema={Result:{id:{ident:'id',type:'text',primary:true,order:0},value:{ident:'value',type:'jsonb',order:1}}};
 const cache=memory.impl_memory(schema,{Result:{position:0}}),entries=new Map(),pending=new Map(),queues=new Map(),blocked=new Set();let closed=false,sequence=0;
 function ensure(name,values={}){
  const spec=operation(name);if(spec.auth && actor==='public')throw Error('Sign in again.');
  const key=spec.write?name:name+':'+stableKey(values);let entry=entries.get(key);
  if(!entry){
   if(entries.size>=256){const old=[...entries.values()].find(e=>!e.spec.write&&!e.listeners.size&&!pending.has(e.key));if(old){entries.delete(old.key);memory.record_delete(cache,'Result',[old.key]);page.model_remove(node,space,old.group,old.id);delete page.group_get(node,space,old.group).specs[old.id];}}
   const id='model-'+(++sequence),group=spec.admin?'admin':spec.domain;
   entry={key,name,values:spec.write?{}:values,spec,id,group,listeners:new Set(),state:{status:'idle'},revision:0};entries.set(key,entry);
   page.group_add_attach(node,space,group,{[id]:{defaults:{args:[{}],output:null},handler:async(_context,input)=>{
    const result=await transport(name,input,entry.options||{});if(closed)throw Error('Account context closed.');return result;
   }}});
   entry.model=page.model_ensure(node,space,group,id)[1];
   // Notifications originate from the actual substrate model lifecycle.
   events.add_listener(entry.model,'finfolk',()=>{for(const fn of entry.listeners){try{fn(entry.state);}catch{console.error('Substrate view subscriber failed.');}}},null,null);
  }return entry;
 }
 function publish(entry,state){entry.state={...entry.state,...state};events.set_output(entry.model,entry.state,!!entry.state.error,null,null,null);}
 async function run(name,values={},options={}){
  if(closed)throw Error('Account context closed.');const entry=ensure(name,values),{spec}=entry;
  if(spec.write && blocked.has(spec.domain))throw Error('Reload before making another change: the previous change was saved but its refresh failed.');
  const revision=entry.revision;entry.options=options;publish(entry,{status:'loading',error:null});events.set_input(entry.model,{data:[values]});
  let result;
  try {
   const acc=await page.model_refresh(node,space,entry.group,entry.id,{},null);
   if(closed)throw Error('Account context closed.');
   const output=page.model_get_output(node,space,entry.group,entry.id);
   if(acc.error)throw output || Error('Request failed.');result=output;
   if(!spec.write && revision===entry.revision){memory.record_add(cache,'Result',[{id:entry.key,value:result}]);publish(entry,{status:'ready',data:result,error:null});}
   if(spec.write){publish(entry,{status:'ready',data:undefined,error:null});
    const domains=affectedDomains(spec);
    const refresh=[...entries.values()].filter(e=>!e.spec.write && domains.includes(e.spec.domain));
    for(const e of refresh)invalidate(e);
    // Preserve the pilot's immediate dependent refresh, even before mounting a reader.
    if(name==='preferences'&&!refresh.some(e=>e.name==='me'))refresh.push(ensure('me',{}));
    if(name==='checkin'&&!refresh.some(e=>e.name==='myCheckins'))refresh.push(ensure('myCheckins',{}));
    try{await onMutation(domains);await Promise.all(refresh.filter(e=>name!=='deleteAccount' && (e.listeners.size || (name==='preferences'&&e.name==='me') || (name==='checkin'&&e.name==='myCheckins'))).map(async e=>{const inflight=pending.get(e.key);if(inflight)await inflight.catch(()=>{});return call(e.name,e.values);}));}
    catch(error){blocked.add(spec.domain);throw Object.assign(Error('Saved, but refreshing the account failed. Reload before making another change.'),{mutationCommitted:true,result,cause:error});}
   }return result;
  }catch(error){if(!closed)publish(entry,{status:'error',error,data:spec.write?undefined:entry.state.data});throw error;}
  finally {entry.options=null;if(spec.write || closed){events.set_input(entry.model,{data:[{}]});events.set_output(entry.model,null,false,null,null,null);}}
 }
 function invalidate(entry){entry.revision++;memory.record_delete(cache,'Result',[entry.key]);publish(entry,{status:'stale'});}
 function call(name,values={},options={}){
  const spec=operation(name);if(closed)return Promise.reject(Error('Account context closed.'));
  if(!spec.write){const key=name+':'+stableKey(values);if(pending.has(key))return pending.get(key);const task=run(name,values,options);pending.set(key,task);task.finally(()=>{if(pending.get(key)===task)pending.delete(key);}).catch(()=>{});return task;}
  const tail=queues.get(spec.domain)||Promise.resolve(),task=tail.then(()=>run(name,values,options));queues.set(spec.domain,task.catch(()=>{}));return task;
 }
 return {kind:'xt.substrate+xt.db',actor,node,cache,space,
  supports:name=>!!operations[name],call,
  read(name,values={}){return cacheUtil.get_entry(cache.rows,'Result',name+':'+stableKey(values))?.record?.data?.value;},
  subscribe(name,values,fn){const e=ensure(name,values);e.listeners.add(fn);fn(e.state);return ()=>e.listeners.delete(fn);},
  async invalidate(domains){const refresh=[];for(const e of entries.values())if(!e.spec.write&&domains.includes(e.spec.domain)){invalidate(e);if(e.listeners.size)refresh.push(e);}await Promise.all(refresh.map(async e=>{const inflight=pending.get(e.key);if(inflight)await inflight.catch(()=>{});return call(e.name,e.values);}));},
  close(){closed=true;memory.clear_db(cache);for(const e of entries.values()){e.listeners.clear();e.state={status:'closed'};events.set_input(e.model,{data:[{}]});events.set_output(e.model,null,false,null,null,null);}entries.clear();delete node.spaces[space];},
 };
}
const applications=new Map();
export function createApplicationBackbone(config){
 const key=JSON.stringify([config.authUrl||'',config.apiUrl||'']);if(applications.has(key))return applications.get(key);
 const node=substrate.node_create({id:'finfolk-app'});let member=null,publicTransport=null;
 const publicModels=createBackbone('public',(name,value,options)=>publicTransport(name,value,options),{node,space:'public'});
 const states=new Map();
 function state(name,value){
  let item=states.get(name);if(!item){page.group_add_attach(node,'application','state',{[name]:{defaults:{args:[],output:null},handler:()=>null}});item=page.model_ensure(node,'application','state',name)[1];states.set(name,item);}
  if(arguments.length===2)events.set_output(item,value,false,null,null,null);return page.model_get_output(node,'application','state',name);
 }
 const app={node,public:publicModels,state,
  subscribeState(name,fn){state(name);const model=states.get(name),id='ui-'+Math.random();events.add_listener(model,id,()=>fn(state(name)),null,null);return ()=>events.remove_listener(model,id);},
  setPublicTransport(transport){publicTransport=transport;},
  member(actor,transport){if(member?.actor!==actor){member?.close();member=createBackbone(actor,transport,{node,onMutation:domains=>publicModels.invalidate(domains)});}return member;},
  clearMember(){member?.close();member=null;state('auth',{status:'signed-out'});},
  async auth(kind,work){state('auth',{status:'loading',kind});try{const result=await work();state('auth',{status:'ready',kind});return result;}catch(error){state('auth',{status:'error',kind,message:error.message});throw error;}},
 };
 applications.set(key,app);return app;
}
