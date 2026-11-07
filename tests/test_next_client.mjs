import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const state={user:{id:'alice',emailVerified:true},created:0,calls:[]};
let pauseSession,sessionStarted;
globalThis.__nextClientTest={state,auth:{
 async getSession(){const result={data:{user:state.user,session:{token:'header.payload.signature'}}};if(pauseSession){const pause=pauseSession;pauseSession=null;sessionStarted();await pause;}return result;},
 async signOut(){return {data:{}};},
}};
const oldFetch=globalThis.fetch;
let lastRequest;globalThis.fetch=async(url,init)=>{lastRequest={url,init};const action=init.body?JSON.parse(init.body).action:new URL(url).pathname;state.calls.push(action);return Response.json({data:{action}});};
try {
 let source=await readFile(new URL('../web/neon-client.js',import.meta.url),'utf8');
 const replacements={
  './instagram-claim.js':moduleURL('export function clearInstagramClaimStorage(){}'),
  './auth-session.js':new URL('../web/auth-session.js',import.meta.url).href,
  '@neondatabase/auth':moduleURL('export const createAuthClient=()=>globalThis.__nextClientTest.auth;'),
  './activity.js':moduleURL('export const activity={begin:()=>({finish(){}})};'),
  './next-backbone.js':moduleURL(`import {createApplicationBackbone as create,restOperation} from ${JSON.stringify(new URL('../web/next-backbone.js',import.meta.url).href)};export {restOperation};let instance;export function createApplicationBackbone(config){if(!instance){instance=create(config);const member=instance.member;let previous;instance.member=(actor,...args)=>{if(previous!==actor){globalThis.__nextClientTest.state.created++;previous=actor;}return member(actor,...args);};}return instance;}`),
 };
 for(const [from,to] of Object.entries(replacements))source=source.replaceAll("'"+from+"'",JSON.stringify(to));
 const {createLogbookClient}=await import(moduleURL(source));
 const client=await createLogbookClient({authUrl:'https://auth.example.test',apiUrl:'https://next.example.test',backbone:true});
 await Promise.all([client.call('me'),client.call('myCheckins')]);
 assert.equal(state.created,1,'Concurrent first calls share a single actor context');
 let release;pauseSession=new Promise(resolve=>{release=resolve;});
 const started=new Promise(resolve=>{sessionStarted=resolve;});
 const late=client.call('preferences',{profile:{displayName:'Alice'}});
 await started;state.user={id:'bob',emailVerified:true};await client.refresh();release();
 await assert.rejects(()=>late,/Account changed|closed/);
 assert.ok(!state.calls.includes('preferences'),'An old actor cannot write after token acquisition overlaps an account change');
 await client.call('me');assert.equal(state.created,2);
 const controller=new AbortController();await client.request('/v1/admin/messaging/events?limit=20&cursor=two',{signal:controller.signal});assert.equal(lastRequest.init.signal,controller.signal);
 await client.request('/v1/me/instagram/profile',{method:'PUT',body:{handle:'fixture'},idempotencyKey:'same-key'});assert.equal(lastRequest.init.headers['Idempotency-Key'],'same-key');assert.deepEqual(JSON.parse(lastRequest.init.body),{handle:'fixture'});
 await assert.rejects(()=>client.request('/v1/missing'),/Unknown/);await assert.rejects(()=>client.call('missing'),/Unknown/);
 await client.signOut();await assert.rejects(()=>client.call('me'),/Sign in/);
 console.log('NEXT_CLIENT_PASS: concurrent initialization, account change during token acquisition, and sign-out.');
} finally {globalThis.fetch=oldFetch;delete globalThis.__nextClientTest;}
