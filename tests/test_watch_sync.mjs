import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {installWatchSync} from '../design-board/watch-sync.js';
import {WATCH_JOURNEYS} from '../design-board/watch-sync-data.mjs';
import {screenURL} from '../design-board/screens.mjs';
const window=new Window({url:'http://127.0.0.1:8770/board/watch-sync.html?source=apple',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
const doc=window.document;doc.write(await readFile(new URL('../design-board/watch-sync.html',import.meta.url),'utf8'));
let requests=0;window.fetch=()=>{requests++;throw Error('Walkthrough must not fetch account data');};
const app=installWatchSync({doc,stepMs:25});
const control=name=>doc.querySelector(`[data-control=${name}]`);
try{
 assert.equal(app.source,'apple');control('play').click();assert.equal(app.playing,false);
 for(const journey of WATCH_JOURNEYS){
  assert.match(screenURL('watch-'+journey.id),/board\/watch-sync.html/);
  [...doc.querySelectorAll('.watch-source-picker button')].find(b=>b.textContent===journey.name).click();control('play').click();
  assert.equal(app.source,journey.id);assert.equal(new URL(window.location.href).searchParams.get('source'),journey.id);
  for(let i=0;i<5;i++){
   doc.querySelectorAll('.watch-steps button')[i].click();assert.equal(app.step,i);assert.equal(app.playing,false);
   assert.equal(doc.querySelector('.watch-caption h2').textContent,journey.steps[i][0]);
   assert.equal(doc.querySelectorAll('[aria-current=step]').length,1);
   assert.equal(control('previous').disabled,i===0);assert.equal(control('next').disabled,i===4);
  }
  if(journey.id==='apple')assert.match(doc.querySelector('.watch-requirement').textContent,/not confirmed/);
  control('previous').click();assert.equal(app.step,3);control('next').click();assert.equal(app.step,4);
 }
 control('play').click();assert.equal(app.step,0);assert.equal(app.playing,true);
 await new Promise(resolve=>setTimeout(resolve,170));assert.equal(app.step,4);assert.equal(app.playing,false);
 control('replay').click();assert.equal(app.step,0);assert.equal(app.playing,true);control('play').click();
 window.history.pushState(null,'','?source=missing');window.dispatchEvent(new window.PopStateEvent('popstate'));assert.equal(app.source,'garmin');
 for(const id of ['yellow','cobalt','navy-light','navy']){doc.getElementById('profile-theme').value=id;doc.getElementById('profile-theme').onchange();assert.equal(doc.documentElement.dataset.theme,id);}
 assert.equal(requests,0);console.log('Watch walkthroughs passed: source routes, all steps, playback, completion, history, themes and no account requests.');
}finally{app.destroy();await window.happyDOM.close();}
