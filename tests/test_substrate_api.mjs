import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createAPI} from '../backend/api.mjs';
import {createBackbone,operations} from '../web/next-backbone.js';
const pg=new PGlite();const query=async(sql,args=[]) => (await pg.query(sql,args)).rows;
const db={query,transaction:fn=>pg.transaction(tx=>fn(async(sql,args=[]) => (await tx.query(sql,args)).rows))};
const env={DB_BACKBONE_ENABLED:'true',ENVIRONMENT:'next',COMMUNITY_POSTS_ENABLED:'true',INSTAGRAM_ADMIN_IDS:'alice'};
let app;
const member=uid=>createBackbone(uid,async(name,value,options)=>{
 const spec=operations[name],path=spec.transport==='action'?'/api':value.path;
 const response=await app.fetch(new Request('https://next.finfolk.com.au'+path,{method:spec.transport==='action'?'POST':spec.method,headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json','Idempotency-Key':'test-'+name},...((spec.write||spec.transport==='action')?{body:JSON.stringify(spec.transport==='action'?{action:name,...value}:value.body||{})}:{})}),env);
 const body=await response.json();if(!response.ok)throw Object.assign(Error(body.error?.message||body.error),{status:response.status});return body.data;
});
try {
 await pg.exec('CREATE ROLE finfolk_api; CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id text PRIMARY KEY,name text,"emailVerified" boolean,banned boolean);');
 for(const name of (await readdir('backend/migrations')).filter(n=>n.endsWith('.sql')).sort())await pg.exec(await readFile('backend/migrations/'+name,'utf8'));
 await query(`INSERT INTO neon_auth."user" VALUES('alice','Alice',true,false),('bob','Bob',true,false)`);
 await query("INSERT INTO finfolk.beaches(id,name,timezone) VALUES('bondi','Bondi','Australia/Sydney')");
 await pg.exec('GRANT USAGE ON SCHEMA finfolk TO finfolk_api; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA finfolk TO finfolk_api; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA finfolk TO finfolk_api; SET ROLE finfolk_api;');
 app=createAPI({db,verify:async sub=>({sub}),origins:['https://next.finfolk.com.au']});
 const alice=member('alice'),bob=member('bob');await Promise.all([alice.call('me'),bob.call('me')]);
 await alice.call('preferences',{profile:{displayName:'Alice changed',open:true,beaches:['bondi']}});assert.equal((await alice.call('me')).profile.displayName,'Alice changed');
 await alice.call('checkin',{beachId:'bondi'});assert.equal((await alice.call('myCheckins')).length,1);
 await alice.call('connection',{target:'bob',mode:'request'});await bob.call('connection',{target:'alice',mode:'accept'});assert.equal((await alice.call('connections'))[0].status,'accepted');
 await alice.call('block',{target:'bob'});assert.equal((await alice.call('blocks')).length,1);await alice.call('unblock',{target:'bob'});
 const session=await alice.call('saveSession',{values:{date:'2026-11-01',locationName:'Bondi',beachId:'bondi',notes:'Synthetic private session'}});
 assert.equal((await alice.call('session',{id:session.id})).visibility,'private');await assert.rejects(()=>bob.call('session',{id:session.id}),e=>e.status===404);
 await alice.call('visibility',{id:session.id,visibility:'public'});assert.equal((await bob.call('session',{id:session.id})).notes,'Synthetic private session');await alice.call('deleteSession',{id:session.id});
 const post=await alice.call('post',{beachId:'bondi',url:'https://www.instagram.com/p/FIXTURE/',creatorHandle:'fixture',ownPost:true,tagged:true,publicConsent:true});
 await assert.rejects(()=>bob.call('reviewPosts'),e=>e.status===403);await alice.call('reviewPost',{id:post.id,decision:'approved',ownershipChecked:true,tagChecked:true,beachChecked:true});
 const publicPosts=await app.fetch(new Request('https://next.finfolk.com.au/community/posts?beachId=bondi'),env);assert.equal((await publicPosts.json()).posts.length,1);await alice.call('removePost',{id:post.id});
 const trip=await alice.call('tripSave',{draft:{title:'Fixture trip',authorName:'Alice',beachId:'bondi',start:'2026-11-01',end:'2026-11-01',story:'Synthetic',links:[]}});assert.equal((await alice.call('tripGet',{id:trip.id})).draft.title,'Fixture trip');await assert.rejects(()=>bob.call('tripGet',{id:trip.id}),e=>e.status===404);await alice.call('tripDelete',{id:trip.id});
 await alice.call('messagingSettings',{__rest:true,path:'/v1/admin/messaging/instagram'});await assert.rejects(()=>bob.call('messagingSettings',{__rest:true,path:'/v1/admin/messaging/instagram'}),e=>e.status===403);
 await assert.rejects(()=>alice.call('instagramCodeConnect',{__rest:true,path:'/v1/me/instagram/connect',body:{code:'SECRETTEST'}}),e=>e.status>=400 && !e.mutationCommitted);
 assert.ok(!JSON.stringify(alice.node).includes('SECRETTEST'),'Mutation credentials are not retained in model state');
 alice.close();bob.close();assert.deepEqual(alice.cache.rows,{});
 console.log('SUBSTRATE_API_PASS: actual SQL and API behind models; profile, visits, buddies, sessions, posts, trips, admin gates and disabled integrations.');
} finally {await pg.close();}
