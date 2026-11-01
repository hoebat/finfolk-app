import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {createPreferences, MAP_DEFAULTS} from '../web/preferences.js';
import {installSettings} from '../web/settings.js';
import {installOfflineUI} from '../web/offline-ui.js';
import {applySavedTheme} from '../web/theme.js';

const memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
assert.deepEqual(createPreferences(storage).get(),MAP_DEFAULTS);
memory.set('shore-depth:measurement-visible','false');
let preferences=createPreferences(storage);
assert.equal(preferences.get().measurement,false,'Migrate the previous distance visibility preference');
let changes=0;const unsubscribe=preferences.subscribe(()=>changes++);
preferences.set('basemap',false);preferences.set('interval',2);
assert.equal(changes,2);
assert.equal(createPreferences(storage).get().basemap,false);
assert.equal(createPreferences(storage).get().interval,2);
preferences.set('measurement',true);
assert.equal(storage.getItem('shore-depth:measurement-visible'),'true');
preferences.set('interval',1);preferences.set('basemap','true');preferences.set('constructor',false);
assert.equal(changes,3,'Reject unknown or malformed preference changes');
unsubscribe();preferences.set('pins',true);assert.equal(changes,3);
memory.set('finfolk-map-settings','{broken');
assert.deepEqual(createPreferences(storage).get(),MAP_DEFAULTS,'Corrupt storage uses current defaults');
memory.set('finfolk-map-settings',JSON.stringify({basemap:'false',interval:1,context:false}));
assert.deepEqual(createPreferences(storage).get(),{...MAP_DEFAULTS,context:false});
const blocked=createPreferences({getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');}});
blocked.set('basemap',false);assert.equal(blocked.get().basemap,false);assert.equal(blocked.persisted,false);

const window=new Window({width:390,height:844,url:'https://finfolk.test/?view=settings',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
window.document.write(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
for(const key of ['document','location','history','localStorage'])globalThis[key]=window[key];
try {
  const $=id=>document.getElementById(id);
  for(const name of ['style.css','glass.css','mobile.css','finfolk.css','community.css']) {
    const style=document.createElement('style');style.textContent=await readFile(new URL('../web/'+name,import.meta.url),'utf8');document.head.append(style);
  }
  assert.equal(window.getComputedStyle(document.querySelector('#settings-map .layer-section')).display,'block','Map settings stay visible on mobile');
  assert.equal(window.getComputedStyle(document.querySelector('.settings-heading')).display,'block');
  for(const style of document.querySelectorAll('style'))style.remove();
  localStorage.setItem('finfolk-theme','night');
  preferences=createPreferences(localStorage);
  const shell={navigate(view){assert.equal(view,'settings');}};
  const settings=installSettings({preferences,shell});
  assert.equal(document.documentElement.dataset.theme,'night');
  assert.equal(document.querySelectorAll('[name=theme]').length,3);
  assert.equal($('map-tools-panel').querySelectorAll('input,select').length,1,'Only the published-map selector remains in Map tools');
  for(const id of ['depth-layer','contour-layer','context-layer','pin-layer','coverage-layer','basemap-layer','measurement-layer','interval']) {
    assert.ok($(id).closest('#settings-page'),id+' belongs to global Settings');
    assert.equal($(id).closest('label').hidden,false);
  }
  assert.equal($('data-panel').querySelectorAll('.data-tabs,.layer-list,.map-tools-card,.profile-panel').length,0);
  settings.updateAvailability({fine:false});
  assert.ok($('interval-availability').textContent.includes('Other maps use 5 m'));
  assert.equal($('interval').options[1].disabled,false,'Global preferences can be set before a compatible map is loaded');
  $('interval').value='2';$('interval').dispatchEvent(new window.Event('change'));
  $('basemap-layer').click();assert.equal(preferences.get().basemap,false);
  assert.equal(createPreferences(localStorage).get().interval,2);
  const sand=document.querySelector('[name=theme][value=sand]');sand.checked=true;sand.dispatchEvent(new window.Event('change'));
  assert.equal(localStorage.getItem('finfolk-theme'),'sand');applySavedTheme();assert.equal(document.documentElement.dataset.theme,'sand');
  localStorage.setItem('finfolk-theme','unknown');applySavedTheme();assert.equal(document.documentElement.dataset.theme,'coastal');
  const values=new Map(),saved={id:'bondi',name:'Bondi',keys:['pinned'],complete:true,version:'one'};
  values.set('saved',[saved]);
  let storeChange,downloadChange,removed=[],cancelled=false;
  const rows=[{key:'pinned',bytes:20},{key:'recent',bytes:10}];
  const store={disabled:false,meta:async(key,value)=>{if(value!==undefined)values.set(key,value);return values.get(key);},
    all:async()=>rows,remove:async keys=>{removed=keys;},subscribe:fn=>{storeChange=fn;}};
  const downloads={store,operations:new Map(),base:new URL('https://finfolk.test/'),bypass:false,
    subscribe:fn=>{downloadChange=fn;},saveRegion:async()=>{},removeRegion:async id=>{assert.equal(id,'bondi');}};
  const offline=installOfflineUI(downloads,{region:()=>({id:'bondi',name:'Bondi'}),onOpen:id=>assert.equal(id,'bondi')});
  await new Promise(resolve=>setTimeout(resolve,0));await offline.draw();
  assert.equal(document.querySelectorAll('#settings-storage .storage-controls').length,1);
  assert.equal(document.querySelectorAll('#system-panel .storage-controls').length,0);
  assert.ok(document.querySelector('.source-actions').textContent.includes('Save region offline'));
  const findButton=text=>[...document.querySelectorAll('#settings-storage button')].find(b=>b.textContent===text);
  findButton('Clear recent cache').click();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(removed,['recent']);
  findButton('Load without saving').click();assert.equal(downloads.bypass,true);
  const limit=document.querySelector('select[aria-label="Recent dataset cache limit"]');limit.value=String(100*1024**2);limit.dispatchEvent(new window.Event('change'));
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(values.get('limit'),100*1024**2);
  findButton('Open').click();findButton('Remove').click();
  downloads.operations.set('one',{state:'loading',label:'Bondi',total:6*1024**2,loaded:10,controller:{abort(){cancelled=true;}}});
  downloadChange();document.querySelector('#download-callout button').click();assert.equal(cancelled,true);
  assert.ok(storeChange);
  console.log('Settings checks passed: migration/persistence, blocked storage, themes, global controls, unavailable maps, cache limits, saved regions and download cancellation.');
} finally {await window.happyDOM.close();}
