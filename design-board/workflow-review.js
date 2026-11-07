import {WORKFLOWS,REVIEW_STATES} from './workflows.mjs';
import {SCREENS,screenURL} from './screens.mjs';
export function installWorkflowReview({host,getTheme=()=>({})}){
 const key='finfolk:atelier:workflow-reviews:v1';let reviews={},visitOnly=false,journey=WORKFLOWS[0],index=0,device='phone';
 try{reviews=JSON.parse(localStorage.getItem(key)||'{}');if(!reviews||typeof reviews!=='object'||Array.isArray(reviews))reviews={};}catch{visitOnly=true;}
 const el=(tag,text,parent=host,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;};
 const button=(text,fn,parent=host)=>{const b=el('button',text,parent);b.type='button';b.onclick=fn;return b;};
 const header=el('header',undefined,host,'workflow-heading');el('span','THE FinFolk EXPERIENCE',header,'eyebrow');el('h2','Little moments.\nA whole journey.',header);el('p','Explore each flow on a phone first. Review the details as you go.',header);
 const catalogue=el('details',undefined,host,'workflow-catalogue');el('summary','Choose a journey',catalogue);const filterLabel=el('label','Review status',catalogue),filter=el('select',undefined,filterLabel);for(const v of ['All',...REVIEW_STATES])el('option',v,filter);
 const cards=el('div',undefined,catalogue,'workflow-cards'),notice=el('p','',catalogue,'workflow-notice');
 const title=el('div',undefined,host,'workflow-current');const stepNav=el('nav',undefined,host,'workflow-step-nav');stepNav.setAttribute('aria-label','Journey steps');
 const layout=el('div',undefined,host,'workflow-layout');
 const preview=el('section',undefined,layout,'workflow-preview'),toolbar=el('div',undefined,preview,'workflow-toolbar');
 const frame=el('iframe',undefined,preview,'workflow-frame phone');frame.title='Workflow screen preview';frame.onload=()=>refreshTheme();
 const instructions=el('section',undefined,layout,'workflow-instructions');
 const navigation=el('nav',undefined,host,'workflow-navigation');navigation.setAttribute('aria-label','Previous and next workflow step');
 function refreshTheme(){frame.contentWindow?.postMessage({type:'finfolk:theme',theme:getTheme()},location.origin);}
 function save(){try{localStorage.setItem(key,JSON.stringify(reviews));}catch{visitOnly=true;}notice.textContent=visitOnly?'Reviews last for this visit. Browser storage is unavailable.':'Manual reviews are saved in this browser. They do not certify live integrations.';renderCards();}
 function route(j,s){location.hash='workflows/'+j.id+'/'+s.id;catalogue.open=false;}
 function renderCards(){cards.replaceChildren();for(const j of WORKFLOWS){const states=j.steps.map(s=>reviews[j.id+'/'+s.id]?.status||'Not reviewed');if(filter.value!=='All'&&!states.includes(filter.value))continue;const b=button('',()=>route(j,j.steps[0]),cards);el('strong',j.name,b);el('span',states.filter(s=>s!=='Not reviewed').length+' of '+states.length+' reviewed',b);b.setAttribute('aria-pressed',String(j.id===journey.id));}}
 function render(){
  title.replaceChildren();stepNav.replaceChildren();instructions.replaceChildren();toolbar.replaceChildren();navigation.replaceChildren();
  const step=journey.steps[index],id=journey.id+'/'+step.id,available=step.screen&&SCREENS.some(s=>s.id===step.screen),record=reviews[id]||{};
  el('p',journey.name+' / '+String(index+1).padStart(2,'0')+' OF '+String(journey.steps.length).padStart(2,'0'),title,'eyebrow');el('h3',step.title,title);el('p',step.expected,title);
  journey.steps.forEach((s,i)=>{const b=button((i+1)+'. '+s.title,()=>route(journey,s),stepNav);if(i===index)b.setAttribute('aria-current','step');});
  const context=el('details',undefined,instructions,'workflow-context');el('summary','Before you start',context);el('p','Role: '+journey.role,context);el('p',journey.prerequisite,context);
  const review=el('div',undefined,instructions,'workflow-review-form');el('h4','How did it feel?',review);el('p',available?'Record a design review for this step.':'This screen has not been built yet. It cannot be marked Passed.',review);
  const status=el('select',undefined,el('label','Review status',review));for(const v of REVIEW_STATES){const o=el('option',v,status);o.disabled=!available&&v==='Passed';}status.setAttribute('aria-label','Review status');status.value=record.status||'Not reviewed';
  const notes=el('textarea',undefined,el('label','Review notes',review));notes.rows=4;notes.placeholder='What works? What needs a little care?';notes.value=record.notes||'';const metadata=el('small','',review);
  function recordReview(){reviews[id]={status:status.value,notes:notes.value,theme:getTheme().name||'Current theme',device,reviewedAt:new Date().toISOString()};metadata.textContent=reviews[id].theme+' · '+device+' · '+reviews[id].reviewedAt;save();}status.onchange=recordReview;notes.oninput=recordReview;if(record.reviewedAt)metadata.textContent=record.theme+' · '+record.device+' · '+record.reviewedAt;
  const sizes=el('div',undefined,toolbar,'workflow-device-picker');for(const size of ['phone','desktop']){const b=button(size==='phone'?'Phone':'Responsive',()=>{device=size;frame.classList.toggle('phone',device==='phone');render();},sizes);b.setAttribute('aria-pressed',String(device===size));}frame.classList.toggle('phone',device==='phone');
  if(available){const url=screenURL(step.screen);if(frame.dataset.url!==url){frame.dataset.url=url;if(frame.getAttribute('src')&&frame.contentWindow)frame.contentWindow.location.replace(url);else frame.src=url;}frame.hidden=false;const a=el('a','Open screen ↗',toolbar);a.href=url;a.target='_blank';a.rel='noopener';}
  else{frame.hidden=true;frame.dataset.url='';frame.src='about:blank';el('p','This UI is not implemented in the Atelier yet.',toolbar);}
  const prev=button('← Previous',()=>route(journey,journey.steps[index-1]),navigation);prev.disabled=index===0;
  el('span',(index+1)+' / '+journey.steps.length,navigation);
  const next=button('Next step →',()=>route(journey,journey.steps[index+1]),navigation);next.disabled=index===journey.steps.length-1;
  const tools=el('details',undefined,instructions,'workflow-review-tools');el('summary','Review tools',tools);
  button('Export reviews',()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),reviews},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='finfolk-workflow-reviews.json';a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},tools);
  button('Reset this journey',()=>{if(!confirm('Reset review statuses and notes for '+journey.name+'?'))return;for(const s of journey.steps)delete reviews[journey.id+'/'+s.id];save();render();},tools);
  renderCards();
 }
 function readRoute(){if(location.hash!=='#workflows'&&!location.hash.startsWith('#workflows/'))return;const [,j,s]=location.hash.split('/');journey=WORKFLOWS.find(x=>x.id===j)||WORKFLOWS[0];index=Math.max(0,journey.steps.findIndex(x=>x.id===s));render();}
 filter.onchange=renderCards;save();readRoute();
 return {frame,refreshTheme,open:readRoute};
}
