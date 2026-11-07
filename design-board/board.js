import {DESIGN_SECTIONS,installAtelierNavigation} from './atelier-navigation.js';
import {installWorkflowReview} from './workflow-review.js';
import {refreshStateMotifGallery} from './state-motif-gallery.js';
import {PRESETS,DISPLAY_FONTS,BODY_FONTS,validateTheme,compileTheme,printBackground,printAvailable,contrastRatio} from './theme-engine.mjs';
import {ANIMALS,animalPrint} from '../web/animal-prints.js';
import {SCREENS,screenById,screenURL} from './screens.mjs';
import {installLogoBoard} from './logo-board.js';
import {installVisualShell} from './visual-shell.js';
import {paletteTheme,VISUAL_PALETTES} from '../web/visual-language.js';
import {createBrandMark} from '../web/brand.js';
import {installDesignStudies} from './design-studies.js';
const $=id=>document.getElementById(id),clone=value=>JSON.parse(JSON.stringify(value)),draftKey='finfolk:atelier:draft:v1',moodsKey='finfolk:atelier:moods:v1';
let theme=paletteTheme(clone(PRESETS.couture),'yellow'),installed=clone(PRESETS.original),token='',page='landing',device='phone',workspace='preview',savedMoods=[],references=[],imageURLs=[],dirty=true,busy=false,dbPromise;
function storageRead(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function setStatus(message,error=false){$('status').textContent=message;$('status').dataset.error=String(error);}
function persistDraft(){try{localStorage.setItem(draftKey,JSON.stringify({theme,notes:$('notes').value}));}catch{setStatus('Draft is kept for this visit; browser storage is unavailable.',true);}}
function imageBackground(t){return printBackground(t);}
function postTheme(){const frame=$('preview');frame.contentWindow?.postMessage({type:'finfolk:theme',theme},location.origin);}
function markEdited(){theme.enabled=true;theme.name=$('mood-name').value.trim()||'My FinFolk';dirty=true;render();persistDraft();}
function setTheme(value,{persist=true}={}){theme=validateTheme(value);dirty=JSON.stringify(theme)!==JSON.stringify(installed);render();if(persist)persistDraft();}
function render(){
 for(const key of ['displayFont','bodyFont','headingScale','radius','shadow','spacing','material','motif','printStyle','printPlacement','collection','motifScale','ornament','logo','label'])$(key).value=String(theme[key]);
 for(const key of ['italic','lowercase'])$(key).checked=theme[key];
 $('mood-name').value=theme.name;
 for(const key of Object.keys(theme.palette))for(const input of document.querySelectorAll(`[data-colour="${key}"]`))input.value=theme.palette[key];
 for(const key of ['headingScale','radius','shadow','spacing','motifScale','ornament'])$(key+'-value').value=['headingScale','spacing','motifScale','ornament'].includes(key)?Math.round(theme[key]*100)+'%':theme[key]+' px';
 const ratio=contrastRatio(theme.palette.paper,theme.palette.ink);$('contrast').value=ratio.toFixed(1)+':1'+(ratio>=4.5?' · clear':' · low contrast');$('contrast').dataset.good=String(ratio>=4.5);
 for(const button of document.querySelectorAll('[data-preset]'))button.setAttribute('aria-pressed',String(theme.name===PRESETS[button.dataset.preset].name));
 for(const button of document.querySelectorAll('[data-world-preset]'))button.setAttribute('aria-pressed',String(theme.name===VISUAL_PALETTES.find(p=>p.id===button.dataset.worldPreset)?.name));
 $('preview-label').textContent=theme.name;$('save-state').textContent=dirty?'Draft · not applied':'Saved to local FinFolk';
 $('mood-sheet-name').textContent=theme.name;
 const sheet=document.querySelector('.mood-sheet');sheet.style.setProperty('--mood-paper',theme.palette.paper);sheet.style.setProperty('--mood-ink',theme.palette.ink);
 $('type-proof').style.fontFamily=DISPLAY_FONTS[theme.displayFont];$('type-proof').style.fontStyle=theme.italic?'italic':'normal';sheet.querySelector('.type-proof p').style.fontFamily=BODY_FONTS[theme.bodyFont];
 $('motif-proof').style.backgroundImage=imageBackground(theme);$('motif-proof').textContent=printAvailable(theme)?'':theme.motif==='none'?'A quiet moment · no animal print':'Artwork unavailable';$('motif-proof').style.backgroundSize=`${320*theme.motifScale}px ${320*theme.motifScale}px`;$('motif-proof').style.opacity='1';$('motif-proof').style.filter=theme.printStyle==='tonal'?'grayscale(1)':'none';
 for(const button of document.querySelectorAll('[data-print-animal]')){button.setAttribute('aria-pressed',String(button.dataset.printAnimal===theme.motif));button.querySelector('img').src='/preview/'+animalPrint(button.dataset.printAnimal,theme,theme.collection);}
 const motifAsset=animalPrint(theme.motif,theme,theme.collection);$('motif-master').hidden=!motifAsset;$('motif-print').hidden=!motifAsset;if(motifAsset){$('motif-master').href='/board/assets/ink-masters/motifs/animal-'+theme.motif+'/master.zip';$('motif-master').download='finfolk-'+theme.motif+'-master.zip';$('motif-print').href='/preview/'+motifAsset;$('motif-print').download=motifAsset;}
 $('swatch-proof').replaceChildren(...Object.entries(theme.palette).map(([name,colour])=>{const item=document.createElement('div');item.className='swatch';const tile=document.createElement('div');tile.className='swatch-colour';tile.style.background=colour;const caption=document.createElement('span');caption.textContent=name+' '+colour;item.append(tile,caption);return item;}));
 document.documentElement.style.setProperty('--finfolk-animal-print',imageBackground(theme));document.documentElement.style.setProperty('--finfolk-print-collection',theme.collection);refreshStateMotifGallery(theme.collection,theme.motif==='none',theme);
 postTheme();workflowReview?.refreshTheme();
}
installVisualShell({onChange:palette=>{setTheme(paletteTheme(theme,palette.id));setStatus(palette.name+' is framing the Atelier and live preview.');}});
for(const choice of VISUAL_PALETTES){const button=document.createElement('button');button.type='button';button.className='preset';button.dataset.worldPreset=choice.id;const art=document.createElement('span');art.className='preset-art world-preset-art';art.style.background=choice.palette.paper;art.style.color=choice.palette.ink;art.append(createBrandMark({size:52}));const label=document.createElement('span');label.className='preset-name';label.textContent=choice.name;button.append(art,label);button.onclick=()=>document.querySelector(`[data-shell-palette="${choice.id}"]`).click();document.getElementById('world-presets').append(button);}
const collection=document.createElement('section');collection.className='print-collection';
const collectionHeading=document.createElement('h2');collectionHeading.textContent='The Nasties collection';
const collectionCopy=document.createElement('p');collectionCopy.textContent='Thirteen curious creatures in muted inks or hyper colour, developed with ChatGPT image generation. Choose an animal to try its print.';
const motifDownloads=document.createElement('div');motifDownloads.className='print-collection-downloads';for(const [id,label] of [['motif-master','Save selected motif master'],['motif-print','Download selected print']]){const link=document.createElement('a');link.id=id;link.textContent=label;link.setAttribute('download','');motifDownloads.append(link);}
const collectionGrid=document.createElement('div');collectionGrid.className='print-collection-grid';
for(const animal of ANIMALS){
 const asset=animalPrint(animal.id);if(!asset)continue;
 const button=document.createElement('button');button.type='button';button.dataset.printAnimal=animal.id;button.setAttribute('aria-pressed','false');
 const image=document.createElement('img');image.src='/preview/'+asset;image.alt='';image.loading='lazy';image.width=1024;image.height=1024;
 const name=document.createElement('span');name.textContent=animal.name;button.append(image,name);
 button.onclick=()=>{theme.motif=animal.id;theme.printStyle='two-tone';if(theme.ornament===0)theme.ornament=.18;markEdited();setStatus(animal.name+' print is previewing.');};collectionGrid.append(button);
}
collection.append(collectionHeading,collectionCopy,motifDownloads,collectionGrid);$('swatch-proof').after(collection);
for(const [id,preset] of Object.entries(PRESETS)){
 const button=document.createElement('button');button.type='button';button.className='preset';button.dataset.preset=id;button.setAttribute('aria-pressed','false');
 const art=document.createElement('span');art.className='preset-art';art.style.setProperty('--mood-paper',preset.palette.paper);art.style.setProperty('--mood-ink',preset.palette.ink);art.style.backgroundImage=imageBackground(preset);
 const name=document.createElement('span');name.className='preset-name';name.textContent=preset.name;const family=document.createElement('small');family.textContent=preset.collection==='hyper'?'Hyper':'Muted';family.className='preset-family';name.append(family);button.append(art,name);button.onclick=()=>{setTheme(clone(preset));setStatus(preset.name+' is previewing. Save when it feels right.');};$('presets').append(button);
}
for(const [key,label] of Object.entries({paper:'Background',surface:'Surfaces',ink:'Ink & type',accent:'Accent',muted:'Secondary text'})){
 const row=document.createElement('div');row.className='colour-row';const colour=document.createElement('input');colour.type='color';colour.dataset.colour=key;colour.setAttribute('aria-label',label+' colour');
 const text=document.createElement('label');text.textContent=label;text.htmlFor='colour-'+key;colour.id='colour-'+key;
 const hex=document.createElement('input');hex.type='text';hex.maxLength=7;hex.dataset.colour=key;hex.setAttribute('aria-label',label+' hex value');
 colour.oninput=()=>{theme.palette[key]=colour.value;markEdited();};hex.onchange=()=>{if(!/^#[0-9a-f]{6}$/i.test(hex.value)){setStatus('Use a hex colour such as #293e37.',true);hex.value=theme.palette[key];return;}theme.palette[key]=hex.value.toLowerCase();markEdited();};row.append(colour,text,hex);$('palette').append(row);
}
for(const key of ['displayFont','bodyFont','material','motif','printStyle','printPlacement','collection','logo'])$(key).onchange=()=>{theme[key]=$(key).value;markEdited();};
for(const key of ['headingScale','radius','shadow','spacing','motifScale','ornament'])$(key).oninput=()=>{theme[key]=Number($(key).value);markEdited();};
for(const key of ['italic','lowercase'])$(key).onchange=()=>{theme[key]=$(key).checked;markEdited();};
$('label').oninput=()=>{theme.label=$('label').value;markEdited();};
$('mood-name').onchange=()=>{theme.name=$('mood-name').value.trim()||'My FinFolk';dirty=true;render();persistDraft();};
$('notes').oninput=persistDraft;
function navigatePreview(){
 const screen=screenById(page),index=SCREENS.indexOf(screen);page=screen.id;
 if($('preview').getAttribute('src')!==screenURL(page))$('preview').src=screenURL(page);$('open-site').href=screenURL(page);$('screen-select').value=page;
 $('screen-name').textContent=screen.name;$('screen-description').textContent=screen.description;
 $('screen-count').textContent=String(index+1).padStart(2,'0')+' / '+SCREENS.length;
 $('screen-data').textContent=screen.sample?'Local sample member data':'Bundled beach directory';
 for(const button of document.querySelectorAll('[data-screen]'))button.setAttribute('aria-pressed',String(button.dataset.screen===page));
}
for(const group of [...new Set(SCREENS.map(screen=>screen.section))]){
 const options=document.createElement('optgroup');options.label=group;
 for(const screen of SCREENS.filter(screen=>screen.section===group)){const option=document.createElement('option');option.value=screen.id;option.textContent=screen.name;options.append(option);}
 $('screen-select').append(options);
}
for(const screen of SCREENS){
 const button=document.createElement('button');button.type='button';button.className='screen-card';button.dataset.screen=screen.id;button.setAttribute('aria-pressed','false');
 const category=document.createElement('small');category.textContent=screen.section+' / '+screen.group;
 const name=document.createElement('strong');name.textContent=screen.name;
 const description=document.createElement('span');description.textContent=screen.description;
 const action=document.createElement('span');action.className='screen-card-action';action.textContent='Open actual screen ↗';
 button.append(category,name,description,action);button.onclick=()=>{goToPreview(screen.id);};$('screen-grid').append(button);
}
const screenFilters=document.createElement('div');screenFilters.className='product-screen-filters';
const screenSearch=document.createElement('input');screenSearch.type='search';screenSearch.placeholder='Find a product screen…';screenSearch.setAttribute('aria-label','Search product screens');screenFilters.append(screenSearch);
const sectionFilters=document.createElement('div');sectionFilters.setAttribute('role','group');sectionFilters.setAttribute('aria-label','Product sections');screenFilters.append(sectionFilters);
let selectedSection='All';const filterButtons=[];
function filterScreens(){let count=0;const query=screenSearch.value.trim().toLowerCase();for(const card of $('screen-grid').querySelectorAll('[data-screen]')){const screen=screenById(card.dataset.screen),show=(selectedSection==='All'||screen.section===selectedSection)&&(!query||[screen.name,screen.description,screen.group,screen.section].join(' ').toLowerCase().includes(query));card.hidden=!show;if(show)count++;}screenCount.textContent=count+' screens';for(const b of filterButtons)b.setAttribute('aria-pressed',String(b.textContent===selectedSection));}
for(const section of ['All','Explore','Community','Dives','You']){const b=document.createElement('button');b.type='button';b.textContent=section;b.onclick=()=>{selectedSection=section;filterScreens();};sectionFilters.append(b);filterButtons.push(b);}
const screenCount=document.createElement('p');screenCount.className='product-screen-count';screenCount.setAttribute('role','status');screenFilters.append(screenCount);$('screen-grid').before(screenFilters);screenSearch.oninput=filterScreens;filterScreens();
$('screen-select').onchange=()=>goToPreview($('screen-select').value);
for(const [id,offset] of [['screen-prev',-1],['screen-next',1]])$(id).onclick=()=>{goToPreview(SCREENS[(SCREENS.indexOf(screenById(page))+offset+SCREENS.length)%SCREENS.length].id);};
navigatePreview();
$('device-frame').classList.add('phone');
for(const button of document.querySelectorAll('[data-device]'))button.setAttribute('aria-pressed',String(button.dataset.device===device));
for(const button of document.querySelectorAll('[data-device]'))button.onclick=()=>{device=button.dataset.device;$('device-frame').classList.toggle('phone',device==='phone');for(const other of document.querySelectorAll('[data-device]'))other.setAttribute('aria-pressed',String(other===button));};
const workflowReview=installWorkflowReview({host:$('workflows-workspace'),getTheme:()=>theme});
$('workflows-tab').onclick=()=>goTo('workflows');
function setWorkspace(value){const changed=workspace!==value;workspace=value;for(const [id,mode] of [['workflows-workspace','workflows'],['preview-workspace','preview'],['board-workspace','board'],['screens-workspace','screens'],['logos-workspace','logos'],['studies-workspace','studies']])$(id).hidden=workspace!==mode;$('page-controls').hidden=workspace!=='preview';for(const [id,mode] of [['workflows-tab','workflows'],['preview-tab','preview'],['board-tab','board'],['screens-tab','screens'],['logos-tab','logos'],['studies-tab','studies']])$(id).setAttribute('aria-pressed',String(workspace===mode));if(changed)document.querySelector('.canvas').scrollTop=0;}
$('preview-tab').onclick=()=>goTo('preview');$('board-tab').onclick=()=>goTo('board');$('screens-tab').onclick=()=>goTo('screens');$('logos-tab').onclick=()=>goTo('logos');
$('studies-tab').onclick=()=>goTo('studies');
installDesignStudies({onStatus:setStatus,onPreview:direction=>{const related=clone(PRESETS[direction.preset]||PRESETS.couture);related.motif='octopus';related.radius=24;related.printStyle='two-tone';setTheme(related);goToPreview('landing');setStatus(direction.name+' related colours are previewing on the current live UI.');}});
const logoBoard=installLogoBoard({onStatus:setStatus});
const atelierNavigation=installAtelierNavigation($('atelier-navigation'));
// Navigation writes history; applying a route only renders it.
function goTo(hash){
 if(hash==='preview')hash='preview/'+page;
 if(hash==='studies')hash='designs';
 if(location.hash==='#'+hash){applyRoute();return;}
 location.hash=hash;
 applyRoute();
}
function goToPreview(id){goTo('preview/'+id);}
function applyRoute(){
 atelierNavigation.update();
 const hash=location.hash.slice(1);
 if(hash==='preview'||hash.startsWith('preview/')){
  const id=hash.slice(8),valid=SCREENS.some(screen=>screen.id===id);
  page=valid?id:'landing';
  if(!valid)window.history.replaceState(null,'',location.pathname+location.search+'#preview/landing');
  setWorkspace('preview');navigatePreview();atelierNavigation.update();return;
 }
 if(hash==='board'||hash==='screens'){setWorkspace(hash);return;}
 if(hash==='workflows'||hash.startsWith('workflows/')){setWorkspace('workflows');workflowReview.open();return;}
 const design=DESIGN_SECTIONS.find(([route])=>route===hash);
 if(hash==='designs'||design){
  setWorkspace('studies');
  if(design)window.requestAnimationFrame(()=>$(design[2]).scrollIntoView({block:'start'}));
  return;
 }
 if(['logos','fins','club','lava','logos/shortlist'].includes(hash)){
  setWorkspace('logos');logoBoard.selectFilter(hash==='logos'?'all':hash==='logos/shortlist'?'shortlist':hash);return;
 }
 page='landing';setWorkspace('preview');navigatePreview();
 window.history.replaceState(null,'',location.pathname+location.search+'#preview/landing');atelierNavigation.update();
}
applyRoute();
window.addEventListener('hashchange',applyRoute);
window.addEventListener('popstate',applyRoute);
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('preview').contentWindow&&event.source!==workflowReview.frame.contentWindow)return;if(event.data?.type==='finfolk:ready'){postTheme();workflowReview.refreshTheme();}if(event.data?.type==='finfolk:theme-error')setStatus(event.data.message,true);});
$('preview').onload=postTheme;
function renderMoods(){
 $('saved-moods').replaceChildren();for(const mood of savedMoods){const row=document.createElement('div');row.className='saved-mood';const open=document.createElement('button');open.textContent=mood.name;open.onclick=()=>{setTheme(mood.theme);setStatus(mood.name+' loaded into the preview.');};const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Remove '+mood.name);remove.onclick=()=>{savedMoods=savedMoods.filter(item=>item.id!==mood.id);try{localStorage.setItem(moodsKey,JSON.stringify(savedMoods));}catch{}renderMoods();};row.append(open,remove);$('saved-moods').append(row);}
}
$('save-mood').onclick=()=>{
 const name=$('mood-name').value.trim()||'My FinFolk';theme.name=name;
 const entry={id:crypto.randomUUID(),name,theme:validateTheme(theme)},prior=savedMoods.findIndex(mood=>mood.name===name);
 if(prior>=0)savedMoods[prior]=entry;else savedMoods.push(entry);
 try{localStorage.setItem(moodsKey,JSON.stringify(savedMoods));setStatus(name+' saved in this browser.');}catch{setStatus('Browser storage is full. Export the theme to keep it.',true);}renderMoods();render();persistDraft();
};
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-json').onclick=()=>download('finfolk-theme.json',JSON.stringify(validateTheme(theme),null,2),'application/json');
$('export-css').onclick=()=>download('finfolk-theme.css',compileTheme(theme),'text/css');
$('import-theme').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>65536)throw Error('Theme files must be smaller than 64 KB.');setTheme(validateTheme(JSON.parse(await file.text())));setStatus('Imported theme is previewing.');}catch(error){setStatus(error.message,true);}finally{event.target.value='';}};
async function writeLocal(action){
 if(busy)return;const restoreEnabled=!$('restore').disabled;busy=true;$('apply').disabled=true;$('restore').disabled=true;
 try{const response=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Moodboard-Token':token},body:JSON.stringify(action==='apply'?{theme:validateTheme(theme)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save theme.');installed=validateTheme(result.theme);setTheme(installed);$('restore').disabled=!result.canRestore;setStatus(action==='apply'?'Saved to this local FinFolk checkout.':'Previous local theme restored.');}
 catch(error){setStatus(error.message,true);$('restore').disabled=!restoreEnabled;}
 finally{busy=false;$('apply').disabled=!token;}
}
$('apply').onclick=()=>writeLocal('apply');$('restore').onclick=()=>writeLocal('restore');$('use-saved').onclick=()=>{setTheme(installed);setStatus('Previewing the theme saved in this checkout.');};
function database(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open('finfolk-atelier-references',1);request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return dbPromise;}
async function imageStore(method,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('images',method==='getAll'?'readonly':'readwrite'),request=tx.objectStore('images')[method](...(value===undefined?[]:[value]));let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}
function renderReferences(){for(const url of imageURLs)URL.revokeObjectURL(url);imageURLs=[];$('references').replaceChildren();for(const image of [{id:'provided-reference',name:'FinFolk Nasties · your original reference',url:'/board/assets/finfolk-nasties-reference.png',builtin:true},...references]){const figure=document.createElement('figure');figure.className='reference-image';const img=document.createElement('img');img.alt=image.name;const url=image.url||URL.createObjectURL(image.blob);if(!image.url)imageURLs.push(url);img.src=url;const caption=document.createElement('figcaption');caption.textContent=image.name;const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Remove reference '+image.name);remove.onclick=async()=>{references=references.filter(item=>item.id!==image.id);renderReferences();try{await imageStore('delete',image.id);}catch{setStatus('Reference removed for this visit; image storage is unavailable.',true);}};if(image.builtin){figure.classList.add('provided-reference');const link=document.createElement('a');link.href=image.url;link.target='_blank';link.rel='noopener';link.textContent='Open original ↗';caption.append(document.createTextNode(' · '),link);figure.append(img,caption);}else figure.append(img,caption,remove);$('references').append(figure);}}
async function addImages(files){
 for(const file of files){if(references.length>=6){setStatus('The board holds six references. Remove one to add another.',true);break;}if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>4*1024**2){setStatus('Choose a JPG, PNG or WebP image smaller than 4 MB.',true);continue;}const image={id:crypto.randomUUID(),name:file.name,blob:file};references.push(image);renderReferences();try{await imageStore('put',image);setStatus('Reference pinned on this browser.');}catch{setStatus('Reference is available for this visit; persistent image storage is unavailable.',true);}}
}
$('reference-files').onchange=async event=>{await addImages([...event.target.files]);event.target.value='';};
const drop=$('drop-target');for(const name of ['dragenter','dragover'])drop.addEventListener(name,event=>{event.preventDefault();drop.classList.add('dragging');});for(const name of ['dragleave','drop'])drop.addEventListener(name,event=>{event.preventDefault();drop.classList.remove('dragging');});drop.addEventListener('drop',event=>addImages([...event.dataTransfer.files]));
try{const draft=storageRead(draftKey,null);if(draft?.theme)theme=validateTheme(draft.theme);$('notes').value=typeof draft?.notes==='string'?draft.notes:'';savedMoods=storageRead(moodsKey,[]).filter(mood=>{try{return !!validateTheme(mood.theme);}catch{return false;}});}catch{}
render();renderMoods();$('apply').disabled=true;
try{const response=await fetch('/api/bootstrap',{cache:'no-store'});if(!response.ok)throw Error('Local server is unavailable.');const state=await response.json();token=state.token;installed=validateTheme(state.theme);$('restore').disabled=!state.canRestore;$('project-label').textContent=state.project;$('project-label').title=state.project;$('apply').disabled=false;dirty=JSON.stringify(theme)!==JSON.stringify(installed);render();setStatus('Preview changes are live. Save when you want to apply them to this checkout.');}catch(error){setStatus(error.message+' Exports still work.',true);}
try{references=await imageStore('getAll');renderReferences();}catch{}
