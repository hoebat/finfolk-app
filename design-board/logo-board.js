import {LOGO_DIRECTIONS} from './logo-directions.mjs';
import {FIN_STUDIES} from './fin-studies.mjs';
import {CLUB_STUDIES} from './club-studies.mjs';
import {LAVA_STUDIES} from './lava-studies.mjs';
const directions=[...LAVA_STUDIES,...CLUB_STUDIES,...FIN_STUDIES,...LOGO_DIRECTIONS];
const studyKinds={fins:['fin-study'],club:['club-study','lava-study'],lava:['lava-study']};
const storageKey='finfolk:atelier:logos:v1';
export function installLogoBoard({onStatus=()=>{}}={}){
 const grid=document.getElementById('logo-grid'),count=document.getElementById('logo-shortlist-count');
 let saved={},filter=studyKinds[location.hash.slice(1)]?location.hash.slice(1):'all';
 try{const value=JSON.parse(localStorage.getItem(storageKey)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
 const cards=new Map();
 function persist(){try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{onStatus('Logo notes are kept for this visit. Export the brief to keep them.',true);}}
 function draw(){
  const selected=directions.filter(d=>saved[d.id]?.shortlisted===true);
  count.textContent=selected.length+' shortlisted';
  for(const [id,card] of cards){const picked=saved[id]?.shortlisted===true;card.hidden=(filter==='shortlist'&&!picked)||(!!studyKinds[filter]&&!studyKinds[filter].includes(card.dataset.logoKind));card.dataset.shortlisted=String(picked);const button=card.querySelector('[data-logo-shortlist]');button.setAttribute('aria-pressed',String(picked));button.textContent=picked?'Shortlisted ✓':'Shortlist this direction';}
  document.getElementById('logo-level-guide').hidden=filter!=='fins';
  document.getElementById('logo-club-guide').hidden=filter!=='club';
  document.getElementById('logo-lava-guide').hidden=filter!=='lava';
  document.getElementById('logo-empty').hidden=filter!=='shortlist'||selected.length>0;
  for(const button of document.querySelectorAll('[data-logo-filter]'))button.setAttribute('aria-pressed',String(button.dataset.logoFilter===filter));
 }
 directions.forEach((direction,index)=>{
  const card=document.createElement('article');card.className='logo-direction';card.dataset.logoDirection=direction.id;card.dataset.logoKind=direction.kind||'direction';
  const link=document.createElement('a');link.className='logo-artwork';link.href=direction.original;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','Enlarge '+direction.name+' logo board');
  const image=document.createElement('img');image.src=direction.image;image.alt=direction.alt||direction.name+(direction.kind==='fin-study'?' paired study: full interlocking mark on the left and rear fin alone on the right, with muted, reversed and hyper colour samples':' logo exploration, with wordmark and muted, reversed and hyper colour studies');image.width=1024;image.height=1024;image.loading=index<2?'eager':'lazy';link.append(image);
  const body=document.createElement('div');body.className='logo-direction-body';
  const category=document.createElement('p');category.className='logo-direction-category';category.textContent=String(index+1).padStart(2,'0')+' / '+direction.fit;
  const title=document.createElement('h3');title.textContent=direction.name;
  const rationale=document.createElement('p');rationale.textContent=direction.note;
  const refine=document.createElement('p');refine.className='logo-refine';const label=document.createElement('strong');label.textContent='To refine: ';refine.append(label,document.createTextNode(direction.refine));
  const actions=document.createElement('div');actions.className='logo-direction-actions';
  const shortlist=document.createElement('button');shortlist.type='button';shortlist.dataset.logoShortlist=direction.id;shortlist.onclick=()=>{saved[direction.id]={...saved[direction.id],shortlisted:saved[direction.id]?.shortlisted!==true};persist();draw();};
  const original=document.createElement('a');original.href=direction.original;original.target='_blank';original.rel='noopener';original.textContent='Full-size board ↗';actions.append(shortlist,original);
  const notes=document.createElement('label');notes.className='logo-notes';notes.textContent='Your notes';
  const input=document.createElement('textarea');input.rows=3;input.maxLength=4000;input.value=typeof saved[direction.id]?.notes==='string'?saved[direction.id].notes.slice(0,4000):'';input.placeholder='What to keep, change or combine…';input.setAttribute('aria-label','Notes for '+direction.name);
  input.oninput=()=>{saved[direction.id]={...saved[direction.id],notes:input.value};persist();};notes.append(input);
  body.append(category,title,rationale,refine,actions,notes);card.append(link,body);cards.set(direction.id,card);grid.append(card);
 });
 function selectFilter(value){filter=value;draw();}
 for(const button of document.querySelectorAll('[data-logo-filter]'))button.onclick=()=>{selectFilter(button.dataset.logoFilter);location.hash=studyKinds[filter]?filter:filter==='shortlist'?'logos/shortlist':'logos';};
 document.getElementById('logo-export').onclick=()=>{
  const body={title:'FinFolk logo ideation',focus:'Freedivers and freediving training',directions:directions.map(d=>({id:d.id,name:d.name,kind:d.kind||'direction',shortlisted:saved[d.id]?.shortlisted===true,notes:typeof saved[d.id]?.notes==='string'?saved[d.id].notes:'',image:d.original,refine:d.refine}))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='finfolk-logo-brief.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onStatus('Logo shortlist and notes exported.');
 };
 draw();
 return {selectFilter};
}
