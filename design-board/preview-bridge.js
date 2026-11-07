import {compileTheme} from './theme-engine.mjs';
import {prepareScreen} from './preview-screens.js';
import {installProfilePreviewLinks} from './profile-preview-links.js';
import {animalPrint} from '../web/animal-prints.js';
import {refreshAnimalDecorations} from '../web/animal-decoration.js';
import {inkPaletteId,themeForInkPalette} from '../web/ink-palettes.js';
import {PALETTE_OVERRIDES} from '../web/visual-language.js';
// Embedded design previews must remain visible when the browser pauses entrance animations.
const previewState=document.createElement('style');previewState.textContent='#discover-page:not([hidden]),#areas-page:not([hidden]),.beach-overview,.data-panel,.system-panel{animation:none!important}';document.head.append(previewState);
const style=document.createElement('style');style.id='finfolk-moodboard-preview';document.head.append(style);
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||parent===window||event.data?.type!=='finfolk:theme')return;
 try{const css=compileTheme(event.data.theme);for(const name of PALETTE_OVERRIDES)document.documentElement.style.removeProperty(name);document.documentElement.dataset.theme=themeForInkPalette(inkPaletteId(event.data.theme));for(const link of document.querySelectorAll('link[rel=stylesheet]'))if(/\/atelier-theme(?:\.[a-f0-9]+)?\.css$/.test(new URL(link.href,location.href).pathname))link.disabled=true;style.textContent=css;document.dispatchEvent(new Event('finfolk:appearance'));
  const animal=event.data.animal,asset=animalPrint(animal,event.data.theme,event.data.theme.collection);
  if(animal==='none'||asset){document.documentElement.dataset.animal=animal;document.documentElement.style.setProperty('--finfolk-animal-print',asset?`url('/preview/${asset}')`:'none');refreshAnimalDecorations();}
  parent.postMessage({type:'finfolk:theme-applied'},location.origin);
 }catch(error){parent.postMessage({type:'finfolk:theme-error',message:error.message},location.origin);}
});
if(parent!==window)parent.postMessage({type:'finfolk:ready'},location.origin);
prepareScreen();
installProfilePreviewLinks();

// Visitors enter account creation/sign-in before post-verification setup.
for(const selector of ['.landing-actions .landing-primary','.landing-last .landing-primary']){const a=document.querySelector(selector);if(a){a.href='/preview/?view=account&atelier-screen=signin';a.textContent='Get started →';}}
