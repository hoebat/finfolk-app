import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {transform} from 'esbuild';
import {SMALL_MARKS} from '../design-board/small-marks.mjs';
import {PAGE_DIRECTIONS} from '../design-board/page-directions.mjs';
import {VISUAL_PALETTES,visualPalette} from '../web/visual-language.js';
import {contrastRatio} from '../design-board/theme-engine.mjs';
import {installHabitatScenes} from '../web/habitat.js';
const master=await readFile(new URL('../web/finfolk-mark.svg',import.meta.url),'utf8');
const path=master.match(/ d="([^"]+)"/)[1];
for(const mark of SMALL_MARKS){const svg=await readFile(new URL('../web/'+mark.image.split('/').at(-1),import.meta.url),'utf8');assert.equal(svg.match(/ d="([^"]+)"/)[1],path,'Every treatment preserves the locked contour');assert.ok(!svg.includes('<image'),'Small marks never contain animal imagery');}
const css=await readFile(new URL('../web/brand.css',import.meta.url),'utf8');await transform(css,{loader:'css'});assert.match(css,/@container brand-mark \(min-width:128px\)/);assert.match(css,/background-size:25% 25%/);
for(const file of ['atelier-frame.css','study-page.css'])await transform(await readFile(new URL('../design-board/'+file,import.meta.url),'utf8'),{loader:'css'});
for(const p of VISUAL_PALETTES){assert.ok(contrastRatio(p.palette.paper,p.palette.ink)>=4.5);assert.ok(contrastRatio(p.palette.surface,p.palette.ink)>=4.5);}
assert.deepEqual(VISUAL_PALETTES.map(p=>p.id),['yellow','cobalt','navy-light','navy']);assert.equal(visualPalette('night').id,'navy');assert.equal(visualPalette('acid').id,'yellow');
for(const file of ['web/visual-language.css','design-board/visual-shell.css'])await transform(await readFile(new URL('../'+file,import.meta.url),'utf8'),{loader:'css'});
for(const file of ['index.html','landing.html']){const html=await readFile(new URL('../web/'+file,import.meta.url),'utf8');assert.ok(html.includes('./brand.css'));assert.ok(html.includes('data-brand-master="slow-melt-f"'));assert.ok(!html.includes('src="./finfolk-logo.jpeg"'));}
const html=await readFile(new URL('../design-board/study-page.html',import.meta.url),'utf8');
for(const direction of PAGE_DIRECTIONS){
 const window=new Window({url:'http://127.0.0.1:8770'+direction.preview,settings:{disableIframePageLoading:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});window.document.write(html);
 for(const name of ['window','document','location'])Object.defineProperty(globalThis,name,{value:name==='window'?window:window[name],configurable:true});
 const $=id=>document.getElementById(id),messages=[];const child={postMessage:(message,origin)=>messages.push({message,origin})};Object.defineProperty($('study-app'),'contentWindow',{value:child,configurable:true});
 window.localStorage.setItem('finfolk-animal','stonefish');
 try{
  await import('../design-board/study-page.js?case='+direction.id);
  assert.deepEqual([...document.querySelectorAll('#study-title>span')].map(n=>n.textContent),['Pick your spot.','Post your logs.','Discover your FinFolk.']);
  assert.equal(document.body.dataset.direction,direction.id);assert.equal(document.querySelector('#study-signature .brand-wordmark').dataset.brandMaster,'slow-melt-wordmark');assert.equal(document.querySelector('#study-nav-mark .brand-mark').dataset.brandMaster,'slow-melt-f');assert.equal(document.querySelectorAll('.study-stencil-pair .diver-stencil').length,2);assert.equal(document.querySelectorAll('.study-brand-range .brand-mark').length,4);
  const animal=$('study-animal');animal.value='none';animal.dispatchEvent(new window.Event('change'));assert.equal(document.documentElement.style.getPropertyValue('--finfolk-animal-print'),'none');assert.equal(messages.at(-1).message.animal,'none');
  animal.value='lionfish';animal.dispatchEvent(new window.Event('change'));const collection=$('study-collection');collection.value='hyper';collection.dispatchEvent(new window.Event('change'));assert.ok(document.documentElement.style.getPropertyValue('--finfolk-animal-print').includes('animal-lionfish-'+(['midnight-current','below-the-surface'].includes(direction.id)?'acid-dark':'acid-light')+'-v1.webp'));assert.equal(messages.at(-1).message.theme.collection,'hyper');assert.equal(window.localStorage.getItem('finfolk-animal'),'stonefish','Study controls never overwrite the user’s saved animal');
  document.querySelector('[data-study-screen=logbook]').click();assert.ok($('study-app').src.includes('view=logbook'));$('study-device').click();assert.ok($('study-app-window').classList.contains('phone'));$('study-device').click();assert.ok(!$('study-app-window').classList.contains('phone'));
  $('study-palette').value='navy';$('study-palette').dispatchEvent(new window.Event('change'));assert.equal(messages.at(-1).message.theme.palette.paper,'#172440');assert.equal(messages.at(-1).message.theme.collection,'muted');
  $('study-palette').value='navy-light';$('study-palette').dispatchEvent(new window.Event('change'));assert.equal(messages.at(-1).message.theme.palette.paper,'#f2e8d6');assert.equal(messages.at(-1).message.theme.collection,'muted');
  $('study-shape').value='turtle';$('study-shape').dispatchEvent(new window.Event('change'));assert.ok([...document.querySelectorAll('.diver-stencil')].every(node=>node.style.getPropertyValue('--diver-mask').includes('habitat-turtle-v1.webp')));
  $('study-shape').value='freestyle';$('study-shape').dispatchEvent(new window.Event('change'));assert.ok([...document.querySelectorAll('.diver-stencil')].every(node=>node.dataset.pose==='freestyle'&&node.style.getPropertyValue('--diver-mask').includes('swimmer-freestyle-v1.webp')));assert.equal($('study-shape').querySelectorAll('option').length,15);
  $('study-darkness').value='85';$('study-darkness').dispatchEvent(new window.Event('input'));assert.equal(document.documentElement.style.getPropertyValue('--stencil-darkness'),'0.85');
  const before=messages.length;window.dispatchEvent(new window.MessageEvent('message',{origin:'https://untrusted.test',source:child,data:{type:'finfolk:ready'}}));assert.equal(messages.length,before);window.dispatchEvent(new window.MessageEvent('message',{origin:location.origin,source:child,data:{type:'finfolk:ready'}}));assert.equal(messages.length,before+1);
 }finally{await window.happyDOM.close();}
}
const habitatWindow=new Window({settings:{disableCSSFileLoading:true}});habitatWindow.document.write('<section class="logbook-page"><header>My sessions</header></section>');
try{installHabitatScenes(habitatWindow.document);const page=habitatWindow.document.querySelector('.logbook-page');assert.equal(page.querySelectorAll('.habitat-scene').length,1);assert.equal(page.querySelectorAll('header .habitat-shape').length,0);page.innerHTML='<header>Updated sessions</header>';await new Promise(resolve=>setImmediate(resolve));assert.equal(page.querySelectorAll('.habitat-scene').length,1,'Organic decorations survive product rerenders');assert.equal(page.querySelectorAll('.habitat-shape').length,3);}finally{await habitatWindow.happyDOM.close();}
console.log('Locked identity passed: identical SVG contours, fine-print size rule, four live studies, stencil treatments, local preview controls and message isolation.');
