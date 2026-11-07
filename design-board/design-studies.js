import {SMALL_MARKS} from './small-marks.mjs';
import {PAGE_DIRECTIONS} from './page-directions.mjs';
import {ARCHIVED_SMALL_MARKS} from './archived-small-marks.mjs';
import {createBrandMark,createBrandWordmark,createFreediverStencil,SWIMMER_POSES} from '../web/brand.js';
import {HABITATS,habitatMask} from '../web/habitat.js';
import {installUnderwaterScene,UNDERWATER_ARTWORK} from './underwater-scene.js';
const storageKey='finfolk:atelier:design-studies:v1';
export function installDesignStudies({onPreview=()=>{},onStatus=()=>{}}={}){
 installUnderwaterScene({onStatus});
 let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
 if(typeof saved!=='object'||Array.isArray(saved))saved={};
 const buttons=new Map();
 for(const print of [false,true]){const figure=document.createElement('figure');const caption=document.createElement('figcaption');caption.textContent=print?'Fine print / display sizes only':'Official full wordmark / solid ink';figure.append(createBrandWordmark({width:480,print}),caption);document.getElementById('official-wordmark-proofs').append(figure);}
 function persist(){try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{onStatus('Export your notes to keep them beyond this visit.',true);}}
 function chooseMark(id,{save=true}={}){
  const mark=SMALL_MARKS.find(m=>m.id===id)||SMALL_MARKS[0];
  for(const image of document.querySelectorAll('[data-atelier-mark]'))image.src=mark.image;
  document.getElementById('atelier-favicon').href=mark.favicon;
  document.documentElement.dataset.atelierMark=mark.id;
  for(const [key,button] of buttons){button.setAttribute('aria-pressed',String(key===mark.id));button.textContent=key===mark.id?'In the Atelier ✓':'Try in the Atelier';}
  if(save){saved.mark=mark.id;persist();onStatus(mark.name+' is framing the Atelier. The Slow melt shape stays locked.');}
 }
 function notesFor(id,name){
  const label=document.createElement('label');label.className='study-notes';label.textContent='Your notes';
  const input=document.createElement('textarea');input.rows=2;input.maxLength=4000;input.setAttribute('aria-label','Design notes for '+name);input.placeholder='What to keep, change or combine…';input.value=typeof saved.notes?.[id]==='string'?saved.notes[id].slice(0,4000):'';
  input.oninput=()=>{saved.notes={...saved.notes,[id]:input.value};persist();};label.append(input);return label;
 }
 for(const mark of SMALL_MARKS){
  const card=document.createElement('article');card.className='small-mark-card';card.dataset.smallMark=mark.id;
  card.style.setProperty('--mark-paper',mark.paper);card.style.setProperty('--mark-ink',mark.colour);
  const proof=document.createElement('div');proof.className='small-mark-proof';const image=document.createElement('img');image.src=mark.image;image.alt=mark.name+' locked Slow melt f';image.width=128;image.height=128;proof.append(image);
  const title=document.createElement('h4');title.textContent=mark.name;const copy=document.createElement('p');copy.textContent=mark.note;
  const sizes=document.createElement('div');sizes.className='small-mark-sizes';
  for(const size of [16,24,32,48,64]){const figure=document.createElement('figure'),sample=document.createElement('img'),caption=document.createElement('figcaption');sample.src=mark.image;sample.alt='';sample.width=size;sample.height=size;caption.textContent=size+' px';figure.append(sample,caption);sizes.append(figure);}
  const navigation=document.createElement('div');navigation.className='small-mark-navigation';const navImage=document.createElement('img');navImage.src=mark.image;navImage.width=24;navImage.height=24;navImage.alt='';navigation.append(navImage,Object.assign(document.createElement('span'),{textContent:'Places  ·  Logbook'}));
  const refine=document.createElement('p');refine.className='study-refine';refine.textContent=mark.refine;
  const actions=document.createElement('div');actions.className='study-actions';const use=document.createElement('button');use.type='button';use.dataset.useAtelierMark=mark.id;use.onclick=()=>chooseMark(mark.id);buttons.set(mark.id,use);
  const source=document.createElement('a');source.href=mark.original;source.target='_blank';source.rel='noopener';source.textContent='SVG master ↗';actions.append(use,source);
  const large=document.createElement('div');large.className='large-mark-proof';large.style.background=mark.paper;large.style.setProperty('--finfolk-collection-print',`url('/preview/animal-octopus${mark.collection==='hyper'?'-hyper':''}-v1.webp')`);const largeLabel=document.createElement('span');largeLabel.textContent='160 px / fine display print';large.append(createBrandMark({size:160,colour:mark.colour,print:true}),largeLabel);
  card.append(proof,title,copy,sizes,navigation,large,refine,actions,notesFor(mark.id,mark.name));document.getElementById('small-mark-grid').append(card);
 }
 const archive=document.createElement('details');archive.className='identity-archive';const summary=document.createElement('summary');summary.textContent='Previous shape experiments · archived';archive.append(summary);
 for(const mark of ARCHIVED_SMALL_MARKS){const row=document.createElement('div');const link=document.createElement('a');link.href=mark.original;link.target='_blank';link.rel='noopener';link.textContent=mark.name+' ↗';row.append(link,notesFor(mark.id,mark.name));archive.append(row);}document.getElementById('small-mark-section').append(archive);
 const stencilGrid=document.getElementById('stencil-grid');
 for(const {id:pose,name:label} of SWIMMER_POSES)for(const treatment of ['behind','inside']){const figure=document.createElement('figure');figure.className='stencil-proof';const caption=document.createElement('figcaption');caption.textContent=label+' / pattern '+(treatment==='behind'?'behind the silhouette':'inside the stencil');figure.append(createFreediverStencil({pose,treatment}),caption);stencilGrid.append(figure);}
 for(const habitat of HABITATS){const figure=document.createElement('figure');figure.className='habitat-study';const stencil=createFreediverStencil({treatment:'inside'});stencil.style.setProperty('--diver-mask',habitatMask(habitat.id));const caption=document.createElement('figcaption');caption.textContent=habitat.name;figure.append(stencil,caption);document.getElementById('habitat-gallery').append(figure);}
 const darkness=document.getElementById('stencil-darkness');
 function updateDarkness(){const value=Math.max(0,Math.min(90,Number(darkness.value)||0));document.documentElement.style.setProperty('--stencil-darkness',String(value/100));document.getElementById('stencil-darkness-value').textContent=value+'%';saved.darkness=value;persist();}
 darkness.value=String(Number.isFinite(saved.darkness)?Math.max(0,Math.min(90,saved.darkness)):65);darkness.oninput=updateDarkness;updateDarkness();
 for(const [index,direction] of PAGE_DIRECTIONS.entries()){
  const card=document.createElement('article');card.className='page-direction';card.dataset.pageDirection=direction.id;
  const header=document.createElement('div');header.className='page-direction-heading';const title=document.createElement('h4');title.textContent=String(index+1).padStart(2,'0')+' / '+direction.name;
  const palette=document.createElement('div');palette.className='study-palette';palette.setAttribute('aria-label',direction.name+' palette');for(const colour of direction.palette){const swatch=document.createElement('span');swatch.style.background=colour;swatch.title=colour;palette.append(swatch);}header.append(title,palette);
  const copy=document.createElement('p');copy.textContent=direction.note;
  const source=document.createElement('iframe');source.className='page-design-live';source.src=direction.preview;source.title=direction.name+' live landing and product study';source.loading='lazy';
  const actions=document.createElement('div');actions.className='study-actions';const preview=document.createElement('button');preview.type='button';preview.dataset.previewDesign=direction.id;preview.textContent='Preview related colours in the live app';preview.onclick=()=>onPreview(direction);const link=document.createElement('a');link.href=direction.preview;link.target='_blank';link.rel='noopener';link.textContent='Open responsive page ↗';actions.append(preview,link);
  card.append(header,copy,source,actions,notesFor(direction.id,direction.name));document.getElementById('page-direction-grid').append(card);
  if(direction.original){const previous=document.createElement('details');previous.className='identity-archive';const label=document.createElement('summary');label.textContent='Previous generated concept';const link=document.createElement('a');link.href=direction.original;link.target='_blank';link.rel='noopener';link.textContent='Open archived artwork ↗';previous.append(label,link);card.append(previous);}
 }
 document.getElementById('study-export').onclick=()=>{
  const brief={title:'FinFolk — locked Slow melt identity and stencil studies',logo:'slow-melt-f',wordmark:'slow-melt-wordmark',atelierMark:SMALL_MARKS.some(m=>m.id===saved.mark)?saved.mark:SMALL_MARKS[0].id,notes:saved.notes||{},smallMarks:SMALL_MARKS,archivedSmallMarks:ARCHIVED_SMALL_MARKS,pageDirections:PAGE_DIRECTIONS,swimmers:SWIMMER_POSES,habitats:HABITATS,underwaterScene:UNDERWATER_ARTWORK[document.getElementById('scene-image').value]};
  const url=URL.createObjectURL(new Blob([JSON.stringify(brief,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='finfolk-design-studies.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onStatus('Design notes exported.');
 };
 if(!SMALL_MARKS.some(m=>m.id===saved.mark)){saved.mark=SMALL_MARKS[0].id;persist();}
 chooseMark(saved.mark,{save:false});
}
