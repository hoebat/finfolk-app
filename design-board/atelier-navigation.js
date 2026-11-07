import {SCREENS,SECTIONS} from './screens.mjs';
import {WORKFLOWS} from './workflows.mjs';
export const DESIGN_SECTIONS=[
 ['underwater-scene','Underwater scenes','underwater-scene'],
 ['wordmark','Official wordmark','official-wordmark-section'],
 ['state-motifs','State animal prints','state-motifs-section'],
 ['small-marks','Single-f treatments','small-mark-section'],
 ['stencils','Swimmers & freediver stencils','stencil-section'],
 ['habitat','Underwater habitats','habitat-section'],
 ['page-designs','Landing & product pages','page-design-section'],
];
export function installAtelierNavigation(host){
 const menus=[];
 function menu(label){const details=document.createElement('details');details.className='atelier-menu';const summary=document.createElement('summary');summary.textContent=label;const panel=document.createElement('div');panel.className='atelier-menu-panel';details.append(summary,panel);host.append(details);menus.push(details);details.addEventListener('toggle',()=>{if(details.open)for(const other of menus)if(other!==details)other.open=false;});return panel;}
 function link(parent,hash,label){const a=document.createElement('a');a.href='#'+hash;a.textContent=label;parent.append(a);a.addEventListener('click',()=>{for(const item of menus)item.open=false;});}
 const screens=menu('Product previews');
 link(screens,'screens','All UI screens');
 for(const group of SECTIONS){const section=document.createElement('section');const heading=document.createElement('h3');heading.textContent=group;section.append(heading);for(const screen of SCREENS.filter(s=>s.section===group))link(section,'preview/'+screen.id,screen.name);screens.append(section);}
 const designs=menu('Design studio');link(designs,'board','Mood board');link(designs,'designs','All design studies');for(const [hash,label] of DESIGN_SECTIONS)link(designs,hash,label);
 const logos=designs;for(const [hash,label] of [['logos','All logo ideas'],['fins','Fin studies'],['club','Club lettering'],['lava','Lava lettering'],['logos/shortlist','Shortlisted logos']])link(logos,hash,label);
 const workflows=menu('Workflows');link(workflows,'workflows','All workflows');for(const journey of WORKFLOWS)link(workflows,'workflows/'+journey.id+'/'+journey.steps[0].id,journey.name);
 function update(){for(const a of host.querySelectorAll('a')){const active=a.hash===location.hash;if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}for(const item of menus)item.classList.toggle('has-current',!!item.querySelector('[aria-current]'));}
 host.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=menus.find(m=>m.open);if(open){open.open=false;open.querySelector('summary').focus();}}});
 document.addEventListener('click',event=>{if(!host.contains(event.target))for(const item of menus)item.open=false;});
 return {update};
}
