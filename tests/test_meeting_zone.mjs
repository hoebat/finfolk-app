import assert from 'node:assert/strict';
import {meetingErrors,meetingView,distanceMetres} from '../design-board/meeting-map.js';
const v={zone:{center:[144.71,-38.31],radius:1000},spot:[144.711,-38.311],meeting:'Private entrance'};
assert.deepEqual(meetingErrors(v),{});assert.ok(distanceMetres(v.zone.center,v.spot)<1000);
assert.deepEqual(Object.keys(meetingView(v,false)),['zone']);assert.equal(JSON.stringify(meetingView(v,false)).includes('Private entrance'),false);
assert.deepEqual(meetingView(v,true).spot,v.spot);assert.ok(meetingErrors({...v,spot:[145,-38.31]}).spot);assert.ok(meetingErrors({...v,zone:{...v.zone,radius:0}}).location);assert.deepEqual(meetingErrors({...v,spot:null}),{});
console.log('Meeting zone geometry and private projection passed.');
