export const HABITATS=Object.freeze([
 {id:'seagrass',name:'Seagrass',asset:'habitat-seagrass-v1.webp'},
 {id:'reef-rocks',name:'Reef rocks',asset:'habitat-reef-rocks-v1.webp'},
 {id:'stingray',name:'Stingray',asset:'habitat-stingray-v1.webp'},
 {id:'turtle',name:'Sea turtle',asset:'habitat-turtle-v1.webp'},
 {id:'kelp',name:'Kelp forest',asset:'habitat-kelp-v1.webp'},
 {id:'fan-coral',name:'Fan coral',asset:'habitat-fan-coral-v1.webp'},
 {id:'reef-arch',name:'Reef arch',asset:'habitat-reef-arch-v1.webp'},
 {id:'schooling-fish',name:'Schooling fish',asset:'habitat-schooling-fish-v1.webp'},
]);
export function habitatMask(id){const habitat=HABITATS.find(item=>item.id===id)||HABITATS[0];return `url("${new URL('./'+habitat.asset,import.meta.url).href}")`;}
const installed=new WeakMap();
export function installHabitatScenes(doc=document){
 if(installed.has(doc))return;
 function decorate(){
  for(const page of doc.querySelectorAll('.logbook-page,.account-page,.discover-page,.settings-page,.trip-page')){
   if(page.querySelector(':scope > .habitat-scene'))continue;
   const scene=doc.createElement('div');scene.className='habitat-scene';scene.setAttribute('aria-hidden','true');
   for(const id of ['seagrass','reef-rocks','stingray']){const shape=doc.createElement('span');shape.className='habitat-shape';shape.dataset.habitat=id;shape.style.setProperty('--habitat-mask',habitatMask(id));scene.append(shape);}
   page.prepend(scene);
  }
 }
 const Observer=doc.defaultView?.MutationObserver;if(Observer){let pending=false;const observer=new Observer(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;decorate();});});observer.observe(doc.body,{childList:true,subtree:true});installed.set(doc,observer);}else installed.set(doc,true);
 decorate();
}
