// Local design fixtures only. This file is never copied into the published app.
import {TRIP_ID} from './screens.mjs';
export const SAMPLE_USER_ID=globalThis.__finfolkSandbox?.actor.id||'atelier-sample-member';
const clone=value=>structuredClone(value);
export const SAMPLE_PROFILE={displayName:'Alex',bio:'Slow mornings, curious coastlines, and always a buddy in the water.',instagram:'',tiktok:'',open:false,beaches:['bondi','greenfield'],activities:['freediving'],availability:['weekend mornings'],experience:'comfortable',depthGoal:10,sharing:{visits:false,months:false,dives:false,time:false,depth:false}};
export const SAMPLE_SESSIONS=[
 {id:'atelier-session-1',ownerId:SAMPLE_USER_ID,date:'2026-10-29',locationName:'Bondi Beach',beachId:'bondi',durationMinutes:45,maxDepthMetres:8,notes:'An easy morning exploring with my buddy. A little time to notice the small things.',visibility:'private',photos:[]},
 {id:'atelier-session-2',ownerId:SAMPLE_USER_ID,date:'2026-10-25',locationName:'Greenfield Beach',beachId:'greenfield',durationMinutes:35,maxDepthMetres:6,notes:'A quiet shore session and a long walk afterwards.',visibility:'public',photos:[]},
 {id:'atelier-session-3',ownerId:SAMPLE_USER_ID,date:'2026-10-18',locationName:'Camp Cove',beachId:'camp-cove',durationMinutes:30,maxDepthMetres:5,notes:'Practising the basics with a friend.',visibility:'private',photos:[]},
];
const daily=[
 {day:'2026-10-23',dives:7,maxDepthMetres:8,averageDepthMetres:5.6,medianDepthMetres:6,longestDiveSeconds:65,totalDiveSeconds:350,waterMinutes:55},
 {day:'2026-10-24',dives:9,maxDepthMetres:10,averageDepthMetres:6.2,medianDepthMetres:6,longestDiveSeconds:72,totalDiveSeconds:480,waterMinutes:65},
 {day:'2026-10-25',dives:6,maxDepthMetres:7,averageDepthMetres:4.8,medianDepthMetres:5,longestDiveSeconds:60,totalDiveSeconds:290,waterMinutes:45},
];
export const SAMPLE_REPORT={id:TRIP_ID,beachId:'greenfield',beachName:'Greenfield Beach',title:'Three days at the water’s edge',authorName:'Alex · sample member',start:'2026-10-23',end:'2026-10-25',timezone:'Australia/Sydney',story:'A few unhurried days exploring the coast with friends. Morning sessions, curious little creatures, and plenty of time on shore. Sample report for local design preview.',links:[],summary:{daily,total:{dives:22,daysWithDives:3,calendarDays:3,maxDepthMetres:10,averageDepthMetres:5.6,medianDepthMetres:6,longestDiveSeconds:72,totalDiveSeconds:1120,waterMinutes:165,waterTimeSource:'daily',depthRecords:22,durationRecords:22}}};
export function previewResponse(path){
 if(path==='/preview-api/trips/'+TRIP_ID)return clone(SAMPLE_REPORT);
 if(path==='/preview-api/trips')return {trips:[{...clone(SAMPLE_REPORT),total:clone(SAMPLE_REPORT.summary.total)}]};
 if(path==='/preview-api/community/posts')return {enabled:true,posts:[],cursor:null};
 if(path==='/preview-api/instagram/posts')return {posts:[],cursor:null};
 return null;
}
export function makePreviewClient({guest=false}={}){
 if(globalThis.__finfolkSandbox)return globalThis.__finfolkSandbox.sessionClient();
 let user=guest?null:{uid:SAMPLE_USER_ID,email:'alex@example.test',emailVerified:true,providerData:[]},profile=clone(SAMPLE_PROFILE),sessions=clone(SAMPLE_SESSIONS);
 let checkins=[{beach_id:'bondi',name:'Bondi Beach',day:'2026-10-29'},{beach_id:'greenfield',name:'Greenfield Beach',day:'2026-10-25'}];
 const observers=new Set(),notify=async()=>{for(const fn of observers)await fn(user);};
 const unavailable=()=>{throw Error('Local design preview only. No account or external service is changed.');};
 const client={
  get user(){return user;},
  observe(fn){observers.add(fn);queueMicrotask(()=>fn(user));return()=>observers.delete(fn);},
  refresh:async()=>user,ensureProfile:async()=>({profile:clone(profile)}),profile:async()=>clone(profile),
  list:async({publicOnly=false}={})=>({sessions:clone(sessions.filter(s=>!publicOnly||s.visibility==='public')),more:false,cursor:null}),
  get:async id=>{const session=sessions.find(s=>s.id===id);if(!session)throw Error('Sample session unavailable.');return clone(session);},
  save:async(id,values)=>{id ||= 'atelier-session-'+(sessions.length+1);const value={...clone(values),id,ownerId:SAMPLE_USER_ID,photos:[],visibility:'private'};sessions=[value,...sessions.filter(s=>s.id!==id)];return id;},
  saveProfile:async values=>{profile={...profile,...clone(values)};},
  visibility:async(id,value)=>{const session=sessions.find(s=>s.id===id);if(session)session.visibility=value;},
  deleteSession:async id=>{sessions=sessions.filter(s=>s.id!==id);},
  signOut:async()=>{user=null;await notify();},
  email:unavailable,google:unavailable,verify:unavailable,verifyCode:unavailable,reset:unavailable,resetPassword:unavailable,deleteAccount:unavailable,reauthenticate:unavailable,
  auth:{signUp:{email:unavailable}},
  instagramPosts:async()=>[],instagramStatus:async()=>({enabled:false}),
  async call(action,values={}){
   switch(action){
    case 'me':return {profile:clone(profile)};
    case 'preferences':profile={...profile,...clone(values.profile)};return {profile:clone(profile)};
    case 'connections':return [{id:'atelier-buddy-1',name:'Rowan · sample buddy',status:'accepted'},{id:'atelier-buddy-2',name:'Sam · sample buddy',status:'pending',requested_by:'atelier-buddy-2'}];
    case 'myCheckins':return clone(checkins);
    case 'checkin':checkins.unshift({beach_id:values.beachId,name:values.beachId==='bondi'?'Bondi Beach':values.beachId,day:'2026-11-01'});return {count:3};
    case 'removeCheckin':checkins=checkins.filter(row=>row.beach_id!==values.beachId||row.day!==values.day);return {};
    case 'blocks':case 'myPosts':case 'instagramActions':return [];
    case 'community':return {people:[],cursor:null,ownVisits:2};
    case 'posts':case 'followedPosts':return {enabled:true,posts:[],cursor:null};
    case 'postStatus':return {enabled:true,admin:false};
    case 'instagramStatus':return {enabled:false,admin:false,total:0,connection:null};
    case 'instagramClaimStatus':return {state:'ready',capabilities:{connect:false},profileUrl:''};
    case 'instagramCommandStatus':return {enabled:false,commands:[],pending:[]};
    case 'instagramMyPosts':return {posts:[],connection:null};
    case 'instagramDiscoveryStatus':return {enabled:false,admin:false};
    case 'tripList':return [{id:TRIP_ID,draft:clone(SAMPLE_REPORT),published:true,pending:false}];
    case 'tripGet':return {id:TRIP_ID,draft:clone(SAMPLE_REPORT),published:true,pending:false};
    default:return unavailable();
   }
  },
 };
 return client;
}
