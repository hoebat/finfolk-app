export const BRAND_ID='slow-melt-f';
export const BRAND_COLOURS={navy:'#172440',ivory:'#f2e8d6',cobalt:'#1641ff',pink:'#ff148d'};
export function createBrandWordmark({width=400,print=false,decorative=false,label='FinFolk'}={}){
 const mark=document.createElement('span');mark.className='brand-wordmark';mark.dataset.brandMaster='slow-melt-wordmark';mark.style.setProperty('--wordmark-width',width+'px');
 if(print)mark.dataset.brandPrint='fine';
 if(decorative)mark.setAttribute('aria-hidden','true');else{mark.setAttribute('role','img');mark.setAttribute('aria-label',label);}
 const fill=document.createElement('span');fill.className='brand-wordmark__fill';mark.append(fill);return mark;
}
export function createBrandMark({size=48,colour,print=false,label='FinFolk',decorative=true}={}){
 const mark=document.createElement('span');mark.className='brand-mark';mark.dataset.brandMaster=BRAND_ID;mark.style.setProperty('--brand-size',size+'px');
 if(colour)mark.style.color=colour;
 if(print)mark.dataset.brandPrint='fine';
 if(decorative)mark.setAttribute('aria-hidden','true');else{mark.setAttribute('role','img');mark.setAttribute('aria-label',label);}
 const fill=document.createElement('span');fill.className='brand-mark__fill';mark.append(fill);return mark;
}
export const SWIMMER_POSES=Object.freeze([
 {id:'descending',name:'Descent',asset:'freediver-descending-v1.webp'},
 {id:'ascending',name:'Ascent',asset:'freediver-ascending-v1.webp'},
 {id:'gliding',name:'Glide',asset:'freediver-gliding-v1.webp'},
 {id:'freestyle',name:'Freestyle',asset:'swimmer-freestyle-v1.webp'},
 {id:'breaststroke',name:'Breaststroke',asset:'swimmer-breaststroke-v1.webp'},
 {id:'duck-dive',name:'Duck dive',asset:'swimmer-duck-dive-v1.webp'},
 {id:'back-float',name:'Back float',asset:'swimmer-back-float-v1.webp'},
]);
export function swimmerMask(id){const pose=SWIMMER_POSES.find(item=>item.id===id)||SWIMMER_POSES[1];return `url("${new URL('./'+pose.asset,import.meta.url).href}")`;}
export function createFreediverStencil({pose='ascending',treatment='behind',darkness}={}){
 const figure=document.createElement('div');figure.className='diver-stencil';figure.dataset.pose=SWIMMER_POSES.some(item=>item.id===pose)?pose:'ascending';figure.dataset.stencil=treatment==='inside'?'inside':'behind';figure.setAttribute('aria-hidden','true');
 figure.style.setProperty('--diver-mask',swimmerMask(figure.dataset.pose));
 if(Number.isFinite(darkness))figure.style.setProperty('--stencil-darkness',String(Math.max(0,Math.min(.9,darkness))));
 const silhouette=document.createElement('span');silhouette.className='diver-stencil__figure';figure.append(silhouette);return figure;
}
