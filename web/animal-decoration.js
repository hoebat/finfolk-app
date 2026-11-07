import {animalPrint} from './animal-prints.js';
import {stateMotif} from './state-motifs.js';
const SVG_NS='http://www.w3.org/2000/svg';
let patternSequence=0;
export function currentAnimalCollection(root=document.documentElement){
 if(['yellow','acid','pink','cobalt'].includes(root.dataset.theme))return 'hyper';
 return root.ownerDocument.defaultView.getComputedStyle(root).getPropertyValue('--finfolk-print-collection').trim()==='hyper'?'hyper':'muted';
}
export function currentAnimalDecoration(){
 const root=document.documentElement,styles=root.ownerDocument.defaultView.getComputedStyle(root);
 const choice=root.dataset.animal||'default',collection=styles.getPropertyValue('--finfolk-collection-animal').trim();
 const placement=styles.getPropertyValue('--finfolk-print-placement').trim()||'states';
 const intensity=styles.getPropertyValue('--finfolk-pattern-presence').trim();
 const opacity=intensity===''?1:Math.max(0,Math.min(1,Number(intensity)||0));
 const printCollection=currentAnimalCollection(root);
 const asset=choice==='none'||placement!=='states'||opacity===0?null:animalPrint(choice==='default'?collection:choice,root.dataset.theme||'light',printCollection);
 const scale=Number(styles.getPropertyValue('--finfolk-motif-scale'))||1;
 return {asset,scale:Math.max(.6,Math.min(1.6,scale)),opacity};
}
export function regionalDecoration(stateId,placement='states'){
 const root=document.documentElement,styles=root.ownerDocument.defaultView.getComputedStyle(root),motif=stateMotif(stateId);
 const decoration=currentAnimalDecoration(),currentPlacement=styles.getPropertyValue('--finfolk-print-placement').trim()||'states';
 const quiet=root.dataset.animal==='none'||styles.getPropertyValue('--finfolk-collection-animal').trim()==='none';
 return {...decoration,animal:motif?.animal,asset:quiet||!motif||decoration.opacity===0||currentPlacement!==placement?null:animalPrint(motif.animal,root.dataset.theme||'light',currentAnimalCollection(root))};
}
export function decorateStateSection(section){
 const decoration=regionalDecoration(section.dataset.stateId,'sections');
 if(decoration.asset){section.dataset.stateMotif=decoration.animal;section.style.setProperty('--state-motif-print',`url("${new URL('./'+decoration.asset,import.meta.url).href}")`);}
 else{delete section.dataset.stateMotif;section.style.removeProperty('--state-motif-print');}
}
export function decorateStateThumbnail(svg,decoration=regionalDecoration(svg.dataset.stateId)){
 const path=svg.querySelector('.beach-thumbnail-land');if(!path)return;
 let pattern=svg.querySelector('.beach-animal-pattern');
 if(!decoration.asset){
  pattern?.parentElement?.remove();delete svg.dataset.animalPrint;delete svg.dataset.stateMotif;svg.style.removeProperty('--beach-state-fill');return;
 }
 if(!pattern){
  const defs=document.createElementNS(SVG_NS,'defs');pattern=document.createElementNS(SVG_NS,'pattern');
  pattern.id='finfolk-state-print-'+(++patternSequence);pattern.classList.add('beach-animal-pattern');pattern.setAttribute('patternUnits','userSpaceOnUse');
  const image=document.createElementNS(SVG_NS,'image');image.setAttribute('preserveAspectRatio','xMidYMid slice');pattern.append(image);defs.append(pattern);svg.prepend(defs);
 }
 const size=(svg.classList.contains('beach-thumbnail--compact')?70:100)*decoration.scale;
 for(const node of [pattern,pattern.querySelector('image')]){node.setAttribute('width',size);node.setAttribute('height',size);}
 pattern.querySelector('image').setAttribute('href',new URL('./'+decoration.asset,import.meta.url).href);
 pattern.querySelector('image').setAttribute('opacity',decoration.opacity??1);
 svg.dataset.animalPrint='true';svg.style.setProperty('--beach-state-fill',`url("#${pattern.id}")`);
 if(decoration.animal)svg.dataset.stateMotif=decoration.animal;
}
export function refreshAnimalDecorations(){
 for(const svg of document.querySelectorAll('.beach-thumbnail'))decorateStateThumbnail(svg);
 for(const section of document.querySelectorAll('.state-card[data-state-id]'))decorateStateSection(section);
 for(const preview of document.querySelectorAll('[data-animal-preview]')){
  const asset=animalPrint(preview.dataset.animalPreview,document.documentElement.dataset.theme||'light',currentAnimalCollection());
  if(asset)preview.src=new URL('./'+asset,import.meta.url).href;
 }
}
