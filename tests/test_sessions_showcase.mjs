import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {installSessions} from '../design-board/sessions.js';
import {SESSION_EXAMPLES,sessionSummary} from '../design-board/session-data.mjs';
import {screenURL} from '../design-board/screens.mjs';
const window=new Window({url:'http://127.0.0.1:8770/board/sessions.html',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
const doc=window.document;doc.write(await readFile(new URL('../design-board/sessions.html',import.meta.url),'utf8'));
const app=installSessions({doc});
try{
 assert.match(screenURL('session-study'),/board\/sessions.html/);
 for(const fixture of SESSION_EXAMPLES){
  [...doc.querySelectorAll('.session-picker button')].find(b=>b.textContent===fixture.device).click();
  assert.equal(app.session.id,fixture.id);
  assert.equal(new URL(window.location.href).searchParams.get('source'),fixture.id);
  const summary=sessionSummary(fixture);
  assert.equal(doc.querySelector('.session-stats dd').textContent,String(summary.count));
  if(fixture.manual){assert.equal(doc.querySelectorAll('svg.depth-line').length,0);assert.match(doc.querySelector('#session-analysis').textContent,/logged by hand/);continue;}
  assert.equal(summary.underwater,fixture.dives.reduce((s,d)=>s+d.duration,0));
  doc.querySelectorAll('.dive-row')[2].click();
  assert.equal(doc.querySelector('.dive-chip[aria-pressed=true]').textContent,fixture.device);
  assert.equal(doc.querySelector('.dive-row[aria-pressed=true] strong').textContent,fixture.dives[2].maxDepth.toFixed(1)+' m');
  assert.match(doc.querySelector('.dive-detail').textContent,/DIVE 03/);
  if(fixture.id==='suunto')assert.match(doc.querySelector('.dive-detail').textContent,/missing sample/);
  if(fixture.id==='apple')assert.match(doc.querySelector('.dive-detail').textContent,/Not recorded/);
 }
 for(const id of ['yellow','cobalt','navy-light','navy']){doc.getElementById('profile-theme').value=id;doc.getElementById('profile-theme').onchange();assert.equal(doc.documentElement.dataset.theme,id);}
 console.log('Session showcase: sources, summaries, dive selection, missing data, manual records, routes and themes passed.');
}finally{app.destroy();await window.happyDOM.close();}
