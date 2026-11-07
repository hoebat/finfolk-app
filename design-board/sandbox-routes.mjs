import {SCREENS,screenURL} from './screens.mjs';
export const MAIN_ROUTES=[['map-explore','Explore'],['community-home','Community'],['dives-home','Dives'],['you-home','You']];
export const routeURL=(id,query='')=>'/try/#'+encodeURIComponent(id)+(query?'?'+query:'');
export function resolveRoute(hash){try{const raw=hash.replace(/^#/,''),[id,query='']=raw.split('?');const screen=SCREENS.find(s=>s.id===decodeURIComponent(id));return {id:screen?.id||'map-explore',query,section:screen?.section||'Explore'};}catch{return {id:'map-explore',query:'',section:'Explore'};}}
export function frameURL(id,query=''){const url=new URL(screenURL(id),'http://sandbox.local');for(const [k,v]of new URLSearchParams(query))url.searchParams.set(k,v);url.searchParams.set('sandbox','1');return url.pathname+url.search;}
export function routeFromURL(value){try{const url=new URL(value,'http://sandbox.local');if(!['/board/','/preview/'].some(p=>url.pathname.startsWith(p)))return null;const p=url.searchParams;let id=p.get('atelier-screen');
 if(url.pathname.endsWith('/dives.html'))id=({mates:'dives-mates',tagged:'dives-tagged'})[p.get('tab')]||'dives-home';
 else if(url.pathname.endsWith('/community.html'))id=({events:'events-browse',practice:'practice-home',you:'you-home'})[p.get('section')]||'community-home';
 else if(url.pathname.endsWith('/map-explore.html'))id='map-explore';
 else if(url.pathname.endsWith('/profiles.html'))id=({people:'people',member:'diver-profile',me:'my-profile',edit:'edit-profile'})[p.get('screen')]||'people';
 else if(url.pathname.endsWith('/finnies.html'))id=({manage:'finnies-manage',rewards:'finnies-rewards',confirm:'finnies-confirm',empty:'finnies-empty'})[p.get('screen')]||'finnies-shop';
 else if(url.pathname.endsWith('/onboarding.html'))id='onboarding';
 else if(url.pathname.endsWith('/events.html'))id='create-event';
 else if(url.pathname.endsWith('/practice.html'))id=({'history':'practice-history',setup:'practice-setup',demo:'practice-demo',player:'practice-active',reflection:'practice-reflection'})[p.get('screen')]||'practice-library';
 else if(url.pathname.endsWith('/pages.html'))id=SCREENS.find(s=>s.previewPath==='/board/pages.html'&&new URLSearchParams(s.query).get('screen')===(p.get('screen')||'overview')&&(!p.has('collection')||new URLSearchParams(s.query).get('collection')===p.get('collection')))?.id||'page-workspace';
 else if(url.pathname==='/preview/'||url.pathname.endsWith('/index.html'))id=p.get('view')==='logbook'?(p.has('session')?'session':id==='new-session'?'new-session':'logbook'):p.get('view')==='maps'?'map-explore':p.get('view')==='settings'?'settings':p.get('view')==='account'?(p.get('tab')==='checkin'?'checkin':'profile'):id||'map-explore';
 if(id==='onboarding'&&url.hash)p.set('step',url.hash.slice(1));
 id ||= SCREENS.find(s=>s.previewPath===url.pathname)?.id;if(!SCREENS.some(s=>s.id===id))return null;p.delete('sandbox');p.delete('atelier-screen');return {id,query:p.toString()};}catch{return null;}}
