// Fictional local design data. Never used by the production API or static app.
export const OWN_ID=globalThis.__finfolkSandbox?.actor.id||'atelier-sample-member';
export const LOCATIONS=Object.freeze([...(globalThis.__finfolkSandbox?[{id:'shelly',name:'Shelly Beach',state:'NSW'},{id:'gordons',name:'Gordon’s Bay',state:'NSW'}]:[]),{id:'bondi',name:'Bondi Beach',state:'NSW'},{id:'portsea',name:'Portsea Beach',state:'VIC'},{id:'greenfield',name:'Greenfield Beach',state:'NSW'}]);
export const AVAILABILITY=['weekday mornings','weekday afternoons','weekend mornings','weekend afternoons'];
export const EXPERIENCES={unspecified:'Not shared',new:'New to freediving',comfortable:'Comfortable',experienced:'Experienced'};
const sharing={visits:true,months:true,dives:true,time:true,depth:false};
const member=(id,name,portrait,bio,beaches,availability,experience,visits)=>({id,displayName:name,portrait,bio,beaches,availability,experience,open:true,instagram:'',tiktok:'',sampleSocials:['instagram','tiktok'],sharing:{...sharing},visitsByLocation:visits,stats:{visits:8,months:6,dives:24,minutes:630,typicalDepth:9},featuredPosts:[id+'-post-1',id+'-post-2'],featuredLogs:[id+'-log-1',id+'-log-2']});
export const MEMBERS=Object.freeze([
 {...member(OWN_ID,'Alex','alex','Freediving and pool training. Looking for divers for weekend morning sessions.',['bondi','greenfield'],['weekend mornings'],'comfortable',{bondi:2,greenfield:1}),open:false,sharing:{visits:false,months:false,dives:false,time:false,depth:false}},
 member('maya','Maya','maya','Shore dives, reef sessions and regular pool training. Usually at Bondi on weekend mornings.',['bondi','greenfield'],['weekend mornings','weekday mornings'],'experienced',{bondi:5,greenfield:2}),
 member('kai','Kai','kai','Training equalisation and building consistency. Available for weekday and weekend morning sessions.',['bondi','portsea'],['weekday mornings','weekend mornings'],'comfortable',{bondi:3,portsea:1}),
 member('jules','Jules','jules','Portsea shore dives and pool sessions. Interested in finding a regular training group.',['portsea'],['weekend afternoons'],'experienced',{portsea:6}),
 member('yara','Yara','yara','New to freediving. Training at the pool and planning shore sessions around Greenfield Beach.',['greenfield'],['weekend mornings'],'new',{greenfield:1}),
 member('rowan','Rowan','rowan','Freediving and photography. Available for weekend sessions at Bondi and Greenfield.',['bondi','greenfield'],['weekend afternoons'],'comfortable',{bondi:1,greenfield:4}),
]);
export const POSTS=MEMBERS.flatMap(m=>[
 {id:m.id+'-post-1',ownerId:m.id,platform:'instagram',title:'Freediving session',kind:'Reel',poster:'/board/assets/people/shore-session-sketch-v2.webp',portrait:m.portrait,location:m.beaches[0],sample:true},
 {id:m.id+'-post-2',ownerId:m.id,platform:'tiktok',title:'Training update',kind:'Video',poster:'/board/assets/people/pool-training-sketch-v2.webp',portrait:m.portrait,location:m.beaches.at(-1),sample:true},
]);
export const LOGS=MEMBERS.flatMap(m=>[
 {id:m.id+'-log-1',ownerId:m.id,title:'Shore freediving',location:m.beaches[0],durationMinutes:45,maxDepthMetres:8,visibility:'public',notes:'Shore session with a buddy. Practised equalisation and relaxed descents.'},
 {id:m.id+'-log-2',ownerId:m.id,title:'Freediving training',location:m.beaches.at(-1),durationMinutes:35,maxDepthMetres:6,visibility:'public',notes:'Technique and equalisation practice with a buddy.'},
 {id:m.id+'-private',ownerId:m.id,title:'Private training notes',location:m.beaches[0],durationMinutes:30,maxDepthMetres:5,visibility:'private',notes:'Private sample content. Never displayed in the showcase.'},
]);
if(globalThis.__finfolkSandbox)LOGS.push(...globalThis.__finfolkSandbox.publicLogs().filter(log=>!LOGS.some(existing=>existing.id===log.id)));
export const portraitPath=member=>'/board/assets/people/'+member.portrait+'-portrait-sketch-v2.webp';
