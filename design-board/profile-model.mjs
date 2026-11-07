import {cleanProfilePosts} from './profile-builder.mjs';
import {MEMBERS,LOCATIONS,OWN_ID,AVAILABILITY,EXPERIENCES,POSTS,LOGS} from './profile-data.mjs';
export const initialState=()=>({my:structuredClone(MEMBERS[0]),connections:{kai:'accepted'},blocks:[]});
export const locationById=id=>LOCATIONS.find(l=>l.id===id)||null;
export const memberById=(id,state)=>id===OWN_ID?state.my:MEMBERS.find(m=>m.id===id)||null;
export function routeFromProfileURL(value,state){const p=new URL(value).searchParams,screen=['people','member','me','edit'].includes(p.get('screen'))?p.get('screen'):'people';return {screen,id:p.get('id')||'maya',location:locationById(p.get('location'))?.id||locationById(p.get('site'))?.id||locationById(state.my.beaches[0])?.id||'bondi',availability:AVAILABILITY.includes(p.get('availability'))?p.get('availability'):'',experience:Object.hasOwn(EXPERIENCES,p.get('experience'))?p.get('experience'):'',visitor:p.get('visitor')==='1'};}
export function peopleForLocation(route,state){return MEMBERS.filter(m=>m.id!==OWN_ID&&m.open&&!state.blocks.includes(m.id)&&(m.beaches.includes(route.location)||(m.visitsByLocation[route.location]||0)>0)&&(!route.availability||m.availability.includes(route.availability))&&(!route.experience||m.experience===route.experience)).sort((a,b)=>Number((b.visitsByLocation[route.location]||0)>=10)-Number((a.visitsByLocation[route.location]||0)>=10)||a.displayName.localeCompare(b.displayName));}
export function visibleMember(id,state){const m=memberById(id,state);return !m||state.blocks.includes(id)||(!m.open&&id!==OWN_ID&&state.connections[id]!=='accepted')?null:m;}
export function publicLogs(member){if(globalThis.__finfolkSandbox&&member.id===globalThis.__finfolkSandbox.actor.id)return globalThis.__finfolkSandbox.publicLogs().filter(log=>(member.featuredLogs||[]).includes(log.id));return (member.featuredLogs||[]).map(id=>LOGS.find(log=>log.id===id&&log.ownerId===member.id&&log.visibility==='public')).filter(Boolean);}
export function featuredPosts(member){return (member.featuredPosts||[]).map(id=>[...POSTS,...cleanProfilePosts(member.profilePosts)].find(post=>post.id===id&&post.ownerId===member.id)).filter(Boolean);}
export function sharedStats(member,viewer,location,connection,blocked=false){
 if(blocked)return {};
 const visits=Math.min(member.visitsByLocation?.[location]||0,viewer?.visitsByLocation?.[location]||0);
 const tier=member.id===viewer?.id||connection==='accepted'?2:member.open&&viewer?.open?(visits>=5?2:visits>=3?1:0):0;
 const stats={};for(const [field,key,level]of [['visits','visits',1],['months','months',1],['dives','dives',2],['minutes','time',2],['typicalDepth','depth',2]])if(tier>=level&&member.sharing?.[key])stats[field]=member.stats[field];return stats;
}
export function socialProfileURL(value,platform){
 if(!value?.trim())return '';
 try{const u=new URL(value.trim()),host=u.hostname.replace(/^www\./,'');const pattern=platform==='instagram'?/^\/[A-Za-z0-9._]{1,30}\/?$/:/^\/@[A-Za-z0-9._]{1,30}\/?$/;if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||host!==platform+'.com'||!pattern.test(u.pathname)||(platform==='instagram'&&['p','reel','explore','accounts','stories'].includes(u.pathname.split('/')[1])))throw Error();return 'https://www.'+platform+'.com'+u.pathname.replace(/\/$/,'')+'/';}catch{throw Error('Enter a full '+(platform==='instagram'?'Instagram':'TikTok')+' profile URL.');}
}
export function profileDraft(values,previous){
 const displayName=String(values.displayName||'').trim(),bio=String(values.bio||'').trim();if(!displayName||displayName.length>80)throw Error('Enter a display name of up to 80 characters.');if(bio.length>500)throw Error('Keep your bio within 500 characters.');
 const beaches=[...new Set(values.beaches||[])];if(beaches.length>20||beaches.some(id=>!locationById(id)))throw Error('Choose up to 20 listed locations.');
 const availability=[...new Set(values.availability||[])];if(availability.some(a=>!AVAILABILITY.includes(a)))throw Error('Choose a listed availability.');if(!Object.hasOwn(EXPERIENCES,values.experience))throw Error('Choose an experience level.');
 const profilePosts=cleanProfilePosts(values.profilePosts??previous.profilePosts);
 const allowedPosts=new Set([...POSTS,...profilePosts].filter(p=>p.ownerId===OWN_ID).map(p=>p.id)),allowedLogs=new Set(LOGS.filter(l=>l.ownerId===OWN_ID&&l.visibility==='public').map(l=>l.id));
 return {...previous,profilePosts,displayName,bio,beaches,availability,experience:values.experience,open:values.open===true,instagram:socialProfileURL(values.instagram,'instagram'),tiktok:socialProfileURL(values.tiktok,'tiktok'),featuredPosts:[...new Set(values.featuredPosts||[])].filter(id=>allowedPosts.has(id)),featuredLogs:[...new Set(values.featuredLogs||[])].filter(id=>allowedLogs.has(id)),sharing:Object.fromEntries(['visits','months','dives','time','depth'].map(k=>[k,values.sharing?.[k]===true]))};
}
export async function validatePortrait(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP portrait.');if(file.size>2*1024*1024)throw Error('Choose a portrait of 2 MiB or less.');
 const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer()),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 const valid=file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:file.type==='image/png'?ascii(1,4)==='PNG'&&bytes[0]===137:ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';if(!valid)throw Error('The portrait file does not match its image type.');return file;
}
