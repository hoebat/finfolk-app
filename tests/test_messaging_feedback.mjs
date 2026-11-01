import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { collectInstagramDM, processInstagramDM, sendOutbox, reconcileInstagramDM } from '../backend/messaging-engine.mjs';
import { seal } from '../backend/messaging-config.mjs';
import { processingTimeoutReply } from '../backend/messaging-feedback.mjs';
import { createAPI } from '../backend/api.mjs';

const pg = new PGlite();
const q = async (sql, values = []) => (await pg.query(sql, values)).rows;
const db = { query: q, transaction: fn => pg.transaction(tx => fn(async (sql, values = []) => (await tx.query(sql, values)).rows)) };
const env = {
  MESSAGING_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  INSTAGRAM_MESSAGING_PROVIDER: 'instagram-facebook', INSTAGRAM_MESSAGING_META_APP_ID: '777',
  INSTAGRAM_MESSAGING_META_APP_SECRET: 'fixture-secret', INSTAGRAM_MESSAGING_PAGE_ID: '555',
  INSTAGRAM_MESSAGING_ACCOUNT_ID: '900', INSTAGRAM_MESSAGING_GRAPH_VERSION: 'v26.0',
  INSTAGRAM_DM_FEEDBACK_ENABLED: 'true', INSTAGRAM_QUEUE: { send: async () => {} },
  INSTAGRAM_ADMIN_IDS: 'admin',
};
const scope = 'instagram-facebook:777:900';
let calls = [], profileCalls = 0, follows = true, actionFailure = false, messageFailure = false,
  rateLimit = false, timeoutProfileAt = 0, posts = 0;
