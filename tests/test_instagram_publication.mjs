// Exercise the real publication SQL and restricted runtime role without Meta or
// a production database. Provider callbacks simulate changes during verification.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createAPI } from '../backend/api.mjs';
import { postAction } from '../backend/posts.mjs';
import { discoveryAction, ingestInstagramMedia, publicInstagramFeed } from '../backend/instagram-discovery.mjs';
import { instagramAction } from '../backend/instagram-actions.mjs';
import { instagramFollowerProof } from '../backend/instagram-eligibility.mjs';
import { seal } from '../backend/messaging-config.mjs';

const pg = new PGlite();
const q = async (sql, values = []) => (await pg.query(sql, values)).rows;
const db = { query: q, transaction: fn => pg.transaction(tx => fn(async (sql, values = []) => (await tx.query(sql, values)).rows)) };
const scope = 'instagram-login:777:900';
const env = {
  MESSAGING_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
  INSTAGRAM_MESSAGING_APP_ID: '777', INSTAGRAM_MESSAGING_ACCOUNT_ID: '900',
  INSTAGRAM_MESSAGING_GRAPH_VERSION: 'v26.0', INSTAGRAM_ADMIN_IDS: 'admin',
  COMMUNITY_POSTS_ENABLED: 'true', INSTAGRAM_PUBLICATION_ENABLED: 'true',
};
let follows = true, failure = false, missingFollow = false, duringProfile = null, profileCalls = 0;
const fetcher = async url => {
  profileCalls++;
  assert.equal(new URL(url).pathname.split('/').at(-1), '100', 'Approval verifies the owner, never the reviewing administrator');
  if (failure) throw Error('Fixture provider unavailable');
  const mutation = duringProfile;
  duringProfile = null;
  if (mutation) await mutation();
  return Response.json({ id: '100', username: 'diver', ...(!missingFollow && { is_user_follow_business: follows }) });
};
const submission = { beachId: 'bondi', url: 'https://www.instagram.com/p/Test/', creatorHandle: 'diver', ownPost: true, tagged: true, publicConsent: true };
const approval = id => ({ id, decision: 'approved', ownershipChecked: true, tagChecked: true, beachChecked: true });
const post = (action, v, uid = 'owner', settings = env) => postAction({ action, v, uid, env: settings, q, verified: () => {}, beach: async id => ({ id }), fetcher });
const discovery = (action, v, uid = 'owner') => discoveryAction({ action, v, uid, env, q, fetcher });
const root = async fn => {
  await pg.exec('RESET ROLE');
  try { return await fn(); } finally { await pg.exec('SET ROLE finfolk_api'); }
};
const reset = async () => {
  follows = true; failure = missingFollow = false; duringProfile = null;
  await q('DELETE FROM finfolk.posts');
  await q('DELETE FROM finfolk.instagram_discoveries');
  await q('DELETE FROM finfolk.instagram_suppressed_sources');
  await q('DELETE FROM finfolk.instagram_connections');
  await q('UPDATE finfolk.members SET deleted=false');
  await root(() => q('UPDATE neon_auth."user" SET "emailVerified"=true,banned=false'));
  await q(`UPDATE finfolk.messaging_accounts SET mode='pilot',pilot_sender_ids='["100"]',provider_scope=$1,
    checks='{"authorization":true,"subscription":true,"liveDelivery":true}',credential_ciphertext=$2,token_expires_at=now()+interval '1 day'`, [scope, seal({ accessToken: 'fixture' }, env, scope)]);
  await q(`INSERT INTO finfolk.instagram_connections(user_id,handle,sender_id,status,provider_scope,media_owner_id,share_posts)
    VALUES('owner','diver','100','connected',$1,'200',true)`, [scope]);
};
const pendingPost = async () => (await q(`INSERT INTO finfolk.posts(owner_id,beach_id,url,platform,creator_handle,public_consent)
  VALUES('owner','bondi',$1,'instagram','diver',true) RETURNING id`, ['https://www.instagram.com/p/' + randomUUID()]))[0];
let serial = 1000;
const media = extra => ({ id: String(++serial), permalink: 'https://www.instagram.com/p/Media' + serial + '/', owner: { id: '200' }, username: 'diver', caption: 'Bondi Beach', timestamp: new Date().toISOString(), ...extra });
const pendingDiscovery = () => ingestInstagramMedia(media(), 'tags', env, q, { forceReview: true, fetcher });
const approveDiscovery = id => discovery('instagramReviewPost', { id, beachId: 'bondi', mode: 'approve' }, 'admin');

