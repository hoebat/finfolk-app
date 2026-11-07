import assert from 'node:assert/strict';
import {PRACTICE_DEMOS} from '../design-board/practice-demos.js';
import {EXERCISES} from '../design-board/practice-model.mjs';
assert.deepEqual(Object.keys(PRACTICE_DEMOS),EXERCISES.map(e=>e.id));
for(const frames of Object.values(PRACTICE_DEMOS)){assert.equal(frames.length,4);for(const frame of frames)assert.equal(frame.length,4);}
assert.match(PRACTICE_DEMOS.natural[1][1],/does not set a rhythm/);assert.match(PRACTICE_DEMOS.o2[0][1],/not a guided exercise/);assert.match(PRACTICE_DEMOS.co2[1][1],/never begins the next hold automatically/);
console.log('Practice demos: complete exercise coverage and guidance boundaries passed.');
