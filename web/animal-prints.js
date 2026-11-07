// Original artwork developed with ChatGPT native image generation.
// Keep print filenames versioned and at web/ root so the static builder includes them.
import {inkPaletteId} from './ink-palettes.js';
export const ANIMALS=Object.freeze([
 {id:'bluebottle',name:'Bluebottle',prints:{light:'animal-bluebottle-v1.webp',hyper:'animal-bluebottle-hyper-v1.webp'}},
 {id:'boxjelly',name:'Box jelly',prints:{light:'animal-boxjelly-v1.webp',hyper:'animal-boxjelly-hyper-v1.webp'}},
 {id:'octopus',name:'Blue-ringed octopus',prints:{light:'animal-octopus-v1.webp',hyper:'animal-octopus-hyper-v1.webp'}},
 {id:'stonefish',name:'Stonefish',prints:{light:'animal-stonefish-v1.webp',hyper:'animal-stonefish-hyper-v1.webp'}},
 {id:'lionfish',name:'Lionfish',prints:{light:'animal-lionfish-v1.webp',hyper:'animal-lionfish-hyper-v1.webp'}},
 {id:'conesnail',name:'Cone snail',prints:{light:'animal-conesnail-v1.webp',hyper:'animal-conesnail-hyper-v1.webp'}},
 {id:'seasnake',name:'Sea snake',prints:{light:'animal-seasnake-v1.webp',hyper:'animal-seasnake-hyper-v1.webp'}},
 {id:'stingray',name:'Stingray',prints:{light:'animal-stingray-v1.webp',hyper:'animal-stingray-hyper-v1.webp'}},
 {id:'moray',name:'Moray eel',prints:{light:'animal-moray-v1.webp',hyper:'animal-moray-hyper-v1.webp'}},
 {id:'bluedragon',name:'Blue dragon',prints:{light:'animal-bluedragon-v1.webp',hyper:'animal-bluedragon-hyper-v1.webp'}},
 {id:'irukandji',name:'Irukandji',prints:{light:'animal-irukandji-v1.webp',hyper:'animal-irukandji-hyper-v1.webp'}},
 {id:'toadfish',name:'Smooth toadfish',prints:{light:'animal-toadfish-v1.webp',hyper:'animal-toadfish-hyper-v1.webp'}},
 {id:'seaurchin',name:'Shortspined urchin',prints:{light:'animal-seaurchin-v1.webp',hyper:'animal-seaurchin-hyper-v1.webp'}},
].map(Object.freeze));
export const animalById=id=>ANIMALS.find(animal=>animal.id===id)||null;
export function animalPrint(id,mode='light',collection='muted'){
 return animalById(id)?'animal-'+id+'-'+inkPaletteId(mode,collection)+'-v1.webp':null;
}
