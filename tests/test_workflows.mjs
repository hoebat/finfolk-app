import assert from 'node:assert/strict';
import {WORKFLOWS} from '../design-board/workflows.mjs';
import {SCREENS} from '../design-board/screens.mjs';
import {validateEvent} from '../design-board/events.js';
assert.equal(WORKFLOWS.length,12);assert.equal(new Set(WORKFLOWS.map(w=>w.id)).size,WORKFLOWS.length);
for(const w of WORKFLOWS){assert.ok(w.role&&w.prerequisite);assert.equal(new Set(w.steps.map(s=>s.id)).size,w.steps.length);for(const s of w.steps){assert.ok(s.expected);if(s.screen)assert.ok(SCREENS.some(x=>x.id===s.screen));}}
const value={title:'Reef morning',location:'Portsea',starts:'2026-12-12T09:00',ends:'2026-12-12T11:00',capacity:''};assert.deepEqual(validateEvent(value),{});for(const [key,v]of [['title',''],['location',''],['ends','2026-12-12T08:00'],['starts',''],['capacity','1.5'],['capacity','-1']])assert.ok(validateEvent({...value,[key]:v})[key]);console.log('Workflow references and event validation passed.');

for(const [key,v] of [['starts','2026-02-30T09:00'],['ends','not-a-date'],['title','x'.repeat(161)],['capacity','NaN'],['capacity','0']])assert.ok(validateEvent({...value,[key]:v})[key]);
