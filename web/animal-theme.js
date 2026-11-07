import {ANIMALS,animalById,animalPrint} from './animal-prints.js';
import {refreshAnimalDecorations,currentAnimalCollection} from './animal-decoration.js';
const storageKey='finfolk-animal';
const valid=id=>id==='default'||id==='none'||!!animalById(id);
let selected='default';
const storageChanged=event=>{if(event.key==='finfolk-animal'||event.key===null)applySavedAnimal();};
export function selectedAnimal(){return selected;}
export function applyAnimalAppearance(){
 const root=document.documentElement,mode=root.dataset.theme||'light';
 root.dataset.animal=selected;
 if(selected==='default'){
  const collectionAnimal=root.ownerDocument.defaultView.getComputedStyle(root).getPropertyValue('--finfolk-collection-animal').trim();
  const asset=animalPrint(collectionAnimal||'octopus',mode,currentAnimalCollection(root));
  if(asset)root.style.setProperty('--finfolk-animal-print',`url("${new URL('./'+asset,import.meta.url).href}")`);else root.style.removeProperty('--finfolk-animal-print');
  delete root.dataset.animalArt;refreshAnimalDecorations();return;
 }
 const asset=animalPrint(selected,mode,currentAnimalCollection(root));
 root.style.setProperty('--finfolk-animal-print',asset?`url("${new URL('./'+asset,import.meta.url).href}")`:'none');
 root.dataset.animalArt=selected==='none'?'none':asset?'ready':'pending';
 refreshAnimalDecorations();
}
export function applySavedAnimal(){
 document.addEventListener('finfolk:appearance',applyAnimalAppearance);
 globalThis.window?.addEventListener('storage',storageChanged);
 let saved;try{saved=localStorage.getItem(storageKey);}catch{}
 selected=valid(saved)?saved:'default';applyAnimalAppearance();return selected;
}
export function animalSettings(){
 const section=document.createElement('section');section.className='account-card animal-settings';
 const title=document.createElement('h2');title.textContent='Animal pattern';
 const copy=document.createElement('p');copy.textContent='Choose an animal pattern for FinFolk. Your colour theme is set separately.';
 const choices=document.createElement('fieldset');choices.className='animal-choices';
 const legend=document.createElement('legend');legend.textContent='Site animal';choices.append(legend);
 const status=document.createElement('p');status.setAttribute('role','status');
 for(const animal of [{id:'default',name:'FinFolk · blue-ringed octopus'},{id:'none',name:'No animal pattern'},...ANIMALS]){
  const label=document.createElement('label');label.className='animal-choice';
  const radio=document.createElement('input');radio.type='radio';radio.name='animal';radio.value=animal.id;radio.checked=selected===animal.id;
  const name=document.createElement('strong');name.textContent=animal.name;label.append(radio,name);
  if(animalById(animal.id)){
   const asset=animalPrint(animal.id,document.documentElement.dataset.theme||'light',currentAnimalCollection());if(asset){const preview=document.createElement('img');preview.src=new URL('./'+asset,import.meta.url).href;preview.dataset.animalPreview=animal.id;preview.alt='';preview.loading='lazy';label.append(preview);}const note=document.createElement('small');note.textContent=asset?'Animal print':'Print coming soon';label.append(note);
  }
  radio.onchange=()=>{
   if(!radio.checked)return;selected=animal.id;applyAnimalAppearance();let persisted=true;
   try{localStorage.setItem(storageKey,selected);}catch{persisted=false;}
   const awaiting=animalById(selected)&&!animalPrint(selected);
   status.textContent=`${animal.name} selected${persisted?' on this device':' for this visit'}.${awaiting?' Its print will appear when available.':''}`;
  };
  choices.append(label);
 }
 section.append(title,copy,choices,status);return section;
}
