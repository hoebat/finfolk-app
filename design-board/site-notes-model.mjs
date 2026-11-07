// Fictional Atelier content. These are not reports of actual site conditions.
export const NOTE_CATEGORIES={access:'Entry & access',facilities:'Facilities',wildlife:'Marine life',conditions:'Conditions'};
export const SAMPLE_NOTES=[
 {id:'shelly-access',site:'shelly',author:'Maya',category:'access',text:'A small detail that helps a group: agree on your meeting point before everyone arrives, and keep the walkway clear while sorting gear.',createdAt:'2026-11-02T08:20:00Z',votes:18},
 {id:'shelly-life',site:'shelly',author:'Kai',category:'wildlife',text:'My favourite part of a slow session is watching the little fish around the rocks. I add sightings to my log afterwards rather than trying to identify everything in the water.',createdAt:'2026-11-03T04:10:00Z',observedOn:'2026-11-02',votes:11},
 {id:'shelly-conditions',site:'shelly',author:'Alex',category:'conditions',text:'The water looked quite different at the start and end of our visit. A useful reminder to include the observation time when sharing visibility notes.',createdAt:'2026-11-04T02:30:00Z',observedOn:'2026-11-03',votes:7},
 {id:'gordons-access',site:'gordons',author:'Jules',category:'access',text:'For a group meetup, share a photo of the meeting point in advance. It is much easier to find each other than with a description alone.',createdAt:'2026-11-01T03:00:00Z',votes:14},
 {id:'gordons-facilities',site:'gordons',author:'Rowan',category:'facilities',text:'I keep a simple post-session checklist in my log: rinse kit, collect everything and leave the meeting area clear for the next people.',createdAt:'2026-11-04T06:00:00Z',votes:4},
 {id:'bondi-life',site:'bondi',author:'Maya',category:'wildlife',text:'A quick species sketch in my log helps me remember what I saw. I add an identification later if I can confirm it.',createdAt:'2026-11-03T01:00:00Z',votes:9}
];
export const NOTES_KEY='finfolk:atelier:site-notes:v1';
export function createSiteNotes(storage=globalThis.localStorage){
 if(globalThis.__finfolkSandbox)return globalThis.__finfolkSandbox.notes();
 let saved={notes:[],votes:{}};
 try{const value=JSON.parse(storage.getItem(NOTES_KEY));if(value&&Array.isArray(value.notes)&&value.votes&&typeof value.votes==='object'){saved.notes=value.notes.filter(n=>n&&/^local-[a-zA-Z0-9-]+$/.test(n.id)&&typeof n.site==='string'&&n.own===true&&typeof n.text==='string'&&n.text.length<=1000&&Object.hasOwn(NOTE_CATEGORIES,n.category)&&Number.isFinite(Date.parse(n.createdAt))).map(n=>({...n,author:'You',votes:0}));saved.votes=Object.fromEntries(Object.entries(value.votes).filter(([,v])=>v===true));}}catch{}
 let persisted=true,removed=null;
 function write(){try{storage.setItem(NOTES_KEY,JSON.stringify(saved));persisted=true;}catch{persisted=false;}}
 function rows(site,{sort='helpful',category='all'}={}){return [...SAMPLE_NOTES,...saved.notes].filter(n=>n.site===site&&(category==='all'||n.category===category)).map(n=>({...n,upvoted:saved.votes[n.id]===true,score:(n.votes||0)+(saved.votes[n.id]?1:0)})).sort((a,b)=>sort==='newest'?Date.parse(b.createdAt)-Date.parse(a.createdAt):b.score-a.score||Date.parse(b.createdAt)-Date.parse(a.createdAt));}
 function add(site,{text,category,observedOn=''}){const clean=String(text||'').trim();if(clean.length<10||clean.length>1000)throw Error('Write a note between 10 and 1,000 characters.');if(!Object.hasOwn(NOTE_CATEGORIES,category))throw Error('Choose a note category.');if(!site||typeof site!=='string')throw Error('Choose a dive site.');if(category==='conditions'&&!observedOn)throw Error('Add the date you observed these conditions.');if(observedOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)||!Number.isFinite(Date.parse(observedOn))||new Date(observedOn+'T12:00:00Z').toISOString().slice(0,10)!==observedOn||observedOn>new Date().toISOString().slice(0,10)))throw Error('Use an observation date of today or earlier.');const note={id:'local-'+crypto.randomUUID(),site,author:'You',own:true,category,text:clean,observedOn,createdAt:new Date().toISOString(),votes:0};saved.notes.push(note);write();return note;}
 function vote(id){if(![...SAMPLE_NOTES,...saved.notes].some(n=>n.id===id))throw Error('That note is unavailable.');saved.votes[id]=!saved.votes[id];if(!saved.votes[id])delete saved.votes[id];write();return !!saved.votes[id];}
 function remove(id){const index=saved.notes.findIndex(n=>n.id===id);if(index<0)throw Error('Only your own preview notes can be removed.');removed={note:saved.notes[index],vote:saved.votes[id]};saved.notes.splice(index,1);delete saved.votes[id];write();}
 function undo(){if(!removed)return;const {note,vote}=removed;saved.notes.push(note);if(vote)saved.votes[note.id]=true;removed=null;write();}
 return {rows,add,vote,remove,undo,get persisted(){return persisted;},get canUndo(){return !!removed;}};
}
