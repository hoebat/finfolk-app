import {STATE_MOTIFS} from '../web/state-motifs.js';
import {animalById,animalPrint} from '../web/animal-prints.js';
import {beachThumbnail} from '../web/beach-thumbnail.js';
import {decorateStateThumbnail} from '../web/animal-decoration.js';
export function refreshStateMotifGallery(collection='hyper',quiet=false,appearance='light'){
 const host=document.getElementById('state-motif-gallery');if(!host)return;
 if(!host.children.length)for(const motif of STATE_MOTIFS){
  const card=document.createElement('article');card.className='state-motif-study';card.dataset.regionalState=motif.state;
  const svg=beachThumbnail({state_id:motif.state,name:motif.name,point:null});svg.setAttribute('aria-label',motif.name+' · '+animalById(motif.animal).name+' print');
  const title=document.createElement('h4');title.textContent=motif.state+' / '+animalById(motif.animal).name;
  const species=document.createElement('p');species.textContent=motif.species;
  const detail=document.createElement('p');detail.textContent=motif.size+' · '+motif.hazard;
  const source=document.createElement('a');source.href=motif.source;source.target='_blank';source.rel='noopener';source.textContent='Local species source ↗';
  card.append(svg,title,species,detail,source);
  if(motif.hazardSource){const hazard=document.createElement('a');hazard.href=motif.hazardSource;hazard.target='_blank';hazard.rel='noopener';hazard.textContent='Species details ↗';card.append(hazard);}
  host.append(card);
 }
 for(const motif of STATE_MOTIFS){const svg=host.querySelector(`[data-regional-state="${motif.state}"] svg`);decorateStateThumbnail(svg,{asset:quiet?null:animalPrint(motif.animal,appearance,collection),animal:motif.animal,scale:1,opacity:1});}
}
