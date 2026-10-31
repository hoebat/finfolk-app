// Deployed smoke test: creates temporary, unverified users, never changes email-verification state.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { database } from '../backend/db.mjs';
const auth = process.env.NEON_AUTH_BASE_URL,
  api = process.env.NEON_API_URL || 'https://api.finfolk.com.au/',
  db = database(process.env.DATABASE_URL),
  users = [];
if (!auth || new URL(api).protocol !== 'https:')
  throw Error('Production Auth and HTTPS API URLs are required.');
async function authRequest(
  path,
  body,
  cookie,
  origin = 'https://finfolk.com.au',
) {
  const r = await fetch(auth + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return {
    data,
    cookie: r.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  };
}
async function register(label) {
  const email = `finfolk-deploy-${label}-${randomBytes(5).toString('hex')}@example.com`,
    password = randomBytes(18).toString('base64url'),
    result = await authRequest('/sign-up/email', {
      email,
      password,
      name: 'Deployment test',
    }),
    user = { id: result.data.user.id, email, password, cookie: result.cookie };
  users.push(user);
  user.token = (await authRequest('/token', null, user.cookie)).data.token;
  return user;
}
async function call(
  user,
  action,
  data = {},
  status = 200,
  origin = 'https://finfolk.com.au',
) {
  const r = await fetch(new URL('api', api), {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(user ? { Authorization: 'Bearer ' + user.token } : {}),
      },
      body: JSON.stringify({ action, ...data }),
    }),
    body = await r.json();
  assert.equal(r.status, status, JSON.stringify(body));
  assert.equal(r.headers.get('access-control-allow-origin'), origin);
  assert.match(r.headers.get('cache-control'), /no-store/);
  return body.data;
}
try {
  const publicFeed=await fetch(new URL('instagram/posts?beachId=bondi',api),{headers:{Origin:'https://finfolk.com.au'}});
  assert.equal(publicFeed.status,200);const feed=await publicFeed.json();assert.ok(Array.isArray(feed.posts));assert.equal(typeof feed.activity.collecting,'boolean');
  const invalidCursor=await fetch(new URL('instagram/posts?beachId=bondi&cursor=invalid',api));assert.equal(invalidCursor.status,400);
  console.log('Public Instagram feed and invalid-cursor rejection passed.');
  for (const origin of [
    'https://finfolk.com.au',
    'https://www.finfolk.com.au',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
  ])
    await call(null, 'me', {}, 401, origin);
  console.log(
    'Production and localhost: CORS passed; unauthenticated requests denied.',
  );
  const alice = await register('alice'),
    bob = await register('bob');
  await call(alice, 'me');
  await call(bob, 'me');
  const instagram = await call(alice, 'instagramStatus');
  assert.equal(instagram.admin, false);
  assert.equal(typeof instagram.enabled, 'boolean');
  assert.deepEqual(await call(alice, 'instagramActions'), []);
  await call(alice, 'instagramAdminInbox', {}, 403);
  await call(alice, 'instagramConnect', {handle:'temporary_test'}, instagram.setupReady ? 403 : 503);
  console.log('Instagram Actions: member status, private action list, admin denial and connection rollout gate passed.');
  await call(alice, 'preferences', {
    profile: {
      displayName: 'Temporary deployment test',
      open: false,
      sharing: {},
      beaches: ['bondi'],
    },
  });
  assert.equal(
    (await call(alice, 'me', {}, 200, 'http://localhost:8000')).profile
      .displayName,
    'Temporary deployment test',
  );
  const session = await call(alice, 'saveSession', {
    values: {
      date: new Date().toISOString().slice(0, 10),
      locationName: 'Bondi',
      beachId: 'bondi',
      durationMinutes: 10,
      maxDepthMetres: 5,
      notes: 'Temporary smoke test',
    },
  });
  assert.equal(
    (await call(alice, 'session', { id: session.id })).notes,
    'Temporary smoke test',
  );
  await call(bob, 'session', { id: session.id }, 404);
  await call(alice, 'checkin', { beachId: 'bondi' }, 403);
  console.log(
    'Cloudflare → Hyperdrive → Neon: profile and private session round trips passed; cross-user reads and unverified check-ins denied.',
  );
  for (const origin of ['https://finfolk.com.au', 'http://localhost:8000']) {
    const login = await authRequest(
      '/sign-in/email',
      { email: alice.email, password: alice.password },
      null,
      origin,
    );
    assert.equal(login.data.user.id, alice.id);
    const restored = await authRequest(
      '/get-session',
      null,
      login.cookie,
      origin,
    );
    assert.equal(restored.data.user.id, alice.id);
    await authRequest('/sign-out', {}, login.cookie, origin);
  }
  console.log(
    'Neon Auth: signup, sign-in, session restoration and sign-out passed for production and localhost origins.',
  );
  console.log('DEPLOYED_FINFOLK_API_PASS');
} finally {
  for (const u of users) {
    await db.query('DELETE FROM finfolk.members WHERE user_id=$1', [u.id]);
    await db.query('DELETE FROM neon_auth."user" WHERE id::text=$1', [u.id]);
  }
  await db.pool.end();
}
