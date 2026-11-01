import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
import {createAPI} from '../backend/api.mjs';

const path='/v1/integrations/tiktok/oauth/callback';
const query='?auth_code=SECRET_FIXTURE&state=PRIVATE_FIXTURE&redirect_uri=https%3A%2F%2Funtrusted.invalid';
const request=new Request('https://api.finfolk.test'+path+query);
const routes=[
  await worker.fetch(request,{},{}),
  await createAPI({db:{query:()=>{throw Error('Setup callback must not access the database');}},verify:()=>{throw Error('Setup callback must not depend on login');}}).fetch(request),
];
for(const response of routes){
  assert.equal(response.status,503,'Unapproved TikTok authorization is explicitly unavailable');
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
  assert.match(response.headers.get('Content-Security-Policy'),/default-src 'none'/);
  assert.equal(response.headers.get('Location'),null,'Incoming redirect URLs are never followed');
  const html=await response.text();
  assert.match(html,/No TikTok authorization code has been accepted or exchanged/);
  assert.ok(!/SECRET_FIXTURE|PRIVATE_FIXTURE|untrusted\.invalid/.test(html),'OAuth parameters are never reflected');
}
const head=await worker.fetch(new Request('https://api.finfolk.test'+path,{method:'HEAD'}),{},{});
assert.equal(head.status,503);assert.equal(await head.text(),'');
console.log('TIKTOK_SETUP_PASS: database-independent registration callback, explicit unavailable state, no code reflection, no redirects and private caching.');
