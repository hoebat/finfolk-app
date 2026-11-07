import {createBrandMark,createBrandWordmark,createFreediverStencil,SWIMMER_POSES,swimmerMask} from '../web/brand.js';
import {visualPalette} from '../web/visual-language.js';
import {habitatMask,HABITATS} from '../web/habitat.js';
import {animalPrint} from '../web/animal-prints.js';
import {PRESETS} from './theme-engine.mjs';
import {PAGE_DIRECTIONS} from './page-directions.mjs';
import {screenURL} from './screens.mjs';
const id=new URLSearchParams(location.search).get('direction');
const direction=PAGE_DIRECTIONS.find(d=>d.id===id)||PAGE_DIRECTIONS[0];
const root=document.documentElement,frame=document.getElementById('study-app');
document.body.dataset.direction=direction.id;document.title='FinFolk · '+direction.name;
document.getElementById('study-edition').textContent='FinFolk / '+direction.name.toUpperCase()+' / FREEDIVING & TRAINING';
const theme=structuredClone(PRESETS[direction.preset]);theme.motif='octopus';theme.radius=24;theme.printStyle='two-tone';
let paletteId=direction.id==='midnight-current'?'navy':direction.id==='below-the-surface'?'cobalt':'yellow';
let collection=visualPalette(paletteId).collection,animal=theme.motif;
document.getElementById('study-nav-mark').append(createBrandMark({size:42}));document.getElementById('study-footer-mark').append(createBrandMark({size:38}));
document.getElementById('study-signature').append(createBrandWordmark({width:460}));
document.getElementById('study-hero-stencil').append(createFreediverStencil({pose:direction.id==='acid-social'?'gliding':'descending',treatment:direction.id==='midnight-current'?'inside':'behind'}));
for(const size of [32,64,128,256]){const proof=document.createElement('figure');const caption=document.createElement('figcaption');caption.textContent=size+' px'+(size>=128?' / fine print':' / plain');proof.append(createBrandMark({size,print:true}),caption);document.getElementById('study-brand-range').append(proof);}
for(const treatment of ['behind','inside']){const proof=document.createElement('figure');const caption=document.createElement('figcaption');caption.textContent=treatment==='behind'?'A silhouette against your print.':'Your print, revealed through the diver.';proof.append(createFreediverStencil({pose:'ascending',treatment}),caption);document.getElementById('study-stencil-pair').append(proof);}
function sendTheme(){frame.contentWindow?.postMessage({type:'finfolk:theme',theme,animal},location.origin);}
function render(){
 const choice=visualPalette(paletteId);Object.assign(theme.palette,choice.palette);for(const [name,value] of Object.entries(choice.palette))root.style.setProperty('--study-'+name,value);document.getElementById('study-palette').value=paletteId;
 const asset=animal==='none'?null:animalPrint(animal,{palette:choice.palette,collection},collection);
 root.style.setProperty('--finfolk-animal-print',asset?`url('/preview/${asset}')`:'none');root.dataset.animal=animal;
 theme.motif=animal;theme.collection=collection;document.getElementById('study-animal').value=animal;document.getElementById('study-collection').value=collection;sendTheme();
}
document.getElementById('study-palette').onchange=event=>{paletteId=visualPalette(event.target.value).id;collection=visualPalette(paletteId).collection;render();};
document.getElementById('study-animal').onchange=event=>{animal=event.target.value;render();};
document.getElementById('study-collection').onchange=event=>{collection=event.target.value;render();};
for(const button of document.querySelectorAll('[data-study-screen]'))button.onclick=()=>{frame.src=screenURL(button.dataset.studyScreen);for(const other of document.querySelectorAll('[data-study-screen]'))other.setAttribute('aria-pressed',String(other===button));};
document.getElementById('study-device').onclick=event=>{const phone=document.getElementById('study-app-window').classList.toggle('phone');event.currentTarget.setAttribute('aria-pressed',String(phone));event.currentTarget.textContent=phone?'Full width':'Phone view';};
frame.addEventListener('load',sendTheme);window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==='finfolk:ready')sendTheme();});
render();

const shape=document.getElementById('study-shape');shape.replaceChildren();
for(const [label,items] of [['Swimmers',SWIMMER_POSES],['Underwater',HABITATS]]){const group=document.createElement('optgroup');group.label=label;for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;group.append(option);}shape.append(group);}
shape.value=direction.id==='acid-social'?'gliding':'descending';
shape.onchange=()=>{for(const stencil of document.querySelectorAll('.diver-stencil')){if(HABITATS.some(h=>h.id===shape.value)){stencil.dataset.pose='ascending';stencil.style.setProperty('--diver-mask',habitatMask(shape.value));}else{stencil.dataset.pose=shape.value;stencil.style.setProperty('--diver-mask',swimmerMask(shape.value));}}};
const darkness=document.getElementById('study-darkness');darkness.oninput=()=>{const value=Math.max(0,Math.min(90,Number(darkness.value)||0));root.style.setProperty('--stencil-darkness',String(value/100));document.getElementById('study-darkness-value').textContent=value+'%';};darkness.oninput();