try {
  await pg.exec('CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id text PRIMARY KEY,name text,"emailVerified" boolean,banned boolean); CREATE ROLE finfolk_api; GRANT USAGE ON SCHEMA neon_auth TO finfolk_api; GRANT SELECT ON neon_auth."user" TO finfolk_api;');
  for (const name of (await readdir('backend/migrations')).filter(n => n.endsWith('.sql')).sort())
    await pg.exec(await readFile('backend/migrations/' + name, 'utf8'));
  await pg.exec('GRANT USAGE ON SCHEMA finfolk TO finfolk_api');
  await q(`INSERT INTO neon_auth."user" VALUES('owner','Owner',true,false),('admin','Admin',true,false),('other','Other',true,false)`);
  await q(`INSERT INTO finfolk.members(user_id) VALUES('owner'),('admin'),('other')`);
  await q("INSERT INTO finfolk.beaches(id,name,timezone) VALUES('bondi','Bondi Beach','Australia/Sydney')");
  await pg.exec('SET ROLE finfolk_api');
  await reset();

  // API authentication and the dependency-injected provider path are exercised.
  const app = createAPI({ db, verify: async token => ({ sub: token }), messagingFetch: fetcher });
  const call = async (uid, action, values = {}) => {
    const response = await app.fetch(new Request('https://api.finfolk.test/api', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(uid && { Authorization: 'Bearer ' + uid }) }, body: JSON.stringify({ action, ...values }) }), env);
    return { status: response.status, ...await response.json() };
  };
  assert.equal((await call(null, 'post', submission)).status, 401);
  assert.equal((await call('other', 'reviewPost', approval(randomUUID()))).status, 403);
  const submitted = await call('owner', 'post', submission);
  assert.equal(submitted.status, 200, JSON.stringify(submitted));
  assert.equal(submitted.data.status, 'pending');
  await assert.rejects(post('post', submission), e => e.status === 409);
  await assert.rejects(post('post', { ...submission, creatorHandle: 'imposter' }), e => e.code === 'instagram_owner_mismatch');
  await assert.rejects(post('post', { ...submission, publicConsent: false }), /Confirm/);
  const originalCalls = profileCalls;
  await assert.rejects(post('post', submission, 'owner', {}), e => e.status === 503);
  assert.equal(profileCalls, originalCalls);

  for (const state of ['nonfollower', 'unknown', 'provider-failure', 'disconnected', 'unverified', 'banned', 'deleted']) {
    await reset();
    const candidate = await pendingPost();
    if (state === 'nonfollower') follows = false;
    if (state === 'unknown') missingFollow = true;
    if (state === 'provider-failure') failure = true;
    if (state === 'disconnected') await q("UPDATE finfolk.instagram_connections SET status='disconnected'");
    if (state === 'unverified') await root(() => q('UPDATE neon_auth."user" SET "emailVerified"=false WHERE id=\'owner\''));
    if (state === 'banned') await root(() => q('UPDATE neon_auth."user" SET banned=true WHERE id=\'owner\''));
    if (state === 'deleted') await q("UPDATE finfolk.members SET deleted=true WHERE user_id='owner'");
    await assert.rejects(post('post', submission), e => [403, 503].includes(e.status), state + ' submission');
    await assert.rejects(post('reviewPost', approval(candidate.id), 'admin'), e => [403, 503].includes(e.status), state + ' admin approval');
    assert.equal((await q('SELECT status FROM finfolk.posts WHERE id=$1', [candidate.id]))[0].status, 'pending');
    assert.equal((await q('SELECT * FROM finfolk.post_reviews')).length, 0);
  }

  // Every mutation happens after provider verification starts and before its
  // response reaches the effect. The final SQL must reject the old evidence.
  const connectionRaces = [
    "UPDATE finfolk.instagram_connections SET identity_version=gen_random_uuid()",
    "UPDATE finfolk.instagram_connections SET provider_scope='changed'",
    "UPDATE finfolk.instagram_connections SET sender_id='101'",
    "UPDATE finfolk.instagram_connections SET handle='renamed'",
    "UPDATE finfolk.instagram_connections SET status='disconnected'",
    "UPDATE finfolk.members SET deleted=true WHERE user_id='owner'",
    "UPDATE finfolk.messaging_accounts SET mode='disabled'",
    "UPDATE finfolk.messaging_accounts SET checks='{}'",
    "UPDATE finfolk.messaging_accounts SET pilot_sender_ids='[]'",
  ];
  for (const sql of connectionRaces) {
    await reset();
    duringProfile = () => q(sql);
    await assert.rejects(post('post', submission), e => e.status === 409, sql);
    assert.equal((await q('SELECT * FROM finfolk.posts')).length, 0);
    await reset();
    const candidate = await pendingPost();
    duringProfile = () => q(sql);
    await assert.rejects(post('reviewPost', approval(candidate.id), 'admin'), e => e.status === 409, sql);
    assert.equal((await q('SELECT status FROM finfolk.posts WHERE id=$1', [candidate.id]))[0].status, 'pending');
  }
  for (const mutation of [
    () => q('UPDATE finfolk.posts SET public_consent=false'),
    () => q("UPDATE finfolk.posts SET creator_handle='someone_else'"),
    () => q("UPDATE finfolk.posts SET platform='tiktok'"),
    () => q("UPDATE finfolk.posts SET owner_id='other'"),
    () => root(() => q('UPDATE neon_auth."user" SET banned=true WHERE id=\'owner\'')),
  ]) {
    await reset();
    const candidate = await pendingPost();
    duringProfile = mutation;
    await assert.rejects(post('reviewPost', approval(candidate.id), 'admin'), e => e.status === 409);
    assert.equal((await q('SELECT status FROM finfolk.posts WHERE id=$1', [candidate.id]))[0].status, 'pending');
  }

  await reset();
  let candidate = await pendingPost();
  assert.equal((await call('admin', 'reviewPost', approval(candidate.id))).status, 200);
  follows = false;
  await post('removePost', { id: candidate.id });
  assert.equal((await q('SELECT public_consent FROM finfolk.posts WHERE id=$1', [candidate.id]))[0].public_consent, false);
  await reset();
  const beforeTikTok = profileCalls;
  const tiktok = await post('post', { ...submission, url: 'https://www.tiktok.com/@other/video/123', creatorHandle: 'other' }, 'other');
  await post('reviewPost', approval(tiktok.id), 'admin');
  assert.equal(profileCalls, beforeTikTok, 'TikTok posts do not require an Instagram connection');

  // Auto publication and administrator discovery review share the same policy.
  await reset();
  assert.equal((await ingestInstagramMedia(media(), 'tags', env, q, { fetcher })).state, 'published');
  candidate = await pendingDiscovery();
  follows = false;
  await assert.rejects(approveDiscovery(candidate.id), e => e.code === 'instagram_follow_required');
  follows = true;
  await approveDiscovery(candidate.id);
  assert.equal((await publicInstagramFeed(q, 'bondi')).posts.length, 2);
  await discovery('instagramSharing', { enabled: false });
  assert.equal((await publicInstagramFeed(q, 'bondi')).posts.length, 0, 'Sharing withdrawal hides admin-reviewed posts too');
  candidate = await pendingDiscovery();
  await assert.rejects(approveDiscovery(candidate.id), e => e.code === 'instagram_sharing_required');
  await reset();
  candidate = await ingestInstagramMedia(media({ owner: undefined }), 'tags', env, q, { forceReview: true });
  await assert.rejects(approveDiscovery(candidate.id), e => e.status === 403, 'Admin cannot bypass missing owner evidence');

  for (const sql of [...connectionRaces,
    'UPDATE finfolk.instagram_connections SET share_posts=false',
    "UPDATE finfolk.instagram_connections SET media_owner_id='201'",
    "UPDATE finfolk.instagram_discoveries SET state='hidden'",
    "UPDATE finfolk.instagram_discoveries SET owner_id='other'",
    "UPDATE finfolk.instagram_discoveries SET author_id='201'",
    "INSERT INTO finfolk.instagram_suppressed_sources(author_id) VALUES('200')",
  ]) {
    await reset();
    candidate = await pendingDiscovery();
    duringProfile = () => q(sql);
    await assert.rejects(approveDiscovery(candidate.id), e => e.status === 409, sql);
    assert.notEqual((await q('SELECT state FROM finfolk.instagram_discoveries WHERE id=$1', [candidate.id]))[0].state, 'published');
  }
  for (const sql of ["UPDATE finfolk.instagram_connections SET media_owner_id='201'", 'UPDATE finfolk.instagram_connections SET identity_version=gen_random_uuid()', 'UPDATE finfolk.instagram_connections SET share_posts=false']) {
    await reset();
    duringProfile = () => q(sql);
    assert.equal((await ingestInstagramMedia(media(), 'tags', env, q, { fetcher })).state, 'pending', sql);
  }
  await reset();
  const stale = await instagramFollowerProof('owner', env, q, { fetcher });
  stale.checkedAt -= 31000;
  assert.equal((await ingestInstagramMedia(media(), 'tags', env, q, { followerProof: stale })).state, 'pending');
  candidate = await pendingDiscovery();
  await discovery('instagramHidePost', { id: candidate.id });
  await assert.rejects(approveDiscovery(candidate.id), /Only pending/);

  await reset();
  const manual = await post('post', submission);
  await post('reviewPost', approval(manual.id), 'admin');
  candidate = await pendingDiscovery();
  await approveDiscovery(candidate.id);
  await instagramAction({ action: 'instagramDisconnect', v: {}, uid: 'owner', env, q, db });
  assert.equal((await q('SELECT status,public_consent FROM finfolk.posts WHERE id=$1', [manual.id]))[0].status, 'removed');
  assert.equal((await q('SELECT state FROM finfolk.instagram_discoveries WHERE id=$1', [candidate.id]))[0].state, 'hidden');
  assert.equal((await publicInstagramFeed(q, 'bondi')).posts.length, 0);
  console.log('INSTAGRAM_PUBLICATION_SQL_PASS: restricted-role manual/admin/automatic publication, current follower and ownership gates, consent withdrawal, provider failures, unlink/relink and verification races, TikTok independence.');
} finally { await pg.close(); }