const fetcher = async (input, options = {}) => {
  const url = new URL(input);
  assert.equal(url.hostname, 'graph.facebook.com');
  assert.equal(options.headers.Authorization, 'Bearer fixture');
  assert.equal(url.searchParams.has('access_token'), false);
  if (options.method === 'POST') {
    const body = JSON.parse(options.body);
    assert.equal(body.recipient.id, '100');
    if (body.sender_action) {
      assert.deepEqual(Object.keys(body).sort(), ['recipient','sender_action']);
      calls.push(body.sender_action);
      if (actionFailure) throw Error('fixture-secret must not be logged');
      return Response.json({ recipient_id: '100' });
    }
    posts++;
    calls.push(body.message.text);
    if (messageFailure) throw new DOMException('Uncertain message POST', 'TimeoutError');
    if (rateLimit) return Response.json({ error: { code: 4 } }, { status: 429, headers: { 'retry-after': '1' } });
    return Response.json({ message_id: 'reply-' + posts });
  }
  profileCalls++;
  if (timeoutProfileAt && profileCalls >= timeoutProfileAt)
    throw new DOMException('Fixture profile timeout', 'TimeoutError');
  return Response.json({ id: '100', username: 'diver', is_user_follow_business: follows });
};
const reset = async () => {
  calls = []; profileCalls = posts = 0; follows = true; actionFailure = messageFailure = rateLimit = false; timeoutProfileAt = 0;
  await q('DELETE FROM finfolk.instagram_dm_events');
  await q('DELETE FROM finfolk.instagram_connect_codes');
  await q('DELETE FROM finfolk.instagram_connect_limits');
  await q('DELETE FROM finfolk.instagram_dm_limits');
  await q(`UPDATE finfolk.messaging_accounts SET mode='live',generation=1,enabled_commands='["ping","help","connect","checkin","status"]',
    pilot_sender_ids='[]',backoff_until=null,checks='{"authorization":true,"subscription":true,"liveDelivery":true}'`);
};
const incoming = async (text = '/ping', mid = randomUUID()) => {
  await collectInstagramDM({ sender: { id: '100' }, recipient: { id: '900' }, timestamp: Date.now(), message: { mid, text } }, env, q);
  return 'dm:' + scope + ':' + mid;
};
const result = async id => (await q('SELECT * FROM finfolk.messaging_outbox WHERE event_id=$1',[id]))[0];
const logs = [], originalLog = console.log;
console.log = (...args) => logs.push(args.map(String).join(' '));
try {
  await pg.exec('CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id text PRIMARY KEY,name text,"emailVerified" boolean,banned boolean); CREATE ROLE finfolk_api; GRANT USAGE ON SCHEMA neon_auth TO finfolk_api; GRANT SELECT ON neon_auth."user" TO finfolk_api;');
  for (const name of (await readdir('backend/migrations')).filter(n => n.endsWith('.sql')).sort())
    await pg.exec(await readFile('backend/migrations/' + name, 'utf8'));
  await pg.exec('GRANT USAGE ON SCHEMA finfolk TO finfolk_api');
  await q(`UPDATE finfolk.messaging_accounts SET account_id='900',provider_scope=$1,credential_ciphertext=$2`,[scope,seal({ accessToken: 'fixture' },env,scope)]);
  await q(`INSERT INTO neon_auth."user" VALUES('admin','Admin',true,false)`);
  await q("INSERT INTO finfolk.members(user_id) VALUES('admin')");
  await pg.exec('SET ROLE finfolk_api');
  await reset();

  let id = await incoming();
  await processInstagramDM(id,env,db,{fetcher});
  assert.equal((await result(id)).state,'provider_accepted');
  assert.deepEqual(calls.slice(0,2),['mark_seen','typing_on']);
  assert.equal(calls.length,4); assert.equal(calls.at(-1),'typing_off');
  const count = calls.length;
  await processInstagramDM(id,env,db,{fetcher});
  assert.equal(calls.length,count,'Duplicate events do not repeat sender actions or replies');
  await reset();
  id = await incoming('/help');
  await Promise.all([processInstagramDM(id,env,db,{fetcher}),processInstagramDM(id,env,db,{fetcher})]);
  assert.equal(posts,1); assert.equal(calls.filter(v => v==='mark_seen').length,1);

  await reset(); actionFailure = true;
  id = await incoming();
  await processInstagramDM(id,env,db,{fetcher});
  assert.equal((await result(id)).state,'provider_accepted','Sender-action failure does not lose a reply');
  assert.ok(!logs.join(' ').includes('fixture-secret'));
  await reset(); follows = false;
  id = await incoming('/connect');
  await processInstagramDM(id,env,db,{fetcher});
  assert.match((await result(id)).body,/Please follow/);
  assert.equal((await q('SELECT * FROM finfolk.instagram_connect_codes')).length,0);

  await reset(); timeoutProfileAt = 1;
  id = await incoming('/connect');
  await processInstagramDM(id,env,db,{fetcher});
  let outbox = await result(id);
  assert.equal(outbox.body,processingTimeoutReply);
  assert.equal(outbox.state,'provider_accepted');
  assert.equal(profileCalls,1,'A public timeout notice does not need the failing follow lookup');
  assert.equal(posts,1);
  assert.equal((await q('SELECT * FROM finfolk.instagram_connect_codes')).length,0);
  await processInstagramDM(id,env,db,{fetcher});
  assert.equal(posts,1,'A timeout is terminal for the original command');

  await reset();
  let delayed = true;
  const delayedDB = { ...db, transaction: fn => pg.transaction(tx => fn(async (sql, values = []) => {
    const rows = (await tx.query(sql,values)).rows;
    if (delayed && sql.includes("set_config('statement_timeout'")) {
      delayed = false;
      await new Promise(resolve => setTimeout(resolve,60));
    }
    return rows;
  })) };
  id = await incoming('/ping');
  await processInstagramDM(id,env,delayedDB,{fetcher,processingTimeoutMs:40});
  assert.equal((await result(id)).body,processingTimeoutReply,'The total processing deadline fences a late result');
  assert.equal((await q('SELECT * FROM finfolk.messaging_outbox WHERE event_id=$1',[id])).length,1);
  const timeoutPing = (await q('SELECT event_id FROM finfolk.instagram_dm_events WHERE id=$1',[id]))[0].event_id;
  const help = await incoming('/help');
  await processInstagramDM(help,env,db,{fetcher});
  const helpId = (await q('SELECT event_id FROM finfolk.instagram_dm_events WHERE id=$1',[help]))[0].event_id;
  const app = createAPI({db,verify:async token => ({sub:token}),messagingFetch:fetcher});
  const activation = await app.fetch(new Request('https://api.finfolk.test/v1/admin/messaging/instagram',{
    method:'PUT',headers:{Authorization:'Bearer admin','Content-Type':'application/json','Idempotency-Key':randomUUID()},
    body:JSON.stringify({mode:'pilot',enabledCommands:['ping','help'],pilotSenderIds:['100'],acceptance:{pingEventId:timeoutPing,helpEventId:helpId,visibleRepliesConfirmed:true}}),
  }),env);
  assert.equal(activation.status,409,'A generic timeout notice cannot pass real-command rollout acceptance');
  assert.equal((await activation.json()).error.code,'acceptance_missing');

  // The initial command can finish but its final follower preflight can time
  // out. Replace an unsent result safely and invalidate any undelivered code.
  await reset(); timeoutProfileAt = 2;
  id = await incoming('/connect');
  await processInstagramDM(id,env,db,{fetcher});
  outbox = await result(id);
  assert.equal(outbox.body,processingTimeoutReply); assert.equal(outbox.body_ciphertext,null);
  assert.equal(outbox.state,'provider_accepted'); assert.equal(outbox.reply_kind,'text');
  assert.equal((await q('SELECT invalidated FROM finfolk.instagram_connect_codes'))[0].invalidated,true);
  assert.equal(posts,1);

  // Simulate cancellation after a SQL effect, rather than racing an uncancelled
  // promise. The transaction must roll back before the fallback is persisted.
  await reset();
  let interrupt = true;
  const slowDB = { ...db, transaction: fn => pg.transaction(tx => fn(async (sql, values = []) => {
    const rows = (await tx.query(sql,values)).rows;
    if (interrupt && sql.includes('INSERT INTO finfolk.instagram_connect_codes')) {
      interrupt = false;
      throw Object.assign(Error('cancelled fixture statement'),{code:'57014'});
    }
    return rows;
  })) };
  id = await incoming('/connect');
  await processInstagramDM(id,env,slowDB,{fetcher});
  assert.equal((await result(id)).body,processingTimeoutReply);
  assert.equal((await q('SELECT * FROM finfolk.instagram_connect_codes')).length,0,'Cancelled commands leave no partial code/effect');
  assert.equal(posts,1);

  await reset();
  id = await incoming('/connect');
  await q("UPDATE finfolk.instagram_dm_events SET processing_state='processing',attempts=5,lease=$2,updated_at=now()-interval '3 minutes' WHERE id=$1",[id,randomUUID()]);
  await reconcileInstagramDM(env,q);
  await processInstagramDM(id,env,db,{fetcher});
  assert.equal((await result(id)).body,processingTimeoutReply,'Interrupted workers produce a reply instead of rerunning a possibly abandoned command');
  assert.equal((await q('SELECT * FROM finfolk.instagram_connect_codes')).length,0);

  await reset();
  id = await incoming('/connect');
  await q("UPDATE finfolk.instagram_dm_events SET created_at=now()-interval '2 minutes' WHERE id=$1",[id]);
  await processInstagramDM(id,env,db,{fetcher});
  assert.equal((await result(id)).body,processingTimeoutReply,'A stale queue receipt gets a retry reply rather than executing a late command');
  assert.equal((await q('SELECT * FROM finfolk.instagram_connect_codes')).length,0);

  await reset(); messageFailure = true;
  id = await incoming();
  await processInstagramDM(id,env,db,{fetcher});
  assert.equal((await result(id)).state,'uncertain');
  await processInstagramDM(id,env,db,{fetcher});
  assert.equal(posts,1,'An uncertain message POST never triggers another reply or fallback');

  await reset(); rateLimit = true;
  id = await incoming();
  await processInstagramDM(id,env,db,{fetcher});
  outbox = await result(id); assert.equal(outbox.state,'pending');
  rateLimit = false; calls = [];
  await q('UPDATE finfolk.messaging_accounts SET backoff_until=null');
  await q("UPDATE finfolk.messaging_outbox SET next_attempt_at=now() WHERE id=$1",[outbox.id]);
  await sendOutbox(outbox.id,env,db,{fetcher});
  assert.equal((await result(id)).state,'provider_accepted');
  assert.equal(calls[0],'typing_on','Delayed replies show typing before delivery too');
  assert.equal(calls.at(-1),'typing_off');

  await reset();
  id = await incoming();
  await q("UPDATE finfolk.messaging_accounts SET mode='disabled'");
  await processInstagramDM(id,env,db,{fetcher});
  assert.deepEqual(calls,[],'A paused rollout sends no actions or reply');
  originalLog('MESSAGING_FEEDBACK_SQL_PASS: seen/typing order, failed actions, duplicate and concurrent events, follower guidance, bounded timeout fallback, rollback, interrupted-worker recovery, final-preflight timeout, rate retry and uncertain-send protection.');
} finally { console.log = originalLog; await pg.close(); }
