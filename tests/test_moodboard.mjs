import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
import {PRESETS,validateTheme,compileTheme,contrastRatio,printBackground,printAvailable} from '../design-board/theme-engine.mjs';
import {transform} from 'esbuild';
import {SCREENS,screenURL,TRIP_ID} from '../design-board/screens.mjs';
import {LOGO_DIRECTIONS} from '../design-board/logo-directions.mjs';
import {FIN_STUDIES} from '../design-board/fin-studies.mjs';
import {CLUB_STUDIES} from '../design-board/club-studies.mjs';
import {LAVA_STUDIES} from '../design-board/lava-studies.mjs';
const clone=value=>structuredClone(value);

test('themes preserve the original, reject unsafe input and compile valid local CSS',async()=>{
 assert.ok(compileTheme(PRESETS.original).includes('inactive'));
 assert.equal(contrastRatio('#000000','#ffffff'),21);
 for(const preset of Object.values(PRESETS)){
  assert.deepEqual(validateTheme(preset),preset);assert.ok(contrastRatio(preset.palette.paper,preset.palette.ink)>4.5);
  const css=compileTheme(preset);assert.equal(/@import|https?:/.test(css),false);await transform(css,{loader:'css'});
 }
 for(const mutate of [t=>t.version=2,t=>t.palette.paper='red;display:none',t=>t.displayFont='url(https://example.test)',t=>t.radius=Infinity,t=>t.ornament=2,t=>t.motif='stripes',t=>t.label='line\nbreak',t=>t.extra='unexpected']){
  const invalid=clone(PRESETS.reverie);mutate(invalid);assert.throws(()=>validateTheme(invalid));
 }
 const quoted={...clone(PRESETS.reverie),label:'";body{display:none}/*'};
 const css=compileTheme(quoted);assert.ok(!css.includes('content:"";body'));await transform(css,{loader:'css'});
});

