import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {ANIMALS,animalPrint} from '../web/animal-prints.js';
import {applySavedAnimal,animalSettings,selectedAnimal,applyAnimalAppearance} from '../web/animal-theme.js';
import {applySavedTheme,themeSettings} from '../web/theme.js';
const window=new Window({url:'https://finfolk.test/?view=settings',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
window.document.write(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
for(const key of ['document','localStorage'])globalThis[key]=window[key];
try{
 const root=document.documentElement;
 localStorage.setItem('finfolk-theme','sand');applySavedTheme();
 assert.equal(applySavedAnimal(),'default');
 const host=document.getElementById('settings-appearance');host.append(themeSettings(),animalSettings());
 assert.equal(document.querySelectorAll('[name=animal]').length,15);
 const octopus=document.querySelector('[name=animal][value=octopus]');octopus.checked=true;octopus.dispatchEvent(new window.Event('change'));
 assert.equal(selectedAnimal(),'octopus');assert.equal(root.dataset.animal,'octopus');assert.equal(localStorage.getItem('finfolk-animal'),'octopus');assert.equal(root.dataset.theme,'navy','Animal changes preserve the colour theme');
 assert.ok(root.style.getPropertyValue('--finfolk-animal-print').includes('animal-octopus-muted-dark-v1.webp'),'Selected animal uses its generated artwork');
 assert.equal(root.dataset.animalArt,'ready');
 assert.equal(document.querySelectorAll('.animal-choice img').length,13,'Every animal has an artwork preview');
 assert.ok(!document.querySelector('.animal-settings').textContent.includes('coming soon'));
 root.dataset.animal='none';applySavedAnimal();assert.equal(root.dataset.animal,'octopus','Selection survives a fresh restore');
 const night=document.querySelector('[name=theme][value=navy]');night.checked=true;night.dispatchEvent(new window.Event('change'));assert.equal(root.dataset.animal,'octopus');assert.equal(root.dataset.theme,'navy');
 const acid=document.querySelector('[name=theme][value=yellow]');acid.checked=true;acid.dispatchEvent(new window.Event('change'));assert.equal(root.dataset.animal,'octopus');assert.ok(root.style.getPropertyValue('--finfolk-animal-print').includes('animal-octopus-acid-light-v1.webp'));assert.ok([...document.querySelectorAll('.animal-choice img')].every(img=>img.src.includes('-acid-light-v1.webp')),'Hyper theme updates all picker previews');
 for(const [theme,palette] of [['cobalt','acid-dark'],['navy-light','muted-light'],['navy','muted-dark'],['yellow','acid-light']]){const choice=document.querySelector('[name=theme][value='+theme+']');choice.checked=true;choice.dispatchEvent(new window.Event('change'));assert.equal(selectedAnimal(),'octopus');assert.ok(root.style.getPropertyValue('--finfolk-animal-print').includes('-'+palette+'-v1.webp'));assert.ok([...document.querySelectorAll('.animal-choice img')].every(img=>img.src.includes('-'+palette+'-v1.webp')));}
 const quiet=document.querySelector('[name=animal][value=none]');quiet.checked=true;quiet.dispatchEvent(new window.Event('change'));assert.equal(root.dataset.animal,'none');assert.equal(root.style.getPropertyValue('--finfolk-animal-print'),'none');
 localStorage.setItem('finfolk-animal','unrecognised');assert.equal(applySavedAnimal(),'default');assert.ok(root.style.getPropertyValue('--finfolk-animal-print').includes('animal-octopus-acid-light-v1.webp'));
 localStorage.setItem('finfolk-animal','lionfish');assert.equal(applySavedAnimal(),'lionfish');
 for(const animal of ANIMALS){
  const filename=animalPrint(animal.id);assert.ok(filename.endsWith('.webp'));assert.notEqual(animalPrint(animal.id,'dark'),filename,'Dark themes use their own ink colourway');
  const bytes=await readFile(new URL('../web/'+filename,import.meta.url));assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length<750_000,'Prints are optimized for the site');
  const hyper=animalPrint(animal.id,'light','hyper');assert.ok(hyper.includes('-acid-light-v1.webp'));assert.ok((await readFile(new URL('../web/'+hyper,import.meta.url))).length<750_000);
 }
 assert.equal(animalPrint('unknown'),null);
 const storage=globalThis.localStorage;Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Blocked');}});
 try{const snail=document.querySelector('[name=animal][value=conesnail]');snail.checked=true;snail.dispatchEvent(new window.Event('change'));assert.equal(selectedAnimal(),'conesnail');assert.ok(document.querySelector('.animal-settings [role=status]').textContent.includes('for this visit'));applyAnimalAppearance();assert.equal(root.dataset.animal,'conesnail');}
 finally{Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});}
 console.log('Animal themes passed: independent palette, saved selection, quiet/default modes, blocked storage and generated-art readiness.');
}finally{await window.happyDOM.close();}
