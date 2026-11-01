// Exercise actual Postgres migrations and API/queue handlers without network access.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createAPI } from '../backend/api.mjs';
import { collectInstagramDM, processInstagramDM, sendOutbox } from '../backend/messaging-engine.mjs';
import { digest, seal, unseal } from '../backend/messaging-config.mjs';
import { generateConnectCode, normalizeConnectCode, validConnectCode } from '../backend/instagram-connect.mjs';

const pg = new PGlite();
const query = async (sql, values=[]) => (await pg.query(sql,values)).rows;
const db = {query, transaction: fn => pg.transaction(tx=>fn(async(sql,values=[]) => (await tx.query(sql,values)).rows))};
const env = {
  MESSAGING_ENCRYPTION_KEY: Buffer.alloc(32,9).toString('base64'),
  INSTAGRAM_MESSAGING_PROVIDER:'instagram-login', INSTAGRAM_MESSAGING_APP_ID:'777',
  INSTAGRAM_MESSAGING_CLIENT_SECRET:'fixture-secret', INSTAGRAM_MESSAGING_ACCOUNT_ID:'900',
  INSTAGRAM_MESSAGING_GRAPH_VERSION:'v26.0',
  INSTAGRAM_ADMIN_IDS:'alice', INSTAGRAM_QUEUE:{send:async()=>{}},
};
const scope='instagram-login:777:900';
let follows=true, providerFailure=false, holdReplies=false, uncertainReplies=false;
const logs=[], originalLog=console.log;
console.log=(...args)=>logs.push(args.map(String).join(" "));
const replies=[];
const fetcher=async(url,options={})=>{
  if(providerFailure)throw Error('fixture network failure');
  const path=new URL(url).pathname;
  if(options.method==='POST' && path.endsWith('/messages')) {
    if(holdReplies)return {ok:false,status:429,headers:new Headers({'retry-after':'1'}),json:async()=>({error:{code:4}})};
    if(uncertainReplies)throw Error('uncertain transport');
    replies.push(JSON.parse(options.body));
    return {ok:true,json:async()=>({message_id:randomUUID()})};
  }
  const sender=path.split('/').at(-1);
  return {ok:true,json:async()=>({id:sender,username:'diver'+sender,is_user_follow_business:follows})};
};
try {
  await pg.exec('CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user" (id text PRIMARY KEY,name text,"emailVerified" boolean,banned boolean); CREATE ROLE finfolk_api; GRANT USAGE ON SCHEMA neon_auth TO finfolk_api; GRANT SELECT ON neon_auth."user" TO finfolk_api;');
  for(const name of (await readdir('backend/migrations')).filter(n=>n.endsWith('.sql')).sort())
    await pg.exec(await readFile('backend/migrations/'+name,'utf8'));
  await pg.exec('GRANT USAGE ON SCHEMA finfolk TO finfolk_api');
  await query(`INSERT INTO neon_auth."user" VALUES('alice','Alice',true,false),('bob','Bob',true,false),('unverified','Unverified',false,false),('carol','Carol',true,false),('dave','Dave',true,false)`);
  await query(`INSERT INTO finfolk.members(user_id) VALUES('alice'),('bob'),('unverified'),('carol'),('dave')`);
  await query("INSERT INTO finfolk.invitation_joins(invitee_id,inviter_id) VALUES('alice','carol')");
  await query(`UPDATE finfolk.messaging_accounts SET account_id='900',mode='live',enabled_commands='["help","ping","connect"]',checks='{"authorization":true,"subscription":true,"followLookup":true}',provider_scope=$1,credential_ciphertext=$2 WHERE id='instagram'`,[scope,seal({accessToken:'fixture'},env,scope)]);
  await pg.exec('SET ROLE finfolk_api');
  const app=createAPI({db,verify:async token=>({sub:token}),messagingFetch:fetcher});
  const request=async(uid,code,key=randomUUID(),extra={})=>{
    const response=await app.fetch(new Request('https://api.finfolk.test/v1/me/instagram/connect',{method:'POST',headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json','Idempotency-Key':key,...extra},body:JSON.stringify({code})}),env);
    return {status:response.status,...await response.json()};
  };
  const incoming=async(sender,mid=randomUUID(),text="/connect")=>{
    await collectInstagramDM({sender:{id:sender},recipient:{id:'900'},timestamp:Date.now(),message:{mid,text}},env,query);
    const id='dm:'+scope+':'+mid;
    await processInstagramDM(id,env,db,{fetcher});
    const row=(await query('SELECT * FROM finfolk.messaging_outbox WHERE event_id=$1',[id]))[0];
    return {id,mid,row,code:row?.body_ciphertext ? unseal(row.body_ciphertext,env,'connect:'+id).body.match(/code: ([A-Z0-9]{4}) ([A-Z0-9]{4})/).slice(1).join('') : null};
  };
  for(let i=0;i<100;i++) assert.ok(validConnectCode(generateConnectCode()));
  assert.equal(normalizeConnectCode('abcd-efgh'),'ABCDEFGH');
  assert.equal(validConnectCode('DEMO-CODE'),false);
  const first=await incoming('100');
  assert.ok(first.code); assert.equal(first.row.body,'');
  assert.ok(!JSON.stringify(first.row).includes(first.code));
  assert.equal(first.row.state,'provider_accepted');
  const eventUUID=(await query('SELECT event_id FROM finfolk.instagram_dm_events WHERE id=$1',[first.id]))[0].event_id;
  const adminView=await app.fetch(new Request('https://api.finfolk.test/v1/admin/messaging/events/'+eventUUID,{headers:{Authorization:'Bearer alice'}}),env);
  assert.equal(adminView.status,200);
  assert.ok(!(await adminView.text()).includes(first.code),'Admin event responses contain no code');
  assert.ok(!logs.join(' ').includes(first.code),'Operational logs contain no code');
  const initialReplies=replies.length;
  await incoming('100',first.mid);
  assert.equal(replies.length,initialReplies,'Duplicate webhook does not send a second code');
  assert.equal((await request('unverified',first.code)).status,403);
  const replaced=await incoming('100');
  assert.equal((await request('alice',first.code)).status,400);
  follows=false;
  assert.equal((await request('alice',replaced.code)).status,409);
  const denied=await incoming('101');
  assert.match(denied.row.body,/Please follow/);
  assert.equal(denied.row.state,'provider_accepted'); assert.equal(denied.code,null);
  follows=true;
  providerFailure=true;
  assert.equal((await request('alice',replaced.code)).status,503);
  providerFailure=false;
  const key=randomUUID();
  const connected=await request('alice',replaced.code,key);
  assert.equal(connected.status,200,JSON.stringify(connected)); assert.equal(connected.data.handle,'diver100');
  assert.deepEqual((await request('alice',replaced.code,key)).data,connected.data);
  assert.deepEqual((await request('alice',replaced.code)).data,connected.data,'Same-owner new-key retry is safe');
  assert.equal((await request('bob',replaced.code)).status,400,'Another user cannot redeem a consumed code');
  assert.equal((await incoming('100')).code,null,'Already linked sender receives no transfer code');
  const privacy=(await query("SELECT share_posts,public_points,profile->>'instagram' AS url FROM finfolk.instagram_connections c JOIN finfolk.members m USING(user_id) WHERE user_id='alice'"))[0];
  assert.equal((await query("SELECT count(*)::int AS count FROM finfolk.invitation_joins WHERE invitee_id='alice' AND rewarded_at IS NOT NULL"))[0].count,1,'A verified connection earns its referral once');
  assert.equal(privacy.share_posts,false); assert.equal(privacy.public_points,false); assert.match(privacy.url,/diver100/);
  const competing=await incoming('102');
  const raced=await Promise.all([request('carol',competing.code),request('dave',competing.code)]);
  assert.equal(raced.filter(r=>r.status===200).length,1,'Exactly one competing redemption succeeds');
  const another=await incoming('106');
  assert.equal((await request('alice',another.code)).status,409,'An existing link must be removed explicitly');
  const disconnected=await app.fetch(new Request('https://api.finfolk.test/v1/me/instagram',{method:'DELETE',headers:{Authorization:'Bearer alice','Idempotency-Key':randomUUID()}}),env);
  assert.equal(disconnected.status,200);
  assert.equal((await request('alice',replaced.code)).status,400,'A consumed code cannot restore a disconnected link');
  const reconnect=await incoming('100');
  assert.equal((await request('alice',reconnect.code)).status,200,'A fresh code reconnects after explicit removal');
  const expired=await incoming('103');
  await query("UPDATE finfolk.instagram_connect_codes SET expires_at=now()-interval '1 minute' WHERE code_hash=$1",[digest(expired.code)]);
  assert.equal((await request('bob',expired.code)).status,400);
  const stale=await incoming('104');
  await query("UPDATE finfolk.messaging_accounts SET generation=generation+1 WHERE id='instagram'");
  assert.equal((await request('bob',stale.code)).status,400);
  await incoming('105');await incoming('105');await incoming('105');
  assert.equal((await incoming('105')).code,null,'Issuance is rate limited');
  holdReplies=true;
  const delayed=await incoming('108');
  assert.equal(delayed.row.state,'pending');
  holdReplies=false;
  await query("UPDATE finfolk.messaging_accounts SET backoff_until=null");
  await query("UPDATE finfolk.instagram_connect_codes SET expires_at=now()-interval '1 minute' WHERE code_hash=$1",[digest(delayed.code)]);
  await query("UPDATE finfolk.messaging_outbox SET next_attempt_at=now() WHERE id=$1",[delayed.row.id]);
  await sendOutbox(delayed.row.id,env,db,{fetcher});
  assert.equal((await query('SELECT state FROM finfolk.messaging_outbox WHERE id=$1',[delayed.row.id]))[0].state,'cancelled','Expired codes are never delivered from the queue');
  uncertainReplies=true;
  const uncertain=await incoming('109');
  assert.equal(uncertain.row.state,'uncertain');
  uncertainReplies=false;
  const beforeRetry=replies.length;
  await incoming('109',uncertain.mid);
  assert.equal(replies.length,beforeRetry,'An uncertain code reply is not automatically resent');
  // Failed requests persist their limits, even when no valid challenge is supplied.
  let limited;
  for(let i=0;i<11;i++) limited=await request('bob','ZZZZZZZZ');
  assert.equal(limited.status,429);
  // The runtime role can use the additive tables, but anonymous PUBLIC cannot.
  assert.equal((await query("SELECT has_table_privilege('finfolk_api','finfolk.instagram_connect_codes','INSERT') AS allowed"))[0].allowed,true);
  const status=await app.fetch(new Request('https://api.finfolk.test/v1/me/instagram',{headers:{Authorization:'Bearer alice'}}),env);
  assert.equal((await status.json()).data.capabilities.connect,true);
  const legacy=await app.fetch(new Request('https://api.finfolk.test/v1/me/instagram/claims',{method:'POST',headers:{Authorization:'Bearer bob','Content-Type':'application/json','Idempotency-Key':randomUUID()},body:'{}'}),env);
  assert.equal(legacy.status,410);
  assert.equal((await legacy.json()).error.code,'claim_retired');
  const retired=await incoming('107',randomUUID(),'/claim '+ 'a'.repeat(24));
  assert.match(retired.row.body,/retired.*\/connect/);
  assert.equal(retired.code,null);
  assert.equal((await query("SELECT count(*)::int AS n FROM finfolk.instagram_connections WHERE user_id='bob' AND status='connected'"))[0].n,0);
  const review=await app.fetch(new Request('https://api.finfolk.test/v1/admin/messaging/claim-reviews/'+randomUUID()+'/decision',{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({decision:'approve'})}),env);
  assert.equal(review.status,410,'Legacy manual approval cannot create a link');
  await query("INSERT INTO finfolk.instagram_claims(user_id,code_hash,expires_at,state) VALUES('bob','legacy-unused',now()+interval '1 day','waiting') ON CONFLICT(user_id) DO UPDATE SET state='waiting',code_hash='legacy-unused'");
  const beforeMigration=(await query("SELECT sender_id,identity_version,status FROM finfolk.instagram_connections WHERE user_id='alice'"))[0];
  await query("INSERT INTO finfolk.instagram_connections(user_id,handle,status,challenge_hash,expires_at) VALUES('bob','legacybob','pending','legacy-hash',now()+interval '1 day') ON CONFLICT(user_id) DO UPDATE SET status='pending',challenge_hash='legacy-hash',expires_at=now()+interval '1 day'");
  await pg.exec(await readFile('backend/migrations/0017_retire_instagram_claims.sql','utf8'));
  await pg.exec(await readFile('backend/migrations/0018_retire_manual_instagram_challenges.sql','utf8'));
  const retiredManual=(await query("SELECT status,challenge_hash,expires_at FROM finfolk.instagram_connections WHERE user_id='bob'"))[0];
  assert.deepEqual(retiredManual,{status:'disconnected',challenge_hash:null,expires_at:null});
  assert.deepEqual((await query("SELECT sender_id,identity_version,status FROM finfolk.instagram_connections WHERE user_id='alice'"))[0],beforeMigration);
  assert.equal((await query("SELECT code_hash FROM finfolk.instagram_claims WHERE user_id='bob'"))[0].code_hash,null);
  for(let i=0;i<11;i++) {
    const response=await app.fetch(new Request('https://api.finfolk.test/v1/me/instagram/connect',{method:'POST',headers:{Authorization:'Bearer '+(i%2?'carol':'dave'),'Content-Type':'application/json','Idempotency-Key':randomUUID(),'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({code:'ZZZZZZZZ'})}),{...env,HYPERDRIVE:{}});
    assert.equal(response.status,i<10?400:429,'Trusted IP limits span member identities');
  }
  await query("UPDATE finfolk.messaging_accounts SET enabled_commands='[\"help\",\"ping\"]'");
  assert.equal((await request('alice',replaced.code)).status,503);
  originalLog('INSTAGRAM_CONNECT_SQL_PASS: real migrations, encrypted durable replies, duplicate receipts, follower/email gates, replacement/expiry, ownership, retries, competing redemption, privacy and persistent limits.');
} finally { console.log=originalLog; await pg.close(); }
