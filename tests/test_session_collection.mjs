import assert from 'node:assert/strict';
import {createCollectionStore} from '../design-board/session-collection.mjs';
import {SESSION_EXAMPLES} from '../design-board/session-data.mjs';
const store=createCollectionStore(),base={platform:'Instagram',providerId:'late',postedAt:'2026-11-03',caption:'@finfolk.com.au '+SESSION_EXAMPLES[0].code};
const received=store.receive(base).post;
assert.equal(received.sessionId,'garmin');assert.equal(received.postedAt,'2026-11-03');assert.equal(SESSION_EXAMPLES[0].day,'2026-10-29');
assert.equal(store.receive({...base,caption:SESSION_EXAMPLES[1].code}).duplicate,true);assert.equal(received.sessionId,'garmin');
store.returnToInbox(received.id);assert.equal(store.inbox().length,1);store.receive(base);assert.equal(received.sessionId,null);
for(const [providerId,caption,reason]of [['none','@finfolk.com.au','No session code'],['unknown','#ffunknown','Unknown session code'],['multiple',SESSION_EXAMPLES.map(s=>s.code).join(' '),'Multiple session codes']]){const p=store.receive({...base,providerId,caption}).post;assert.equal(p.sessionId,null);assert.equal(p.reason,reason);}
const inbox=store.inbox();store.assign(inbox.map(p=>p.id),'suunto');assert.equal(store.inbox().length,0);assert.equal(store.forSession('suunto').length,4);assert.throws(()=>store.assign([received.id],'missing'));
store.remove(received.id);store.receive(base);assert.equal(store.forSession('suunto').length,3);assert.equal(received.hidden,true);
assert.equal(new Set(SESSION_EXAMPLES.map(s=>s.code)).size,4);
console.log('Session collection: late arrivals, codes, duplicate delivery, bulk assignment, return and removal passed.');
