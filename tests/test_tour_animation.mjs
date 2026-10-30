import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const w = new Window({url:'https://finfolk.test/'});
for (const key of ['window','document','localStorage']) Object.defineProperty(globalThis,key,{value:w[key],configurable:true});
const {showMemberTour}=await import('../web/member-tour.js');
const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
let sequence=0;const timers=new Map();globalThis.setTimeout=fn=>{timers.set(++sequence,fn);return sequence;};globalThis.clearTimeout=id=>timers.delete(id);
const click=text=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent===text);assert.ok(b,text);b.click();};
const finish=()=>{let count=0;while(timers.size){assert.ok(count++<300);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}};
try {
 showMemberTour({userId:'animation',force:true});finish();click('Next');
 click('Pause demonstration');assert.equal(timers.size,0);click('Play demonstration');finish();
 assert.equal(document.querySelector('input').value,'Bondi');assert.equal(document.querySelector('.tour-demo p').hidden,false);
 click('Next');finish();assert.equal(document.querySelectorAll('[aria-pressed=true]').length,2);
 click('Next');finish();assert.match(document.querySelector('[role=status]').textContent,/Example saved/);
 click('Next');finish();assert.match(document.querySelector('.tour-demo').textContent,/3 \/ 3/);
 click('Next');finish();assert.match(document.querySelector('[role=status]').textContent,/Request sent/);
 click('Next');finish();assert.equal(document.querySelector('input[type=checkbox]').checked,false);
 click('Replay step');assert.ok(timers.size);click('Close walkthrough');assert.equal(timers.size,0,'Close cancels playback');
 w.matchMedia=()=>({matches:true});showMemberTour({userId:'reduced'});assert.equal(timers.size,0,'Reduced motion starts paused');click('Close walkthrough');
 console.log('Animated walkthrough passed: typing, clicks, outcomes, pause/resume, cleanup and reduced motion.');
} finally {globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;w.happyDOM.abort();}
