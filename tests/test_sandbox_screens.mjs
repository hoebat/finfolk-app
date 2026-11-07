import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createMoodboardServer} from '../scripts/moodboard.mjs';
import {initialSandbox} from '../design-board/sandbox-store.mjs';
import {SCREENS} from '../design-board/screens.mjs';
const server=createMoodboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch();
try{const p=await browser.newPage(),errors=[],failures=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/');const state=initialSandbox();state.completed=true;state.active='operator';await p.evaluate(async state=>{const db=await new Promise(r=>{const q=indexedDB.open('finfolk:sandbox:v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('demo');q.onsuccess=()=>r(q.result);});await new Promise(r=>{const tx=db.transaction('demo','readwrite');tx.objectStore('demo').put(state,'current');tx.oncomplete=r;});db.close();},state);
for(const screen of SCREENS){const before=errors.length;await p.goto(base+'/try/#'+screen.id);await p.waitForTimeout(260);const f=p.frameLocator('#sandbox-frame');await f.locator('body').waitFor();const text=await f.locator('body').innerText();if(/could not load|is not a function|unexpected.*fixture/i.test(text)||errors.length>before)failures.push({screen:screen.id,text:text.slice(0,400),errors:errors.slice(before)});}
console.log(JSON.stringify({screens:SCREENS.length,failures,errors},null,2));assert.deepEqual(failures,[]);assert.deepEqual(errors,[]);
}finally{await browser.close();await new Promise(r=>server.close(r));}