test('local server saves only validated themes, restores exact prior files and isolates the preview',async()=>{
 const root=await mkdtemp(join(tmpdir(),'finfolk-board-test-')),site=join(root,'site'),baseCSS='/* original fixture */\n';let server;
 try{
  for(const dir of ['web','config','design-board','site','private'])await mkdir(join(root,dir));
  await writeFile(join(root,'web/atelier-theme.css'),baseCSS);await writeFile(join(root,'design-board/index.html'),'<h1>Fixture mood board</h1>');
  await writeFile(join(root,'design-board/preview-client.js'),'/* local sample client */');
  await writeFile(join(site,'index.html'),'<html><head></head><body>Preview fixture</body></html>');
  await writeFile(join(root,'private/hidden.txt'),'Private fixture');await symlink(join(root,'private/hidden.txt'),join(root,'design-board/escape.txt'));
  server=createMoodboardServer({projectRoot:root,siteDirectory:site});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const bootstrap=await (await fetch(origin+'/api/bootstrap')).json();assert.deepEqual(bootstrap.theme,PRESETS.original);assert.equal(bootstrap.canRestore,false);
  const request=(path,body={},headers={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Moodboard-Token':bootstrap.token,...headers},body:JSON.stringify(body)});
  const pageResponse=await fetch(origin+'/');assert.equal(pageResponse.status,200);assert.equal(pageResponse.headers.get('referrer-policy'),'strict-origin-when-cross-origin','Cross-origin map tiles need an origin referrer');
  const html=await (await fetch(origin+'/preview/')).text();assert.ok(html.includes('/board/preview-bridge.js'));assert.ok(html.includes('finfolk:welcome'));
  const config=await (await fetch(origin+'/preview/neon-config.json')).json();assert.equal(config.enabled,true);assert.equal(config.apiUrl,origin+'/preview-api/');assert.equal(config.authUrl,origin+'/preview-api/auth');
  assert.ok((await (await fetch(origin+'/preview/neon-client.abcdef.js')).text()).includes('local sample client'));
  assert.equal((await (await fetch(origin+'/preview-api/trips/'+TRIP_ID)).json()).title,'Three days at the water’s edge');
  assert.equal((await fetch(origin+'/preview-api/unknown')).status,404);
  assert.equal((await fetch(origin+'/preview-api/trips',{method:'POST'})).status,405);
  assert.ok((await (await fetch(origin+'/preview/sw.js')).text()).includes('unregister'));
  assert.equal((await fetch(origin+'/board/escape.txt')).status,404);
  assert.equal((await fetch(origin+'/board/%2e%2e%2fprivate/hidden.txt')).status,404);
  assert.equal((await fetch(origin+'/missing')).status,404);
  assert.equal((await request('/api/restore')).status,404);
  assert.equal((await request('/api/apply',{theme:PRESETS.reverie},{Origin:'https://example.test'})).status,403);
  assert.equal((await request('/api/apply',{theme:PRESETS.reverie},{'X-Moodboard-Token':'wrong'})).status,403);
  assert.equal((await request('/api/apply',{theme:{...PRESETS.reverie,radius:999}})).status,400);
  assert.equal(await readFile(join(root,'web/atelier-theme.css'),'utf8'),baseCSS);
  assert.equal((await request('/api/apply',{junk:'x'.repeat(70000)})).status,413);
  const applied=await request('/api/apply',{theme:PRESETS.reverie});assert.equal(applied.status,200);assert.equal((await applied.json()).theme.name,'Tidal reverie');
  assert.equal(await readFile(join(root,'web/atelier-theme.css'),'utf8'),compileTheme(PRESETS.reverie));
  assert.equal((await (await fetch(origin+'/preview/atelier-theme.deadbeef.css')).text()),compileTheme(PRESETS.reverie));
  assert.equal((await (await fetch(origin+'/api/bootstrap')).json()).canRestore,true);
  const restored=await request('/api/restore');assert.equal(restored.status,200);assert.equal((await restored.json()).theme.enabled,false);
  assert.equal(await readFile(join(root,'web/atelier-theme.css'),'utf8'),baseCSS);
  await assert.rejects(readFile(join(root,'config/atelier-theme.json')),{code:'ENOENT'});
  assert.equal((await request('/api/restore')).status,200,'Restoring is itself reversible');
  assert.equal((await (await fetch(origin+'/api/bootstrap')).json()).theme.name,'Tidal reverie');
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(root,{recursive:true,force:true});}
});

test('board controls update the preview, save/restore, import/export, and retain image references',async()=>{
 const {Window}=await import('happy-dom'),{indexedDB}=await import('fake-indexeddb');
 const window=new Window({url:'http://127.0.0.1:8770/',settings:{disableIframePageLoading:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 window.document.write(await readFile(new URL('../design-board/index.html',import.meta.url),'utf8'));window.localStorage.setItem('finfolk:atelier:design-studies:v1',JSON.stringify({mark:'small-liquid-f',notes:{'small-liquid-f':'Keep my archived note.'}}));
 const keys=['window','document','location','localStorage','indexedDB','fetch'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const originalURL=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;let applied=clone(PRESETS.original),download;
 for(const key of ['window','document','location','localStorage'])Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true,writable:true});
 Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});
 Object.defineProperty(globalThis,'fetch',{value:async(path,options)=>{if(path==='/api/bootstrap')return Response.json({token:'fixture',theme:applied,canRestore:false,project:'Fixture checkout'});if(path==='/api/apply')applied=JSON.parse(options.body).theme;else if(path==='/api/restore')applied=clone(PRESETS.original);else throw Error('Unexpected request');return Response.json({theme:applied,canRestore:true});},configurable:true});
 URL.createObjectURL=blob=>{download=blob;return 'blob:fixture';};URL.revokeObjectURL=()=>{};
 const settle=()=>new Promise(resolve=>setTimeout(resolve,25));
 try{
  await import('../design-board/board.js');const $=id=>document.getElementById(id);
  assert.equal($('apply').disabled,false);assert.equal($('preview-label').textContent,'Acid Club');
  assert.equal(document.querySelectorAll('[data-screen]').length,SCREENS.length);
  $('screens-tab').click();assert.equal($('screens-workspace').hidden,false);
  document.querySelector('[data-screen=profile]').click();assert.equal($('preview-workspace').hidden,false);assert.equal($('screens-workspace').hidden,true);assert.ok($('preview').src.endsWith(screenURL('profile')));assert.equal($('screen-data').textContent,'Local sample member data');
  $('screen-select').value='settings';$('screen-select').dispatchEvent(new window.Event('change'));assert.ok($('preview').src.endsWith(screenURL('settings')));
  $('screen-next').click();assert.equal($('screen-select').value,SCREENS[0].id,'Screen navigation wraps');
  $('logos-tab').click();assert.equal($('logos-workspace').hidden,false);assert.equal(location.hash,'#logos');assert.equal(document.querySelectorAll('[data-logo-direction]').length,16);
  document.querySelector('[data-logo-filter=fins]').click();assert.equal(location.hash,'#fins');assert.equal([...document.querySelectorAll('[data-logo-direction]')].filter(card=>!card.hidden).length,3);assert.equal($('logo-level-guide').hidden,false);
  location.hash='#logos';window.dispatchEvent(new window.Event('hashchange'));assert.equal(document.querySelector('[data-logo-filter=all]').getAttribute('aria-pressed'),'true');
  location.hash='#fins';window.dispatchEvent(new window.Event('hashchange'));assert.equal($('logos-workspace').hidden,false);assert.equal(location.hash,'#fins');assert.equal([...document.querySelectorAll('[data-logo-direction]')].filter(card=>!card.hidden).length,3);
  document.querySelector('[data-logo-filter=club]').click();assert.equal(location.hash,'#club');assert.equal([...document.querySelectorAll('[data-logo-direction]')].filter(card=>!card.hidden).length,7);assert.equal($('logo-club-guide').hidden,false);assert.equal($('logo-level-guide').hidden,true);
  location.hash='#club';window.dispatchEvent(new window.Event('hashchange'));assert.equal(document.querySelector('[data-logo-filter=club]').getAttribute('aria-pressed'),'true');
  document.querySelector('[data-logo-filter=lava]').click();assert.equal(location.hash,'#lava');assert.equal([...document.querySelectorAll('[data-logo-direction]')].filter(card=>!card.hidden).length,3);assert.equal($('logo-lava-guide').hidden,false);assert.equal($('logo-club-guide').hidden,true);
  location.hash='#lava';window.dispatchEvent(new window.Event('hashchange'));assert.equal(document.querySelector('[data-logo-filter=lava]').getAttribute('aria-pressed'),'true');
  document.querySelector('[data-logo-filter=all]').click();
  document.querySelector('[data-logo-shortlist=curious-f]').click();assert.equal($('logo-shortlist-count').textContent,'1 shortlisted');
  const logoNotes=document.querySelector('[aria-label="Notes for Curious creature"]');logoNotes.value='Keep the odd little eye.';logoNotes.dispatchEvent(new window.Event('input'));
  document.querySelector('[data-logo-filter=shortlist]').click();assert.equal([...document.querySelectorAll('[data-logo-direction]')].filter(card=>!card.hidden).length,1);
  $('logo-export').click();const logoBrief=JSON.parse(await download.text());assert.equal(logoBrief.directions.find(d=>d.id==='curious-f').notes,'Keep the odd little eye.');assert.equal(logoBrief.directions.filter(d=>d.shortlisted).length,1);assert.equal(logoBrief.directions.filter(d=>d.kind==='club-study').length,4);assert.equal(logoBrief.directions.filter(d=>d.kind==='lava-study').length,3);
  $('studies-tab').click();assert.equal(location.hash,'#designs');assert.equal($('studies-workspace').hidden,false);assert.equal($('logos-workspace').hidden,true);assert.equal(document.documentElement.dataset.studioPalette,'yellow');document.querySelector('[data-shell-palette=cobalt]').click();assert.equal(document.documentElement.dataset.studioPalette,'cobalt');document.querySelector('[data-shell-palette=yellow]').click();
  for(const [theme,palette] of [['cobalt','acid-dark'],['navy-light','muted-light'],['navy','muted-dark'],['yellow','acid-light']]){document.querySelector('[data-shell-palette='+theme+']').click();assert.equal($('scene-palette').value,palette);assert.ok([...document.querySelectorAll('[data-print-animal] img')].every(img=>img.src.includes('-'+palette+'-v1.webp')));assert.ok([...document.querySelectorAll('#state-motif-gallery pattern image')].every(img=>img.getAttribute('href').includes('-'+palette+'-v1.webp')));}
  assert.equal(document.querySelectorAll('[data-regional-state]').length,7);assert.equal(document.querySelectorAll('#official-wordmark-proofs .brand-wordmark').length,2);assert.equal(document.querySelectorAll('[data-small-mark]').length,4);assert.equal(JSON.parse(localStorage.getItem('finfolk:atelier:design-studies:v1')).mark,'slow-melt-navy');assert.equal(document.querySelector('[aria-label="Design notes for Liquid f"]').value,'Keep my archived note.');assert.equal(document.querySelectorAll('[data-page-direction]').length,4);
  document.querySelector('[data-use-atelier-mark=slow-melt-cobalt]').click();assert.ok($('atelier-favicon').href.endsWith('finfolk-favicon.png'));assert.ok([...document.querySelectorAll('[data-atelier-mark]')].every(image=>image.src.endsWith('finfolk-mark-cobalt.svg')));assert.equal(JSON.parse(localStorage.getItem('finfolk:atelier:design-studies:v1')).mark,'slow-melt-cobalt');
  const studyNotes=document.querySelector('[aria-label="Design notes for Print house"]');studyNotes.value='Keep the oversized printed wordmark.';studyNotes.dispatchEvent(new window.Event('input'));$('study-export').click();const designBrief=JSON.parse(await download.text());assert.equal(designBrief.notes['print-house'],'Keep the oversized printed wordmark.');assert.equal(designBrief.atelierMark,'slow-melt-cobalt');assert.equal(designBrief.logo,'slow-melt-f');assert.equal(designBrief.archivedSmallMarks.length,4);assert.equal(document.querySelectorAll('#stencil-grid .diver-stencil').length,14);assert.equal(document.querySelectorAll('#habitat-gallery .habitat-study').length,8);$('stencil-darkness').value='85';$('stencil-darkness').dispatchEvent(new window.Event('input'));assert.equal(document.documentElement.style.getPropertyValue('--stencil-darkness'),'0.85');
  const sceneImage=document.querySelector('#underwater-scene-art img');assert.ok(sceneImage.src.endsWith('finfolk-underwater-ascent-acid-v1/acid-light.webp'));assert.equal(document.querySelectorAll('[data-scene-layer]').length,0);assert.ok($('scene-download').href.endsWith('finfolk-underwater-ascent-acid-v1/acid-light.png'));assert.equal(designBrief.underwaterScene.id,'ascent-acid');
  assert.equal(document.querySelectorAll('[data-vignette]').length,15);assert.equal($('scene-image').options.length,17);sceneImage.parentElement.scrollIntoView=()=>{};
  for(const id of ['coral-reef-acid','shipwreck-acid','sunken-city-acid','cave-acid','tropical-lagoon-acid','arctic-ice-acid','reef-glide-acid','jelly-drift-acid','ascent-acid']){document.querySelector('[data-vignette='+id+']').click();assert.equal(sceneImage.dataset.artwork,id);assert.equal($('scene-image').value,id);assert.ok($('scene-download').href.includes(id.replace('-acid','')+'-acid-v1/acid-light.png'));assert.equal(document.querySelector('[data-vignette='+id+']').getAttribute('aria-pressed'),'true');}
  for(const palette of ['acid-light','acid-dark','muted-light','muted-dark']){$('scene-palette').value=palette;$('scene-palette').dispatchEvent(new window.Event('change'));assert.equal(sceneImage.dataset.palette,palette);assert.ok($('scene-download').href.endsWith('/'+palette+'.png'));assert.ok([...document.querySelectorAll('[data-vignette] img')].every(img=>img.src.endsWith('/'+palette+'.webp')));}assert.ok($('scene-master').href.endsWith('/master.zip'));assert.equal(window.localStorage.getItem('finfolk:artwork:palette:v1'),'muted-dark');
  $('scene-image').value='natural';$('scene-image').dispatchEvent(new window.Event('change'));assert.ok(sceneImage.src.endsWith('finfolk-underwater-ascent-natural-v2.webp'));assert.ok($('scene-download').href.endsWith('finfolk-underwater-ascent-natural-v2.png'));assert.equal($('scene-caption').textContent,'Ascent / the natural scene study');
  $('scene-image').value='stylised';$('scene-image').dispatchEvent(new window.Event('change'));assert.equal(sceneImage.dataset.artwork,'stylised');assert.equal(designBrief.swimmers.length,7);assert.equal(designBrief.habitats.length,8);
  document.querySelector('[data-preview-design=print-house]').click();assert.equal($('preview-workspace').hidden,false);assert.equal($('studies-workspace').hidden,true);assert.equal($('preview-label').textContent,'Nasties couture');assert.equal($('motif').value,'octopus');assert.equal($('radius').value,'24');
  document.querySelector('[data-preset=midnight]').click();assert.equal($('preview-label').textContent,'Midnight cabinet');
  document.querySelector('[data-device=phone]').click();assert.ok($('device-frame').classList.contains('phone'));
  $('board-tab').click();assert.equal($('board-workspace').hidden,false);assert.equal($('preview-workspace').hidden,true);
  assert.equal(document.querySelectorAll('[data-print-animal]').length,13);
  document.querySelector('[data-print-animal=stonefish]').click();assert.ok($('motif-proof').style.backgroundImage.includes('animal-stonefish-muted-dark-v1.webp'));assert.equal($('printStyle').value,'two-tone');assert.ok($('motif-master').href.endsWith('/motifs/animal-stonefish/master.zip'));assert.ok($('motif-print').href.includes('-muted-dark-v1.webp'));
  const accent=document.querySelector('input[type=text][data-colour=accent]');accent.value='#abc123';accent.dispatchEvent(new window.Event('change'));
  $('export-json').click();const exported=JSON.parse(await download.text());assert.equal(exported.palette.accent,'#abc123');
  $('apply').click();await settle();assert.equal(applied.palette.accent,'#abc123');assert.equal($('save-state').textContent,'Saved to local FinFolk');
  $('restore').click();await settle();assert.equal($('preview-label').textContent,'Original FinFolk');
  $('mood-name').value='My sea';$('save-mood').click();assert.equal($('saved-moods').children.length,1);
  await $('import-theme').onchange({target:{files:[{size:100,text:async()=>JSON.stringify(PRESETS.pearl)}],value:'file'}});assert.equal($('preview-label').textContent,'Pearl oddity');
  const file=new Blob(['fixture'],{type:'image/png'});Object.defineProperty(file,'name',{value:'My reference.png'});
  await $('reference-files').onchange({target:{files:[file],value:'file'}});assert.equal(document.querySelectorAll('.reference-image:not(.provided-reference)').length,1);
  document.querySelector('.reference-image:not(.provided-reference) button').click();await settle();assert.equal(document.querySelectorAll('.reference-image:not(.provided-reference)').length,0);
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('finfolk-atelier-references');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();
 }finally{URL.createObjectURL=originalURL;URL.revokeObjectURL=originalRevoke;await window.happyDOM.close();for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});

test('preview drafts replace the saved stylesheet, including reverting to Original',async()=>{
 const {Window}=await import('happy-dom');const window=new Window({url:'http://127.0.0.1:8770/preview/',settings:{disableCSSFileLoading:true}});
 window.document.write('<link rel="stylesheet" href="./atelier-theme.abcdef.css"><link rel="stylesheet" href="./finfolk.css">');
 const keys=['window','document','location','parent'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let listener;const parent={postMessage(){}};
 window.addEventListener=(type,fn)=>{if(type==='message')listener=fn;};
 for(const [key,value] of Object.entries({window,document:window.document,location:window.location,parent}))Object.defineProperty(globalThis,key,{value,configurable:true});
 try{
  await import('../design-board/preview-bridge.js');
  listener({origin:'https://example.test',source:parent,data:{type:'finfolk:theme',theme:PRESETS.reverie}});assert.equal(!!document.querySelector('link').disabled,false);
  listener({origin:location.origin,source:parent,data:{type:'finfolk:theme',theme:PRESETS.reverie}});assert.equal(document.querySelector('link').disabled,true);assert.equal(!!document.querySelectorAll('link')[1].disabled,false);
  listener({origin:location.origin,source:parent,data:{type:'finfolk:theme',theme:PRESETS.original}});assert.ok(document.getElementById('finfolk-moodboard-preview').textContent.includes('inactive'));
 }finally{await window.happyDOM.close();for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});

test('generated animal prints render in square proportions and earlier moods remain compatible',()=>{
 const animalIDs=['bluebottle','boxjelly','octopus','stonefish','lionfish','conesnail'];
 for(const motif of animalIDs){const theme={...clone(PRESETS.reverie),motif,printStyle:'two-tone',motifScale:1.3};assert.equal(validateTheme(theme).motif,motif);const css=compileTheme(theme);assert.ok(!css.includes('data:image/svg+xml'),'Retired vector prints are never substituted');assert.equal(printAvailable(theme),true);assert.ok(printBackground(theme).includes('animal-'+motif+'-muted-light-v1.webp'));assert.ok(css.includes('--finfolk-motif-scale:1.3'));assert.ok(!css.includes('height:96px'),'Header pattern strips stay removed');assert.ok(css.includes('filter:none'));}
 assert.ok(compileTheme({...PRESETS.reverie,printStyle:'tonal'}).includes('filter:grayscale(1)'));assert.equal(printAvailable({...PRESETS.reverie,motif:'none'}),false);
 const older=clone(PRESETS.reverie);delete older.motifScale;delete older.printStyle;assert.equal(validateTheme(older).motifScale,1);assert.equal(validateTheme(older).printStyle,'two-tone');
});

test('state print placements preserve plain content cards and a quiet option',async()=>{
 for(const printPlacement of ['states','sections','page','header']){
  const theme={...clone(PRESETS.couture),printPlacement,ornament:.85};
  const css=compileTheme(theme);await transform(css,{loader:'css'});
  assert.ok(!css.includes('background-clip:padding-box,border-box,border-box'),'Rejected patterned frames stay removed');
  if(printPlacement==='states')assert.ok(css.includes('--finfolk-print-placement:states'));
  if(printPlacement==='sections'){assert.ok(css.includes('Patterned state backgrounds'));assert.ok(css.includes(":root[data-animal='none']"));}
  if(printPlacement==='page')assert.ok(css.includes('All-over signature print'));
 }
 assert.ok(!compileTheme({...PRESETS.couture,ornament:0}).includes('Patterned state backgrounds'));
 const older=clone(PRESETS.couture);delete older.printPlacement;assert.equal(validateTheme(older).printPlacement,'states');
 assert.equal(validateTheme({...PRESETS.couture,printPlacement:'edges'}).printPlacement,'states');
 assert.throws(()=>validateTheme({...PRESETS.couture,printPlacement:'url(evil)'}));
});

test('logo boards include local masters and optimized previews for original directions and paired fin studies',async()=>{
 assert.equal(LOGO_DIRECTIONS.length,6);assert.equal(new Set(LOGO_DIRECTIONS.map(d=>d.id)).size,6);
 assert.equal(FIN_STUDIES.length,3);assert.ok(FIN_STUDIES.every(d=>d.kind==='fin-study'));
 assert.equal(CLUB_STUDIES.length,4);assert.ok(CLUB_STUDIES.every(d=>d.kind==='club-study'));
 assert.equal(LAVA_STUDIES.length,3);assert.ok(LAVA_STUDIES.every(d=>d.kind==='lava-study'));
 for(const direction of [...LOGO_DIRECTIONS,...FIN_STUDIES,...CLUB_STUDIES,...LAVA_STUDIES]){
  for(const [path,type] of [[direction.original,'png'],[direction.image,'webp']]){
   const bytes=await readFile(new URL('../design-board/'+path.replace('/board/',''),import.meta.url));
   if(type==='png')assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');else assert.equal(bytes.toString('ascii',8,12),'WEBP');
  }
 }
});
