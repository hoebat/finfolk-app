import assert from 'node:assert/strict';
import {socialAttachment,photoError} from '../design-board/session-media.js';
assert.equal(socialAttachment('https://instagram.com/reel/abc_12/?utm_source=test#part').url,'https://www.instagram.com/reel/abc_12/');
assert.equal(socialAttachment('https://www.tiktok.com/@alex.dives/video/123?x=1').creator,'@alex.dives');
for(const value of ['https://evil.com/reel/abc/','https://instagram.com/alex/','https://instagram.com/stories/alex/123','https://vm.tiktok.com/abc','http://instagram.com/p/abc','https://a:b@instagram.com/p/abc'])assert.throws(()=>socialAttachment(value));
assert.match(photoError({type:'image/heic',size:10}),/Convert HEIC/);
assert.match(photoError({type:'image/jpeg',size:25*1024*1024}),/smaller/);
assert.equal(photoError({type:'image/webp',size:100}), '');
console.log('Session media validation passed.');
