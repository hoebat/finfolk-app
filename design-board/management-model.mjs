import {schoolState,SCHOOL_KEY} from './school-demos.mjs';
import {pageAccount,normalizeConnectCode} from './page-instagram.mjs';
import {collectProfilePost} from './profile-builder.mjs';
export const KEY='finfolk:management:v1',ME=globalThis.__finfolkSandbox?.actor.id||'alex';
export const METRICS={duration:{label:'Session duration',unit:'seconds'},hold:{label:'Breath-hold time',unit:'seconds'},distance:{label:'Distance',unit:'metres'},depth:{label:'Depth',unit:'metres'},count:{label:'Attempts',unit:'count'}};
export function initialManagement(){return {pages:[{id:'tideline',name:'Tideline Freediving',bio:'Small-group freediving and coastal days.',location:'Mornington Peninsula',published:true,claimed:false,owner:null,admins:[]},{id:'saltwater',name:'Saltwater Sundays',bio:'Ocean mornings and familiar faces.',location:'Sydney',published:true,claimed:true,owner:'jordan',admins:[ME]},{id:'maya',name:'Maya Laurent',bio:'Training and stories from the sea.',location:'Dahab',published:true,claimed:true,owner:ME,admins:['sam']}],events:[],sessions:[],invitations:[{id:'sample-invite',pageId:'maya',email:'taylor@example.test',state:'pending',expires:Date.now()+7*86400000}],claims:[],history:[]};}
export const managementKey=collection=>collection==='schools'?SCHOOL_KEY:KEY;
export function loadManagement(storage,collection){try{const s=JSON.parse(storage.getItem(managementKey(collection)));if(['pages','sessions','events','claims','invitations','history'].every(k=>Array.isArray(s?.[k]))&&s.pages.every(p=>Array.isArray(p.admins)))return s;}catch{}return collection==='schools'?schoolState():initialManagement();}
export const role=(p,user=ME)=>p.claimed?(p.owner===user?'owner':p.admins.includes(user)?'admin':'visitor'):p.creator===user?'creator':'visitor';
export const editable=(p,user=ME)=>['owner','admin','creator'].includes(role(p,user));
export const eligible=p=>p.published&&p.claimed&&!p.archived&&['owner','admin'].includes(role(p));
const fail=msg=>{throw Error(msg);};
export function change(s,action,data={},actor=ME,now=Date.now()){
 const p=s.pages.find(p=>p.id===data.pageId),own=()=>{if(!p||role(p,actor)!=='owner')fail('Only the page owner can manage access or archive this page.');},edit=()=>{if(!p||!editable(p,actor))fail('You do not have permission to edit this page.');};
 const id=()=>globalThis.crypto.randomUUID();
 if(action==='createPage'){if(!data.name?.trim())fail('Enter a page name.');s.pages.push({id:id(),name:data.name.trim(),bio:data.bio||'',location:data.location||'',published:false,claimed:false,owner:null,creator:actor,admins:[]});}
 else if(action==='draft'||action==='publish'){edit();if(!data.name?.trim()||data.name.length>160)fail('Enter a name up to 160 characters.');const content={name:data.name.trim(),bio:data.bio||'',location:data.location||''};if(action==='draft')p.draft=content;else{if(!p.claimed)fail('Ownership must be verified before publication.');Object.assign(p,content,{published:true});delete p.draft;}}
 else if(action==='archive'){own();p.archived=!p.archived;}
 else if(action==='connectCode'){
 if(!p||p.archived)fail('This page is unavailable.');if(p.claimed&&p.owner!==actor)fail('Only the existing owner can connect this page.');
 const account=pageAccount(p);if(!account)fail('Choose the page’s Instagram identity first.');
 s.connectCodes??=[];for(const c of s.connectCodes)if(c.pageId===p.id&&c.user===actor&&!c.used)c.revoked=true;
 s.connectCodes.push({pageId:p.id,user:actor,providerId:data.providerId,handle:data.handle,code:id().replaceAll('-','').slice(0,8).toUpperCase(),expires:now+600000,used:false});
 }
 else if(action==='connectPage'){
 if(!p||p.archived)fail('This page is unavailable.');if(p.claimed&&p.owner!==actor)fail('This page already has an owner.');
 const c=(s.connectCodes||[]).find(c=>c.code===normalizeConnectCode(data.code)&&c.pageId===p.id&&c.user===actor);
 if(!c||c.used||c.revoked||c.expires<=now)fail('Code invalid, expired or already used. Send /connect again.');
 const account=pageAccount(p);if(!account||c.providerId!==account.id||c.handle!==account.handle)fail('The code must come from this page’s Instagram account.');
 if(s.pages.some(other=>other.id!==p.id&&other.instagramConnection?.providerId===c.providerId))fail('This Instagram account already belongs to another page.');
 c.used=true;p.claimed=true;p.owner=actor;p.instagramConnection={providerId:c.providerId,handle:c.handle,connectedAt:new Date(now).toISOString()};
 }
 else if(action==='pagePost'){
 edit();if(!p.instagramConnection)fail('Connect the page’s Instagram account first.');if(data.providerId!==p.instagramConnection.providerId)fail('Only posts from the connected page account can be collected.');
 p.posts??=[];const post=collectProfilePost({url:data.url,caption:data.caption},p.posts);if(p.posts.some(item=>item.id===post.id))fail('This post is already in the page collection.');p.posts.push({...post,ownerId:p.id,providerId:data.providerId,published:false});
 }
 else if(action==='publishPost'||action==='removePost'){
 edit();const post=p.posts?.find(post=>post.id===data.id);if(!post)fail('Post unavailable.');if(action==='publishPost')post.published=!post.published;else p.posts=p.posts.filter(post=>post.id!==data.id);
 }
 else if(['claim','proof','submitClaim','approve','reject'].includes(action))fail('Page ownership now uses /connect from the page’s Instagram account.');
 else if(action==='invite'){own();const email=data.email?.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||''))fail('Enter an invitation email.');s.invitations.push({id:id(),pageId:p.id,email,state:'pending',expires:now+7*86400000});}
 else if(action==='revoke'){own();const i=s.invitations.find(i=>i.id===data.id&&i.pageId===p.id);if(!i||i.state!=='pending')fail('Invitation is not pending.');i.state='revoked';}
 else if(action==='accept'){const i=s.invitations.find(i=>i.id===data.id);if(!i||i.state!=='pending'||i.expires<=now)fail('Invitation is expired, revoked or already used.');if(!data.verified||data.email?.toLowerCase()!==i.email)fail('Sign in with the verified invited account.');const page=s.pages.find(p=>p.id===i.pageId);if(page.archived)fail('This page is archived.');page.admins=[...new Set([...page.admins,i.email])];i.state='accepted';}
 else if(action==='removeAdmin'){own();p.admins=p.admins.filter(id=>id!==data.user);}
 else if(action==='event'){if(!p||!(p.published&&p.claimed&&!p.archived&&['owner','admin'].includes(role(p,actor))))fail('Choose a published, verified page you manage.');if(!data.title?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(data.date||'')||!Number.isFinite(Date.parse(data.date)))fail('Enter an event title and date.');s.events.push({id:id(),pageId:p.id,title:data.title,date:data.date,location:data.location||p.location,attendees:[actor],cancelled:false});}
 else if(action==='rsvp'){const e=s.events.find(e=>e.id===data.id);if(!e||e.cancelled||e.published===false)fail('This event is unavailable.');e.attendees=e.attendees.includes(actor)?e.attendees.filter(u=>u!==actor):[...e.attendees,actor];}
 else if(action==='cancelEvent'){const e=s.events.find(e=>e.id===data.id),page=s.pages.find(p=>p.id===e?.pageId);if(!page||!['owner','admin'].includes(role(page,actor)))fail('Only page managers can cancel this event.');e.cancelled=true;}
 else if(action==='session'){const existing=s.sessions.find(l=>l.id===data.id);if(existing&&existing.owner!==actor)fail('Only the participant can edit their session.');if(!data.title?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(data.date||'')||!Number.isFinite(Date.parse(data.date)))fail('Enter a session title and date.');if(!['breathing','measurements','dives'].includes(data.kind)||!METRICS[data.metric])fail('Choose an activity and metric.');for(const key of ['before','after'])if(data[key]!==''&&data[key]!=null&&(!Number.isFinite(Number(data[key]))||Number(data[key])<0||(data.metric==='count'&&!Number.isInteger(Number(data[key])))))fail('Use nonnegative measurements; counts must be whole numbers.');if(data.sourceId&&s.sessions.some(l=>l.sourceId===data.sourceId&&l.owner===actor&&l.id!==data.id))fail('This source record is already linked.');const log={...existing,...data,id:existing?.id||id(),owner:actor,before:data.before===''||data.before==null?null:Number(data.before),after:data.after===''||data.after==null?null:Number(data.after),share:existing?.share||{audience:'private',fields:[],members:[]}};if(existing)Object.assign(existing,log);else s.sessions.push(log);}
 else if(action==='share'){const l=s.sessions.find(l=>l.id===data.id);if(!l||l.owner!==actor)fail('Only the session owner can share it.');const e=s.events.find(e=>e.id===data.eventId);if(data.audience!=='private'&&(!e||e.cancelled||e.published===false||!e.attendees.includes(actor)))fail('Join an active event before sharing with it.');if(!['private','selected','event'].includes(data.audience))fail('Choose a sharing audience.');l.eventId=data.eventId||null;l.share={audience:data.audience,fields:(data.fields||[]).filter(f=>['preparation','dives','before','after'].includes(f)),members:(data.members||[]).filter(u=>e?.attendees.includes(u))};}
 else fail('Unknown action.');
 s.history.unshift({id:id(),pageId:data.pageId||null,action,actor,date:new Date(now).toISOString()});return s;
}
export function sharedSessions(s,eventId,viewer){const e=s.events.find(e=>e.id===eventId);if(!e||e.cancelled||!e.attendees.includes(viewer))return [];return s.sessions.filter(l=>l.eventId===eventId&&e.attendees.includes(l.owner)&&l.share?.audience!=='private'&&(l.owner===viewer||l.share.audience==='event'||l.share.members.includes(viewer))).map(l=>({id:l.id,owner:l.owner,title:l.title,date:l.date,kind:l.kind,metric:l.metric,...Object.fromEntries(l.share.fields.map(f=>[f,l[f]]))}));}
export function comparisons(s,owner,metric,kind,context){return s.sessions.filter(l=>l.owner===owner&&l.metric===metric&&l.kind===kind&&l.context===context).sort((a,b)=>a.date.localeCompare(b.date)).map(l=>({id:l.id,date:l.date,before:l.before,after:l.after,delta:l.before==null||l.after==null?null:l.after-l.before}));}
