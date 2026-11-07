import {AUSTRALIAN_SCENES,landingSceneURL} from './australian-scenes.js';
import {inkPaletteId} from './ink-palettes.js';
// Alternate small illustration crops through the short sections. Long demos stay plain.
export function installLandingAccents(doc=document){
 const win=doc.defaultView,entries=[];
 for(const [selector,slug,side]of [['.landing-regulars-section','port-phillip','right'],['.landing-conditions','bicheno','left'],['.landing-last','point-lowly','right']]){
  const host=doc.querySelector(selector);if(!host||host.querySelector('.landing-illustration'))continue;
  const scene=AUSTRALIAN_SCENES.find(scene=>scene.slug===slug),accent=doc.createElement('span');
  accent.className='landing-illustration';accent.dataset.side=side;accent.dataset.scene=slug;accent.setAttribute('aria-hidden','true');host.classList.add('landing-illustrated');host.append(accent);entries.push({accent,scene,loaded:false});
 }
 const load=entry=>{entry.loaded=true;entry.accent.style.setProperty('--landing-illustration',`url("${landingSceneURL(entry.scene,inkPaletteId(doc.documentElement.dataset.theme||'yellow'),win.innerWidth<=600)}")`);};
 const refresh=()=>{for(const entry of entries)if(entry.loaded)load(entry);};
 const observer=win.IntersectionObserver?new win.IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){const entry=entries.find(entry=>entry.accent===item.target);if(entry){load(entry);observer.unobserve(item.target);}}},{rootMargin:'250px'}):null;
 for(const entry of entries)if(observer)observer.observe(entry.accent);else load(entry);
 doc.addEventListener('finfolk:appearance',refresh);win.addEventListener('resize',refresh);
 return {destroy(){observer?.disconnect();doc.removeEventListener('finfolk:appearance',refresh);win.removeEventListener('resize',refresh);}};
}
