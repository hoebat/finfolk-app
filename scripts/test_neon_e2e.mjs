// Real Neon Auth + Postgres integration. Run only against the isolated test branch.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { database } from '../backend/db.mjs';
import { createAPI, managedVerifier } from '../backend/api.mjs';
if (process.env.NEON_BRANCH !== 'finfolk-regulars-dev')
  throw Error('This test requires the finfolk-regulars-dev Neon branch.');
const base = process.env.NEON_AUTH_BASE_URL,
  db = database(process.env.DATABASE_URL),
  api = createAPI({ db, verify: managedVerifier(process.env) }),
  created = [];
async function account(label) {
  const email = `finfolk-e2e-${label}-${randomBytes(5).toString('hex')}@example.com`,
    password = randomBytes(18).toString('base64url');
  const response = await fetch(base + '/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:8000',
    },
    body: JSON.stringify({ email, password, name: 'E2E ' + label }),
  });
  const data = await response.json();
  if (!response.ok) throw Error('Neon Auth signup: ' + JSON.stringify(data));
  created.push(data.user.id);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const tokenResponse = await fetch(base + '/token', {
      headers: { Cookie: cookie, Origin: 'http://localhost:8000' },
    }),
    tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.token)
    throw Error('Neon Auth token: ' + JSON.stringify(tokenData));
  return { id: data.user.id, email, password, cookie, token: tokenData.token };
}
async function call(who, action, data = {}, status = 200) {
  const request = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(who ? { Authorization: 'Bearer ' + who.token } : {}),
    },
    body: JSON.stringify({ action, ...data }),
  };
  const response = process.env.NEON_TEST_API_URL
    ? await fetch(new URL('api', process.env.NEON_TEST_API_URL), request)
    : await api.request('http://localhost:8787/api', request);
  const value = await response.json();
  assert.equal(response.status, status, JSON.stringify(value));
  return value.data;
}
try {
  console.log('Postgres:', await db.query('SELECT 1 AS connected'));
  await call(null, 'me', {}, 401);
  console.log('Unauthenticated access denied: 401');
  const alice = await account('alice'),
    bob = await account('bob');
  console.log('Neon Auth: two real users signed up and issued verified JWTs');
  await call(alice, 'me');
  await call(bob, 'me');
  await call(alice, 'checkin', { beachId: 'bondi' }, 403);
  console.log('Unverified check-in denied: 403');
  // Controlled test users only. No email is marked verified in production.
  for (const user of [alice, bob])
    await db.query(
      'UPDATE neon_auth."user" SET "emailVerified"=true WHERE id::text=$1',
      [user.id],
    );
  const profile = {
    displayName: 'Test diver',
    open: true,
    beaches: ['bondi'],
    activities: ['freediving'],
    availability: ['weekend mornings'],
    sharing: { visits: true, dives: true, depth: false },
  };
  for (const user of [alice, bob]) await call(user, 'preferences', { profile });
  const check = await call(alice, 'checkin', { beachId: 'bondi' });
  await call(alice, 'checkin', { beachId: 'bondi' });
  assert.equal((await call(alice, 'myCheckins')).length, 1);
  await call(bob, 'checkin', { beachId: 'bondi' });
  const own = await call(alice, 'saveSession', {
    values: {
      date: check.day,
      locationName: 'Bondi',
      beachId: 'bondi',
      durationMinutes: 40,
      maxDepthMetres: 10,
      notes: 'Private',
    },
  });
  await call(bob, 'session', { id: own.id }, 404);
  assert.deepEqual(
    (await call(bob, 'stats', { target: alice.id, beachId: 'bondi' })).stats,
    {},
  );
  for (const user of [alice, bob])
    for (const offset of [1, 2, 3, 4])
      await db.query(
        'INSERT INTO finfolk.checkins(user_id,beach_id,visit_day) VALUES($1,$2,$3::date-$4::int) ON CONFLICT DO NOTHING',
        [user.id, 'bondi', check.day, offset],
      );
  const stats = await call(bob, 'stats', {
    target: alice.id,
    beachId: 'bondi',
  });
  assert.equal(stats.level, 2);
  assert.equal(stats.stats.dives, 1);
  assert.ok(!('typicalDepth' in stats.stats));
  const directory = await call(bob, 'community', { beachId: 'bondi' });
  assert.equal(directory.people.find((p) => p.id === alice.id).regular, true);
  assert.ok(
    directory.people
      .find((p) => p.id === alice.id)
      .reasons.includes('Shared beach'),
  );
  console.log(
    'Postgres round trip, duplicate-day prevention, private sessions and reciprocal 3/5 gates passed',
  );
  await call(alice, 'connection', { target: bob.id, mode: 'request' });
  await call(alice, 'connection', { target: bob.id, mode: 'accept' }, 403);
  await call(bob, 'connection', { target: alice.id, mode: 'accept' });
  assert.equal(
    (await call(bob, 'community', { beachId: 'bondi' })).people.find(
      (p) => p.id === alice.id,
    ).connection,
    'accepted',
  );
  await call(alice, 'preferences', { profile: { ...profile, open: false } });
  await db.query('DELETE FROM finfolk.checkins WHERE user_id=$1', [alice.id]);
  assert.equal(
    (await call(bob, 'stats', { target: alice.id, beachId: 'bondi' })).level,
    2,
  );
  await call(alice, 'block', { target: bob.id });
  await call(bob, 'stats', { target: alice.id, beachId: 'bondi' }, 404);
  console.log(
    'Mutual acceptance, Closed mode, inactivity exception and block revocation passed',
  );
  const tokenResponse = await fetch(base + '/get-session', {
    headers: { Cookie: alice.cookie, Origin: 'http://localhost:8000' },
  });
  assert.equal((await tokenResponse.json()).user.id, alice.id);
  console.log('Neon Auth session restoration passed');
  const again = createAPI({ db, verify: managedVerifier(process.env) });
  const response = await again.request('http://localhost/api', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + alice.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'me' }),
  });
  assert.equal(response.status, 200);
  console.log('API restart against stored Postgres rows passed');
  console.log('NEON_END_TO_END_PASS');
} finally {
  for (const uid of created) {
    await db.query('DELETE FROM finfolk.members WHERE user_id=$1', [uid]);
    await db.query('DELETE FROM neon_auth."user" WHERE id::text=$1', [uid]);
  }
  await db.pool.end();
}
