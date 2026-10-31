import assert from 'node:assert/strict';
import { parseInstagramCommand,instagramSender } from '../backend/instagram-dm.mjs';
import { claimsEnabled } from '../backend/instagram-claims.mjs';
assert.deepEqual(parseInstagramCommand(' /HeLp '),{command:'help',args:''});
assert.equal(parseInstagramCommand('/claim '+'a'.repeat(24)).challengeHash.length,64);
assert.equal(parseInstagramCommand('/claim bad').command,'claim_usage');
assert.equal(parseInstagramCommand('/checkin Bondi Beach').args,'Bondi Beach');
assert.equal(parseInstagramCommand('please /points').command,'prompt');
assert.equal(parseInstagramCommand('/points extra').command,'unknown');
assert.equal(parseInstagramCommand('/claim '+ 'a'.repeat(24)+'\n/points').command,'unknown');
assert.equal(claimsEnabled({INSTAGRAM_AUTO_CLAIM_ENABLED:'true'}),false);
const env={INSTAGRAM_GRAPH_VERSION:'v26.0',INSTAGRAM_ACCESS_TOKEN:'test'};
await assert.rejects(()=>instagramSender('100',env,async()=>({ok:true,json:async()=>({id:'100',username:'alice'})})),/could not confirm/);
assert.deepEqual(await instagramSender('100',env,async()=>({ok:true,json:async()=>({id:'100',username:'Alice',is_user_follow_business:false})})),{handle:'alice',follows:false});
console.log('Instagram DM parser/provider checks passed: exact slash syntax, code hashing, private command parsing and fail-closed follow/identity checks.');

await assert.rejects(()=>instagramSender('100',env,async()=>({ok:true,json:async()=>({id:'wrong',username:'alice',is_user_follow_business:true})})),/could not confirm/);
