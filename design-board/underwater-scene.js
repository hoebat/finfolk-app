// Each view is a complete generated image, with shared engraved illustration style.
import {SCENE_PALETTES,inkPaletteId} from '../web/ink-palettes.js';
import {AUSTRALIAN_SCENES} from '../web/australian-scenes.js';
export const UNDERWATER_ARTWORK=Object.freeze({
 ...Object.fromEntries(AUSTRALIAN_SCENES.map(scene=>[scene.id,scene])),
 'coral-reef-acid':{id:'coral-reef-acid',name:'Coral reef · acid',asset:'finfolk-underwater-coral-reef-acid-v1',caption:'Coral reef / a world along the edge',note:'A coral ridge falls away into shoaling fish and open water.',alt:'An intricate living coral reef ridge descending into luminous open water, with shoaling fish and a distant ray, illustrated in acid yellow, cobalt and hot pink.'},
 'shipwreck-acid':{id:'shipwreck-acid',name:'Shipwreck · acid',asset:'finfolk-underwater-shipwreck-acid-v1',caption:'Shipwreck / what the sea keeps',note:'An overgrown hull rests in a quiet canyon of light.',alt:'An old sunken cargo ship resting on a sandy seabed, its open hull and bridge covered in marine growth under shafts of light, illustrated in acid colours.'},
 'sunken-city-acid':{id:'sunken-city-acid',name:'Sunken city · acid',asset:'finfolk-underwater-sunken-city-acid-v1',caption:'Sunken city / streets below the tide',note:'Submerged terraces, arcades and domes fade into the blue.',alt:'A completely submerged ancient city with domed pavilions, colonnades and terraces receding underwater among fish and marine plants, illustrated in acid colours.'},
 'cave-acid':{id:'cave-acid',name:'Cave · acid',asset:'finfolk-underwater-cave-acid-v1',caption:'Cave / a doorway into the blue',note:'Sculpted limestone opens onto a luminous underwater exit.',alt:'The interior of a flooded limestone cavern, with sculpted rock ribs and submerged stalactites framing a sunlit underwater exit, illustrated in cobalt, pink and acid yellow.'},
 'tropical-lagoon-acid':{id:'tropical-lagoon-acid',name:'Tropical lagoon · acid',asset:'finfolk-underwater-tropical-lagoon-acid-v1',caption:'Tropical lagoon / the bright shallows',note:'Rippled sand channels weave between bright coral gardens.',alt:'A shallow tropical lagoon with winding rippled sand channels, coral gardens, small fish and a sea turtle under a sunlit surface, illustrated in acid colours.'},
 'arctic-ice-acid':{id:'arctic-ice-acid',name:'Arctic ice · acid',asset:'finfolk-underwater-arctic-ice-acid-v1',caption:'Arctic ice / beneath the frozen surface',note:'Fractured pack ice and a deep iceberg keel frame open water.',alt:'An underwater Arctic landscape beneath fractured pack ice, with immense sculpted iceberg keels, a small seal and light entering through the ice, illustrated in acid colours.'},
 'ascent-acid':{id:'ascent-acid',name:'Ascent · acid',asset:'finfolk-underwater-ascent-acid-v1',caption:'Ascent / toward the light',note:'Kelp forest, reef arch and an ascending freediver.',alt:'An ascending freediver above a kelp-covered reef arch, with sunlight crossing the water, illustrated in acid yellow, electric cobalt and hot pink.'},
 'reef-glide-acid':{id:'reef-glide-acid',name:'Reef glide · acid',asset:'finfolk-underwater-reef-glide-acid-v1',caption:'Reef glide / through the passage',note:'A freediver and sea turtle move through a rocky passage.',alt:'A freediver gliding through a continuous rocky reef passage toward sunlit water and a sea turtle, illustrated in acid yellow, electric cobalt and hot pink.'},
 'jelly-drift-acid':{id:'jelly-drift-acid',name:'Jelly drift · acid',asset:'finfolk-underwater-jelly-drift-acid-v1',caption:'Jelly drift / following the current',note:'Moon jellies drift above a quiet seagrass reef.',alt:'A freediver observing moon jellyfish drifting above a seagrass reef under a rippled surface, illustrated in acid yellow, electric cobalt and hot pink.'},
 stylised:{id:'stylised',name:'Ascent · muted',asset:'finfolk-underwater-ascent-stylised-v2',caption:'Ascent / an illustrated underwater world',alt:'An ascending freediver in a continuous underwater kelp forest and rocky reef, with a natural arch, small fish and shafts of surface light, illustrated in navy, ivory and dusty rose.'},
 natural:{id:'natural',name:'Ascent · natural study',asset:'finfolk-underwater-ascent-natural-v2',caption:'Ascent / the natural scene study',alt:'A generated natural underwater scene with a freediver ascending through sunlit water above a kelp-covered rocky reef and natural arch.'},
});
export const ACID_VIGNETTES=Object.freeze(Object.keys(UNDERWATER_ARTWORK).filter(id=>id.endsWith('-acid')));
const artworkURL=(art,format)=>new URL('./assets/scenes/'+art.asset+'.'+format,import.meta.url).href;
const paletteURL=(art,palette,format)=>new URL('./assets/scenes/palettes/'+art.asset+'/'+palette+'.'+format,import.meta.url).href;
export function installUnderwaterScene(){
 const host=document.getElementById('underwater-scene-art');if(!host)return;
 const image=document.createElement('img');image.className='underwater-artwork';image.width=1448;image.height=1086;image.decoding='async';host.replaceChildren(image);
 const select=document.getElementById('scene-image'),download=document.getElementById('scene-download'),caption=document.getElementById('scene-caption'),palette=document.getElementById('scene-palette'),master=document.getElementById('scene-master');
 const query=new URLSearchParams(window.location.search);let saved;try{saved=localStorage.getItem('finfolk:artwork:palette:v1');}catch{}
 for(const p of Object.values(SCENE_PALETTES)){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;palette.append(option);}palette.value=inkPaletteId(query.get('palette')||saved||document.documentElement.dataset.studioPalette||'acid-light');
 const buttons=new Map(),initial=new URLSearchParams(window.location.search).get('scene');
 select.replaceChildren();for(const art of Object.values(UNDERWATER_ARTWORK)){const option=document.createElement('option');option.value=art.id;option.textContent=art.name.replace(' · acid','');select.append(option);}select.value=Object.hasOwn(UNDERWATER_ARTWORK,initial)?initial:'ascent-acid';
 const gallery=document.getElementById('scene-vignettes');
 if(gallery){gallery.replaceChildren();for(const id of ACID_VIGNETTES){const art=UNDERWATER_ARTWORK[id],button=document.createElement('button'),thumb=document.createElement('img'),name=document.createElement('span'),note=document.createElement('span');button.type='button';button.className='vignette-card';button.dataset.vignette=id;thumb.src=artworkURL(art,'webp');thumb.width=400;thumb.height=300;thumb.alt='';thumb.loading='lazy';name.className='vignette-card__name';name.textContent=art.name;note.className='vignette-card__note';note.textContent=art.note;button.append(thumb,name,note);button.onclick=()=>{select.value=id;render();host.scrollIntoView({block:'start'});};buttons.set(id,button);gallery.append(button);}}
 function render(){
  const art=UNDERWATER_ARTWORK[select.value]||UNDERWATER_ARTWORK['ascent-acid'];
  const editable=ACID_VIGNETTES.includes(art.id),p=palette.value;palette.parentElement.hidden=!editable;master.hidden=!editable;
  image.src=editable?paletteURL(art,p,'webp'):artworkURL(art,'webp');image.alt=editable?art.alt.replace(/illustrated in[^.]+/i,'illustrated in '+SCENE_PALETTES[p].name+' colours'):art.alt;image.dataset.artwork=art.id;image.dataset.palette=editable?p:'original';
  download.href=editable?paletteURL(art,p,'png'):artworkURL(art,'png');download.download=art.asset+(editable?'-'+p:'')+'.png';caption.textContent=art.caption+(editable?' · '+SCENE_PALETTES[p].name:'');
  master.href=new URL('./assets/ink-masters/scenes/'+art.asset+'/master.zip',import.meta.url).href;master.download=art.asset+'-master.zip';
  for(const [id,button] of buttons){button.querySelector('img').src=paletteURL(UNDERWATER_ARTWORK[id],p,'webp');button.querySelector('.vignette-card__name').textContent=UNDERWATER_ARTWORK[id].name.replace(' · acid','');}
  for(const [id,button] of buttons)button.setAttribute('aria-pressed',String(id===art.id));
 }
 function setPalette(){try{localStorage.setItem('finfolk:artwork:palette:v1',palette.value);}catch{}render();}
 palette.onchange=setPalette;document.addEventListener('finfolk:palette',event=>{palette.value=inkPaletteId(event.detail);setPalette();});
 select.onchange=render;render();
}
