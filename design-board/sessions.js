import {createSessionMedia} from './session-media.js';
import {SESSION_EXAMPLES,sessionSummary,timeLabel} from './session-data.mjs';
import {installLocalNavigation} from './local-navigation.js';
import {visualPalette,applyPaletteVariables,PALETTE_OVERRIDES} from '../web/visual-language.js';
import {compileTheme} from './theme-engine.mjs';
import {inkPaletteId,themeForInkPalette} from '../web/ink-palettes.js';
export function installSessions({doc=document}={}){
 const win=doc.defaultView,main=doc.getElementById('profile-main'),theme=doc.getElementById('profile-theme');
 const media=createSessionMedia({doc,onView:id=>{const url=new URL(win.location.href);url.searchParams.set('source',id);win.history.pushState(null,'',url);pop();}});
 const navigation=installLocalNavigation({doc,nav:doc.querySelector('.profile-nav'),rail:doc.querySelector('.profile-rail')});
 doc.querySelector('[data-nav=logbook]').setAttribute('aria-current','page');
 let session=SESSION_EXAMPLES.find(s=>s.id===new URL(win.location.href).searchParams.get('source'))||SESSION_EXAMPLES[0],selected=1;
 const el=(tag,text,parent=main,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;};
 const button=(text,fn,parent,cls)=>{const b=el('button',text,parent,cls);b.type='button';b.onclick=fn;return b;};
 function svgNode(tag,attrs,parent){const n=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);parent.append(n);return n;}
 function chart(host,dives,detail=false){
  const svg=svgNode('svg',{viewBox:'0 0 900 250',role:'img','aria-label':detail?'Selected dive depth profile':'Session depth timeline. Select a dive using the numbered controls or dive list.'},host);
  const end=detail?dives[0].duration:session.elapsed,deep=Math.ceil(Math.max(...session.dives.map(d=>d.maxDepth))/5)*5;
  const x=t=>55+t/end*810,y=d=>25+d/deep*180;
  for(let d=0;d<=deep;d+=5){svgNode('line',{x1:55,x2:865,y1:y(d),y2:y(d),class:'depth-grid'},svg);const t=svgNode('text',{x:6,y:y(d)+4},svg);t.textContent=d+' m';}
  for(let i=0;i<=4;i++){const t=svgNode('text',{x:x(end*i/4),y:237,'text-anchor':'middle'},svg);t.textContent=timeLabel(Math.round(end*i/4));}
  for(const dive of dives){let path='',broken=true;for(const point of dive.samples){if(point.depth==null){broken=true;continue;}path+=(broken?'M':'L')+x(point.seconds+(detail?0:dive.start))+','+y(point.depth);broken=false;}
   const line=svgNode('path',{d:path,class:'depth-line'+(dive.id===selected?' selected':''),'data-dive':dive.id},svg);if(!detail){line.style.cursor='pointer';line.onclick=()=>selectDive(dive.id);}
  }
 }
 function selectDive(id){const active=doc.activeElement,fromList=active?.classList.contains('dive-row'),fromControls=active?.closest('.dive-controls');selected=id;renderAnalysis();if(fromList)doc.querySelector('.dive-row[aria-pressed=true]')?.focus();else if(fromControls)doc.querySelector('.dive-controls [aria-pressed=true]')?.focus();}
 function renderAnalysis(){const host=doc.getElementById('session-analysis');host.replaceChildren();
  if(!session.dives.length){el('h2','Your time in the water.',host);el('p','This session was logged by hand. Add a watch record to explore individual dives and a depth profile.',host);return;}
  const heading=el('div',undefined,host,'session-section-title');el('h2','Below the surface.',heading);el('span','DEPTH / ELAPSED TIME',heading,'session-kicker');
  chart(host,session.dives);const controls=el('div',undefined,host,'dive-controls');for(const dive of session.dives){const b=button('Dive '+dive.id,()=>selectDive(dive.id),controls,'dive-chip');b.setAttribute('aria-pressed',String(dive.id===selected));}
  const split=el('div',undefined,host,'analysis-split'),list=el('div',undefined,split,'dive-list');el('h3','The dives',list);
  for(const dive of session.dives){const b=button('',()=>selectDive(dive.id),list,'dive-row');b.setAttribute('aria-pressed',String(dive.id===selected));el('span',String(dive.id).padStart(2,'0'),b);el('strong',dive.maxDepth.toFixed(1)+' m',b);el('span',timeLabel(dive.duration)+' underwater',b);el('span',timeLabel(dive.start)+' elapsed',b);}
  const dive=session.dives.find(d=>d.id===selected),panel=el('section',undefined,split,'dive-detail');panel.setAttribute('aria-live','polite');el('p','DIVE '+String(dive.id).padStart(2,'0'),panel,'session-kicker');el('h3',dive.maxDepth.toFixed(1)+' metres down.',panel);chart(panel,[dive],true);
  const facts=el('dl',undefined,panel,'dive-facts');for(const [label,value]of [['Underwater',timeLabel(dive.duration)],['Surface before dive',timeLabel(dive.surfaceInterval)],['Water temperature',dive.temperature==null?'Not recorded':dive.temperature.toFixed(1)+' °C']]){el('dt',label,facts);el('dd',value,facts);}
  if(dive.samples.some(p=>p.depth==null))el('p','A missing sample leaves a gap in this profile.',panel,'session-muted');
 }
 function render(){main.replaceChildren();
  const picker=el('div',undefined,main,'session-picker');el('span','WATCH STUDIES',picker,'session-kicker');for(const example of SESSION_EXAMPLES){const b=button(example.device,()=>{session=example;selected=1;const url=new URL(win.location.href);url.searchParams.set('source',session.id);win.history.pushState(null,'',url);render();},picker,'dive-chip');b.setAttribute('aria-pressed',String(example.id===session.id));}
  const hero=el('section',undefined,main,'session-hero'),story=el('div',undefined,hero);el('p','LOGBOOK / '+session.location.toUpperCase(),story,'session-kicker');el('h1',session.title,story);el('p',session.date+' · '+session.startTime+' · Freediving',story,'session-muted');el('p',session.notes,story,'session-story');const byline=el('div',undefined,story,'session-byline');const avatar=el('img',undefined,byline);avatar.src='/board/assets/people/alex-portrait-sketch-v2.webp';avatar.alt='Fictional diver Alex';el('span',session.diver+' with Maya · '+session.privacy,byline);
  const figure=el('figure',undefined,hero,'session-photo');const image=el('img',undefined,figure);image.src='/board/assets/people/shore-session-sketch-v2.webp';image.alt='Illustrative coastal session';el('figcaption','Salt in the air. No hurry to leave. / Illustrative image',figure);
  media.mount(el('section',undefined,main,'session-media'),session.id);
  const summary=sessionSummary(session),stats=el('dl',undefined,main,'session-stats');for(const [label,value]of [['Dives',summary.count],['Session time',timeLabel(session.elapsed)],['Underwater',timeLabel(summary.underwater)],['Deepest dive',summary.maxDepth.toFixed(1)+' m'],['Longest dive',timeLabel(summary.longest)]]){const item=el('div',undefined,stats);el('dt',label,item);el('dd',String(value),item);}
  if(session.manual)el('p','Totals entered by the diver.',main,'session-muted');
  el('section',undefined,main,'session-analysis').id='session-analysis';renderAnalysis();
  const details=el('details',undefined,main,'session-source');el('summary','About this record · '+session.device,details);el('p',session.device+' / '+session.app+' / '+session.origin,details);el('p','Illustrative display data, not a decoded export or a promise of file compatibility. Notes and imagery are added by the diver.',details);
  el('p',session.manual?'Entered totals only. No sensor readings or individual dive records.':'Available in this example: dive times, maximum depths and sampled depth profiles'+(session.id==='apple'?'. Temperature is not recorded.':', plus temperature.')+(session.id==='suunto'?' Dive 3 includes a missing depth sample.':''),details);
 }
 const style=el('style',undefined,doc.head);function choose(id){const p=visualPalette(id);applyPaletteVariables(p,doc.documentElement);doc.documentElement.style.setProperty('--finfolk-animal-print',`url("/web/animal-octopus-${inkPaletteId(p.id)}-v1.webp")`);doc.documentElement.dataset.theme=p.id;theme.value=p.id;}
 let saved;try{saved=win.localStorage.getItem('finfolk-theme')||win.localStorage.getItem('finfolk:atelier:palette:v1');}catch{}choose(saved);
 theme.onchange=()=>{style.textContent='';choose(theme.value);try{win.localStorage.setItem('finfolk-theme',theme.value);}catch{}};
 const receive=e=>{if(e.origin!==win.location.origin||e.source!==win.parent||win.parent===win||e.data?.type!=='finfolk:theme')return;try{style.textContent=compileTheme(e.data.theme);for(const v of PALETTE_OVERRIDES)doc.documentElement.style.removeProperty(v);doc.documentElement.dataset.theme=themeForInkPalette(inkPaletteId(e.data.theme));}catch{}};
 const pop=()=>{session=SESSION_EXAMPLES.find(s=>s.id===new URL(win.location.href).searchParams.get('source'))||SESSION_EXAMPLES[0];selected=1;render();};win.addEventListener('message',receive);win.addEventListener('popstate',pop);render();if(win.parent!==win)win.parent.postMessage({type:'finfolk:ready'},win.location.origin);
 return {destroy(){media.destroy();navigation.destroy();win.removeEventListener('message',receive);win.removeEventListener('popstate',pop);style.remove();},get session(){return session;}};
}
if(typeof document!=='undefined'&&document.getElementById('profile-main'))installSessions();
