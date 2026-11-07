import {installLandingAccents} from './landing-scenes.js';
import {createConditionsPanel} from './coastal-conditions.js';
import {createBrandWordmark} from './brand.js';
import {applySavedTheme} from './theme.js';
import {visualPalette,applyPaletteVariables} from './visual-language.js';
import {installFeatureDemos} from './feature-demos.js';
import {applySavedAnimal} from './animal-theme.js';
applySavedTheme();applySavedAnimal();installLandingAccents();
document.getElementById('landing-signature').append(createBrandWordmark({width:440,label:'FinFolk — Slow melt wordmark'}));
const coasts=[{id:'bondi',name:'Bondi Beach',point:[151.278267,-33.891157]},{id:'portsea',name:'Portsea Beach',point:[144.713816,-38.318983]},{id:'brighton',name:'Brighton Beach',point:[144.986083,-37.917297]}];
const coast=document.getElementById('landing-coast');
function renderCoast(){const beach=coasts.find(b=>b.id===coast.value)||coasts[0];document.getElementById('landing-conditions-panel').replaceChildren(createConditionsPanel(beach));document.getElementById('landing-coast-open').href=new URL('./?view=maps&site='+beach.id,location.href).href;}
coast.onchange=renderCoast;renderCoast();
const themePicker=document.getElementById('landing-theme');
function syncThemePicker(){themePicker.value=visualPalette(document.documentElement.dataset.theme).id;}
syncThemePicker();document.addEventListener('finfolk:appearance',syncThemePicker);
themePicker.onchange=()=>{
 const choice=visualPalette(themePicker.value);document.documentElement.dataset.theme=choice.id;applyPaletteVariables(choice);
 document.dispatchEvent(new Event('finfolk:appearance'));
 let persisted=true;try{localStorage.setItem('finfolk-theme',choice.id);}catch{persisted=false;}
 document.getElementById('landing-theme-status').textContent=choice.name+' theme applied'+(persisted?'.':' for this visit.');
};
export const landingDemos=installFeatureDemos();
