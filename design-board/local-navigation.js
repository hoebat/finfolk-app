// Shared navigation for local app previews and the profile prototype only.
const installed=new WeakMap();
export const LOCAL_NAV_ITEMS=[['explore','Explore'],['community','Community'],['dives','Dives'],['you','You']];
export function navigationSection(url){const u=new URL(url),p=u.searchParams,path=u.pathname,screen=p.get('screen')||'';if(path.endsWith('/map-explore.html')||['maps','discover','areas'].includes(p.get('view')))return 'explore';if(path.endsWith('/events.html')||p.get('section')==='events'||screen==='events')return 'community';if(path.endsWith('/finnies.html')||['people','member','directory','business','group','person','public','school-gallery'].includes(screen))return 'community';if(/dives|practice|sessions|watch-sync|breath-analyser/.test(path)||p.get('view')==='logbook'||['sessions','progress'].includes(screen)||p.get('section')==='practice')return 'dives';if(path.endsWith('/community.html'))return p.get('section')==='you'?'you':'community';return 'you';}

const paths={events:['M4 5h16v16H4Z','M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2'],discover:['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z','m16 8-2.5 5.5L8 16l2.5-5.5Z'],map:['m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z','M9 3v16M15 5v16'],people:['M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z','M4 21v-2a8 8 0 0 1 16 0v2M19 4a3 3 0 0 1 0 6M3 4a3 3 0 0 0 0 6'],logbook:['M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15','M6 8h3m-3 4h3m6-4h3m-3 4h3'],me:['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z','M4 22v-2a8 8 0 0 1 16 0v2'],more:['M4 6h16M4 12h16M4 18h16']};
function icon(doc,key){const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');for(const d of paths[({explore:'discover',community:'people',practice:'logbook',dives:'logbook',you:'me',events:'events'})[key]||key]||paths.more){const p=doc.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);svg.append(p);}return svg;}
export function localNavigationURL(key,location=''){
 if(key==='explore')return '/board/map-explore.html'+(location?'?site='+encodeURIComponent(location):'');
 if(key==='community')return '/board/community.html';
 if(key==='dives')return '/board/dives.html';
 if(key==='events')return '/board/community.html?section=events';
 if(key==='practice')return '/board/community.html?section=practice';
 if(key==='you')return '/board/community.html?section=you';
 const site=location?encodeURIComponent(location):'',context=site?'&site='+site:'';
 if(['people','me','edit'].includes(key))return '/board/profiles.html?screen='+key+(site?'&location='+site:'');
 if(key==='shop')return '/board/finnies.html?screen=shop';
 if(key==='pages')return '/board/pages.html?screen=mine';
 if(key==='sessions')return '/board/pages.html?screen=sessions';
 if(key==='onboarding')return '/board/onboarding.html';
 if(key==='discover')return '/preview/?view=discover&section=index&atelier-screen=directory'+context;
 if(key==='map')return '/preview/?view=maps&atelier-screen=map'+context;
 if(key==='logbook')return '/preview/?view=logbook&atelier-screen=logbook'+context;
 if(key==='checkin')return '/preview/?view=account&tab=checkin&atelier-screen=checkin'+context;
 if(key==='settings')return '/preview/?view=settings&atelier-screen=settings'+context;
 return '/#screens';
}
export function installLocalNavigation({doc=document,nav,rail,context=()=>''}={}){
 if(!nav||!rail)return null;if(installed.has(nav))return installed.get(nav);
 const win=doc.defaultView,listeners=[];let expanded=false;
 const listen=(target,event,fn,capture=false)=>{target.addEventListener(event,fn,capture);listeners.push(()=>target.removeEventListener(event,fn,capture));};
 doc.body.classList.add('local-navigation-enabled');if(nav.classList.contains('primary-nav'))doc.body.classList.add('local-app-navigation');nav.classList.add('ff-primary-nav');
 const home=rail.querySelector('.brand,.profile-home');if(home)home.href='/preview/landing.html';
 if(!doc.getElementById('local-navigation-styles')){const css=doc.createElement('link');css.id='local-navigation-styles';css.rel='stylesheet';css.href='/board/local-navigation.css';doc.head.append(css);}
 function decorate(item,key,label){item.classList.add('ff-nav-item');item.dataset.localNav=key;const text=doc.createElement('span');text.textContent=label;item.replaceChildren(icon(doc,key),text);}
 const originals=[...nav.childNodes],legacy=doc.createElement('div');legacy.hidden=true;legacy.className='local-legacy-controls';legacy.append(...originals);nav.replaceChildren(legacy);
 for(const [key,label]of LOCAL_NAV_ITEMS){const a=doc.createElement('a');decorate(a,key,label);nav.append(a);}
 let fallback;const nativeLogbook=null;
 const host=doc.createElement('div');host.className='ff-utility-menu';const toggle=doc.createElement('button');toggle.type='button';toggle.className='ff-menu-toggle';toggle.id='local-menu-toggle';toggle.setAttribute('aria-controls','local-menu-panel');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open menu');const toggleLabel=doc.createElement('span');toggleLabel.textContent='More';toggle.append(icon(doc,'more'),toggleLabel);
 const panel=doc.createElement('nav');panel.id='local-menu-panel';panel.className='ff-menu-panel';panel.setAttribute('aria-label','Account and settings');panel.hidden=true;
 for(const [key,label]of [['edit','Edit profile'],['checkin','Check in'],['settings','Settings'],['onboarding','Getting started'],['pages','My pages'],['sessions','My sessions & progress'],['atelier','Back to Atelier ↗']]){const a=doc.createElement('a');a.textContent=label;a.dataset.localUtility=key;if(key==='edit')a.dataset.profileScreen='edit';panel.append(a);}host.append(toggle,panel);rail.append(host);
 function close({focus=false}={}){expanded=false;panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open menu');if(focus)toggle.focus();}
 function update(){const selected=context(),activeSection=navigationSection(win.location.href);for(const a of nav.querySelectorAll('a.ff-nav-item')){const active=a.dataset.localNav===activeSection;if(active&&a.getAttribute('aria-current')!=='page')a.setAttribute('aria-current','page');else if(!active&&a.hasAttribute('aria-current'))a.removeAttribute('aria-current');}for(const item of nav.querySelectorAll('a.ff-nav-item'))item.href=localNavigationURL(item.dataset.localNav,selected);for(const a of panel.querySelectorAll('a'))a.href=localNavigationURL(a.dataset.localUtility,selected);if(fallback){const hidden=!nativeLogbook.hidden;if(fallback.hidden!==hidden)fallback.hidden=hidden;const current=nativeLogbook.getAttribute('aria-current');if(current==='page'){if(fallback.getAttribute('aria-current')!=='page')fallback.setAttribute('aria-current','page');}else if(fallback.hasAttribute('aria-current'))fallback.removeAttribute('aria-current');}const p=new URL(win.location.href).searchParams;for(const a of panel.querySelectorAll('[data-local-utility]')){const key=a.dataset.localUtility,active=key==='settings'&&p.get('view')==='settings'||key==='checkin'&&p.get('view')==='account'&&(!p.get('tab')||p.get('tab')==='checkin')||key==='edit'&&p.get('screen')==='edit'||key==='shop'&&win.location.pathname.endsWith('/finnies.html');if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}toggle.dataset.sectionActive=String(p.get('view')==='settings'||p.get('view')==='account'||win.location.pathname.endsWith('/finnies.html'));}
 listen(toggle,'click',()=>{update();expanded=!expanded;panel.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'Close menu':'Open menu');if(expanded)panel.querySelector('a')?.focus();});
 listen(doc,'keydown',event=>{if(!expanded)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close({focus:true});}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){const links=[...panel.querySelectorAll('a')],index=links.indexOf(doc.activeElement);if(index>=0){event.preventDefault();links[(index+(event.key==='ArrowDown'?1:-1)+links.length)%links.length].focus();}}},true);
 listen(doc,'pointerdown',event=>{if(expanded&&!host.contains(event.target))close();});listen(doc,'focusin',event=>{if(expanded&&!host.contains(event.target))close();});
 listen(panel,'click',event=>{const a=event.target.closest('a');if(a){a.href=localNavigationURL(a.dataset.localUtility,context());close();}});
 listen(nav,'click',event=>{const a=event.target.closest('a.ff-nav-item');if(a)a.href=localNavigationURL(a.dataset.localNav,context());close();});listen(win,'popstate',()=>{close();update();});
 const observer=new win.MutationObserver(update);observer.observe(nav,{attributes:true,attributeFilter:['hidden','aria-current'],subtree:true});update();
 const api={update,close,destroy(){close();observer.disconnect();for(const remove of listeners)remove();host.remove();fallback?.remove();nav.replaceChildren(...originals);nav.classList.remove('ff-primary-nav');installed.delete(nav);}};installed.set(nav,api);return api;
}
