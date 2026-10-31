import { registerMessagingAPI,messagingProblem,messagingMemberAction,isMessagingMemberAction } from './messaging-api.mjs';
import { randomUUID } from 'node:crypto';
import {tripActions,tripAction,publicTrip,publicTrips} from './trips.mjs';
import { discoveryAction, discoveryActions, publicInstagramFeed } from './instagram-discovery.mjs';
import { postAction, publicPosts, postsEnabled } from './posts.mjs';
import { invitationAction } from './invitations.mjs';
import { instagramAction } from './instagram-actions.mjs';
import { instagramWebhook } from './instagram-webhook.mjs';
import { createShopCheckout } from './shop.mjs';
import { Hono } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  preferences,
  compatibility,
  windowFor,
  visitCount,
  tierFor,
  visibleStats,
  socialPost,
  nextDayAt,
} from './community-core.mjs';
const fail = (status, message) => {
  const error = Error(message);
  error.status = status;
  throw error;
};
const pair = (a, b) => [a, b].sort();
const id = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    fail(400, 'Invalid identifier.');
  return value;
};
export function managedVerifier(env) {
  const keys = createRemoteJWKSet(new URL(env.NEON_AUTH_JWKS_URL));
  const issuer = new URL(env.NEON_AUTH_BASE_URL).origin;
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      algorithms: ['EdDSA'],
    });
    if (!payload.sub) throw Error('Missing identity');
    return payload;
  };
}
export function createAPI({
  db,
  verify,
  origins = [
    'https://finfolk.com.au',
    'https://www.finfolk.com.au',
    'https://hoebat.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
  ],
  now = () => new Date(),
  messagingFetch = fetch,
}) {
  const app = new Hono();
  const q = db.query;
  app.use('*', async (c, next) => {
    if(c.req.path.startsWith('/v1/')){const requestId=randomUUID();c.set('requestId',requestId);c.header('X-Request-Id',requestId);}
    const origin = c.req.header('Origin');
    if (origin && !origins.includes(origin)){
      if(c.req.path.startsWith('/v1/'))return c.json(messagingProblem({code:'origin_not_allowed',status:403,message:'Origin not allowed.'},c.get('requestId')),403);
      return c.json({ error: 'Origin not allowed' }, 403);
    }
    if (origin) c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Cache-Control', 'private, no-store');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
    c.header('Access-Control-Expose-Headers','X-Request-Id, Idempotency-Replayed, Retry-After');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    await next();
  });
  app.get('/instagram/posts', async c => {
    const feed=await publicInstagramFeed(q,c.req.query('beachId'),c.req.query('cursor'));
    const last=(await q('SELECT max(last_success) AS last_success FROM finfolk.instagram_sources'))[0];
    return c.json({...feed,activity:{collecting:c.env?.INSTAGRAM_DISCOVERY_ENABLED==='true',lastSuccess:last?.last_success||null}});
  });
  app.post('/instagram/posts/:id/report', async c => {
    const postId=c.req.param('id');
    if(!/^[a-f0-9-]{36}$/.test(postId)) return c.json({error:'Invalid post.'},400);
    const raw=await c.req.text();if(raw.length>256)return c.json({error:'Report too large.'},413);
    let v;try{v=JSON.parse(raw);}catch{return c.json({error:'Invalid report.'},400);}
    if(!['wrong_location','inappropriate','removed','other'].includes(v.reason))return c.json({error:'Choose a report reason.'},400);
    await q("INSERT INTO finfolk.instagram_post_reports(discovery_id,reason) SELECT id,$2 FROM finfolk.instagram_discoveries WHERE id=$1 AND state='published' ON CONFLICT DO NOTHING",[postId,v.reason]);
    return c.json({ok:true});
  });
  app.get('/trips', async c=>c.json(await publicTrips(q,{beachId:c.req.query('beachId'),ownerId:c.req.query('ownerId')})));
  app.get('/trips/:id', async c=>c.json(await publicTrip(q,c.req.param('id'))));
  app.get('/instagram/webhook', c => instagramWebhook(c.req.raw, c.env || {}, q));
  app.post('/instagram/webhook', c => instagramWebhook(c.req.raw, c.env || {}, q));
  registerMessagingAPI(app,{db,verify,fetcher:messagingFetch});
  app.get('/health', (c) =>
    c.json({ ok: true, service: 'FinFolk account API' }),
  );
  app.post('/shop/checkout', async (c) => {
    const raw = await c.req.text();
    if (raw.length > 8192) return c.json({error:'Cart is too large.'}, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return c.json({error:'Invalid cart.'}, 400); }
    const result = await createShopCheckout(input, c.env || {});
    return c.json(result.body, result.status);
  });
  app.onError((e, c) => {
    if(c.req.path.startsWith('/v1/'))return c.json(messagingProblem(e,c.get('requestId') || randomUUID()),e.status || 503);
    if (!e.status) console.error('Account operation failed', e.code || e.name);
    return c.json(
      { error: e.status ? e.message : 'Service unavailable. Please retry.' },
      e.status || 503,
    );
  });
  app.get('/community/posts', async c => c.json(await publicPosts({q,env:c.env || {},beachId:c.req.query('beachId'),cursor:c.req.query('cursor') || '',postId:c.req.query('postId') || ''})));
  app.post('/community/referral', async c => {
    if (!postsEnabled(c.env || {})) return c.json({ok:true});
    const raw = await c.req.text();
    if (raw.length > 256) fail(413,'Request is too large.');
    let input;
    try { input = JSON.parse(raw); } catch { fail(400,'Invalid request.'); }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input?.postId || '')) fail(400,'Invalid post.');
    await q(`INSERT INTO finfolk.community_referrals(platform,clicks)
      SELECT p.platform,1 FROM finfolk.posts p JOIN finfolk.members m ON m.user_id=p.owner_id
      WHERE p.id=$1::uuid AND p.status='approved' AND p.public_consent AND NOT m.deleted
      ON CONFLICT(day,platform) DO UPDATE SET clicks=finfolk.community_referrals.clicks+1`,[input.postId]);
    return c.json({ok:true});
  });
  app.post('/api', async (c) => {
    const auth = c.req.header('Authorization') || '';
    if (!auth.startsWith('Bearer ')) fail(401, 'Sign in first.');
    let claims;
    try {
      claims = await verify(auth.slice(7));
    } catch {
      fail(401, 'Your sign-in expired. Please sign in again.');
    }
    const uid = id(claims.sub),
      identity = (
        await q(
          'SELECT id::text, name, "emailVerified" AS verified FROM neon_auth."user" WHERE id::text=$1 AND coalesce(banned,false)=false',
          [uid],
        )
      )[0];
    if (!identity) fail(401, 'Account unavailable.');
    const raw = await c.req.text();
    if (raw.length > 65536) fail(413, 'Request is too large.');
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      fail(400, 'Invalid request.');
    }
    const { action, ...v } = input;
    let me = (
      await q('SELECT * FROM finfolk.members WHERE user_id=$1', [uid])
    )[0];
    if (me?.deleted) fail(403, 'Account has been deleted.');
    if (!me) {
      const profile = preferences({ displayName: identity.name });
      me = (
        await q(
          'INSERT INTO finfolk.members(user_id,profile,invite_eligible) VALUES($1,$2::jsonb,true) ON CONFLICT(user_id) DO UPDATE SET user_id=excluded.user_id RETURNING *',
          [uid, JSON.stringify(profile)],
        )
      )[0];
      if (me.deleted) fail(403, 'Account has been deleted.');
    }
    const rate = (
      await q(
        "INSERT INTO finfolk.request_limits(user_id,minute,count) VALUES($1,date_trunc('minute',now()),1) ON CONFLICT(user_id) DO UPDATE SET minute=excluded.minute,count=CASE WHEN finfolk.request_limits.minute=excluded.minute THEN finfolk.request_limits.count+1 ELSE 1 END RETURNING count",
        [uid],
      )
    )[0];
    if (rate.count > 120) fail(429, 'Too many requests. Please wait a minute.');
    const verified = () => {
      if (!identity.verified) fail(403, 'Verify your email in Account first.');
    };
    const beach = async (beachId) => {
      const b = (
        await q('SELECT * FROM finfolk.beaches WHERE id=$1', [id(beachId)])
      )[0];
      if (!b) fail(400, 'Unknown beach.');
      return b;
    };
    const member = async (target) => {
      const m = (
        await q(
          'SELECT * FROM finfolk.members WHERE user_id=$1 AND deleted=false',
          [id(target)],
        )
      )[0];
      if (!m) fail(404, 'Profile unavailable.');
      return m;
    };
    const blocked = async (target) =>
      (
        await q(
          'SELECT 1 FROM finfolk.blocks WHERE (owner_id=$1 AND target_id=$2) OR (owner_id=$2 AND target_id=$1)',
          [uid, target],
        )
      ).length > 0;
    const relation = async (target) => {
      const [a, b] = pair(uid, target);
      return (
        await q('SELECT * FROM finfolk.connections WHERE a=$1 AND b=$2', [a, b])
      )[0];
    };
    const days = async (target, b) =>
      (
        await q(
          'SELECT visit_day::text AS day FROM finfolk.checkins WHERE user_id=$1 AND beach_id=$2',
          [target, b.id],
        )
      ).map((r) => r.day);
    const basic = (m) => ({
      id: m.user_id,
      displayName: m.profile.displayName,
      bio: m.profile.bio,
      instagram: m.profile.instagram,
      tiktok: m.profile.tiktok,
      ...(Number.isInteger(m.participationPoints) ? {participationPoints:m.participationPoints} : {}),
      open: m.profile.open,
    });
    async function statsFor(target, b) {
      const ds = await days(target, b),
        sessions = await q(
          'SELECT data FROM finfolk.sessions WHERE owner_id=$1 AND beach_id=$2',
          [target, b.id],
        ),
        depths = sessions
          .map((r) => r.data.maxDepthMetres)
          .filter(Number.isFinite)
          .sort((a, b) => a - b),
        times = sessions
          .map((r) => r.data.durationMinutes)
          .filter(Number.isFinite);
      return {
        visits: visitCount(ds, now(), b.timezone),
        months: new Set(ds.map((d) => d.slice(0, 7))).size,
        dives: sessions.length,
        minutes: times.length ? times.reduce((a, b) => a + b, 0) : null,
        typicalDepth: depths.length
          ? depths[Math.floor(depths.length / 2)]
          : null,
      };
    }
    let result;
    if (typeof action === 'string' && action.startsWith('invitation')) return c.json({data:await invitationAction({action,v,uid,q,verified})});
    if (tripActions.has(action)) return c.json({data:await tripAction({action,v,uid,q,env:c.env||{},verified})});
    if (discoveryActions.has(action)) return c.json({data:await discoveryAction({action,v,uid,env:c.env||{},q})});
    if (typeof action === 'string' && action.startsWith('instagram')) {
      const result = isMessagingMemberAction(action) ? await messagingMemberAction({action,v,uid,env:c.env || {},db,verified}) : await instagramAction({action,v,uid,env:c.env || {},q,db,verified});
      return c.json({data:result});
    }
    if (['postStatus','followedPosts','post','posts','myPosts','removePost','reportPost','reviewPosts','reviewPost','resolvePostReport','communityMetrics'].includes(action))
      return c.json({data:await postAction({action,v,uid,env:c.env || {},q,verified,beach})});
    switch (action) {
      case 'profile': {
        const target = await member(v.target);
        if (await blocked(target.user_id)) fail(404, 'Profile unavailable.');
        result = basic(target);
        break;
      }
      case 'me':
        result = { id: uid, profile: me.profile, verified: identity.verified };
        break;
      case 'preferences': {
        let p;
        try {
          p = preferences(v.profile);
        } catch (e) {
          fail(400, e.message);
        }
        if (p.open) verified();
        for (const b of p.beaches) await beach(b);
        await q(
          'UPDATE finfolk.members SET profile=$2::jsonb,updated_at=now() WHERE user_id=$1',
          [uid, JSON.stringify(p)],
        );
        result = { profile: p };
        break;
      }
      case 'checkin': {
        verified();
        const b = await beach(v.beachId),
          { today } = windowFor(now(), b.timezone);
        await q(
          'INSERT INTO finfolk.checkins(user_id,beach_id,visit_day) VALUES($1,$2,$3::date) ON CONFLICT DO NOTHING',
          [uid, b.id, today],
        );
        result = {
          day: today,
          count: visitCount(await days(uid, b), now(), b.timezone),
          selfReported: true,
        };
        break;
      }
      case 'removeCheckin': {
        const b = await beach(v.beachId);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v.day || ''))
          fail(400, 'Invalid visit day.');
        await q(
          'DELETE FROM finfolk.checkins WHERE user_id=$1 AND beach_id=$2 AND visit_day=$3::date',
          [uid, b.id, v.day],
        );
        result = { removed: true };
        break;
      }
      case 'myCheckins':
        result = await q(
          'SELECT c.beach_id,c.visit_day::text AS day,b.name FROM finfolk.checkins c JOIN finfolk.beaches b ON b.id=c.beach_id WHERE c.user_id=$1 ORDER BY visit_day DESC,beach_id LIMIT 100',
          [uid],
        );
        break;
      case 'community': {
        const b = await beach(v.beachId),
          { start, today } = windowFor(now(), b.timezone),
          cursor = typeof v.cursor === 'string' ? v.cursor : '';
        const candidates = await q(
          "SELECT m.*,count(*)::int AS visits,(SELECT status FROM finfolk.connections rel WHERE (rel.a=$5 AND rel.b=m.user_id) OR (rel.b=$5 AND rel.a=m.user_id) LIMIT 1) AS connection FROM finfolk.members m JOIN finfolk.checkins c ON c.user_id=m.user_id WHERE c.beach_id=$1 AND c.visit_day BETWEEN $2::date AND $3::date AND m.user_id>$4 AND m.user_id<>$5 AND m.deleted=false AND m.profile->>'open'='true' AND NOT EXISTS(SELECT 1 FROM finfolk.blocks bl WHERE (bl.owner_id=$5 AND bl.target_id=m.user_id) OR (bl.owner_id=m.user_id AND bl.target_id=$5)) AND NOT EXISTS(SELECT 1 FROM finfolk.connections cn WHERE ((cn.a=$5 AND cn.b=m.user_id) OR (cn.b=$5 AND cn.a=m.user_id)) AND cn.status='declined') GROUP BY m.user_id ORDER BY m.user_id LIMIT 21",
          [b.id, start, today, cursor, uid],
        );
        const page = candidates.slice(0, 20);
        if (page.length) {
          const totals = await q("SELECT c.user_id, ((SELECT count(*) FROM finfolk.points_ledger p WHERE p.user_id=c.user_id AND reversed=false)+(SELECT count(*) FROM finfolk.invitation_joins j WHERE j.inviter_id=c.user_id AND rewarded_at IS NOT NULL))::integer AS total FROM finfolk.instagram_connections c WHERE c.public_points=true AND c.status='connected' AND c.user_id IN (SELECT jsonb_array_elements_text($1::jsonb))",[JSON.stringify(page.map(m=>m.user_id))]);
          for (const m of page) { const total=totals.find(t=>t.user_id===m.user_id); if(total)m.participationPoints=total.total; }
        }
        result = {
          people: page
            .map((m) => ({
              ...basic(m),
              regular: m.visits >= 3,
              connection: m.connection,
              ...(me.profile.open
                ? compatibility(
                    {
                      ...me.profile,
                      beaches: [...(me.profile.beaches || []), b.id],
                    },
                    {
                      ...m.profile,
                      beaches: [...(m.profile.beaches || []), b.id],
                    },
                  )
                : { score: 0, reasons: [] }),
            }))
            .sort((a, b) => b.score - a.score)
            .map(({ score, ...p }) => p),
          cursor: candidates.length > 20 ? page.at(-1).user_id : null,
          ownVisits: visitCount(await days(uid, b), now(), b.timezone),
          window: '30 days',
          refreshAt: nextDayAt(now(), b.timezone),
        };
        break;
      }
      case 'stats': {
        const target = await member(v.target),
          b = await beach(v.beachId);
        if (await blocked(target.user_id)) fail(404, 'Profile unavailable.');
        const rel = await relation(target.user_id);
        const level = tierFor({
          viewer: uid === target.user_id ? target.profile : me.profile,
          owner: target.profile,
          viewerDays: await days(uid, b),
          ownerDays: await days(target.user_id, b),
          connection: uid === target.user_id ? 'accepted' : rel?.status,
          now: now(),
          zone: b.timezone,
        });
        result = {
          profile: basic(target),
          level,
          stats: visibleStats(
            await statsFor(target.user_id, b),
            target.profile.sharing,
            level,
          ),
          progress: Math.min(
            5,
            visitCount(await days(uid, b), now(), b.timezone),
          ),
          sharingClosed: !me.profile.open || !target.profile.open,
          expiresWithActivity: rel?.status !== 'accepted',
        };
        break;
      }
      case 'connection': {
        verified();
        const target = await member(v.target);
        if (target.user_id === uid) fail(400, 'Choose another diver.');
        if (await blocked(target.user_id)) fail(404, 'Profile unavailable.');
        const [a, b] = pair(uid, target.user_id),
          existing = await relation(target.user_id),
          mode = v.mode;
        if (mode === 'request') {
          if (existing?.status === 'declined')
            fail(403, 'This connection is unavailable.');
          await q(
            "INSERT INTO finfolk.connections(a,b,requested_by,status) VALUES($1,$2,$3,'pending') ON CONFLICT DO NOTHING",
            [a, b, uid],
          );
        } else if (['accept', 'decline'].includes(mode)) {
          if (existing?.status !== 'pending' || existing.requested_by === uid)
            fail(403, 'Only the recipient can respond.');
          await q(
            "UPDATE finfolk.connections SET status=$3,updated_at=now() WHERE a=$1 AND b=$2 AND status='pending' AND requested_by<>$4",
            [a, b, mode === 'accept' ? 'accepted' : 'declined', uid],
          );
        } else if (mode === 'remove')
          await q(
            "UPDATE finfolk.connections SET status='removed',updated_at=now() WHERE a=$1 AND b=$2",
            [a, b],
          );
        else fail(400, 'Unknown connection action.');
        result = { ok: true };
        break;
      }
      case 'connections':
        result = await q(
          "SELECT cn.*,m.user_id AS id,m.profile->>'displayName' AS name,m.profile->>'instagram' AS instagram,m.profile->>'tiktok' AS tiktok FROM finfolk.connections cn JOIN finfolk.members m ON m.user_id=CASE WHEN cn.a=$1 THEN cn.b ELSE cn.a END WHERE (cn.a=$1 OR cn.b=$1) AND cn.status IN ('accepted','pending') AND m.deleted=false AND NOT EXISTS(SELECT 1 FROM finfolk.blocks bl WHERE (bl.owner_id=$1 AND bl.target_id=m.user_id) OR (bl.owner_id=m.user_id AND bl.target_id=$1)) ORDER BY cn.updated_at DESC LIMIT 50",
          [uid],
        );
        break;
      case 'block': {
        const target = await member(v.target);
        if (target.user_id === uid) fail(400, 'Choose another diver.');
        await q(
          'INSERT INTO finfolk.blocks(owner_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [uid, target.user_id],
        );
        const [a, b] = pair(uid, target.user_id);
        await q(
          "UPDATE finfolk.connections SET status='removed',updated_at=now() WHERE a=$1 AND b=$2",
          [a, b],
        );
        result = { ok: true };
        break;
      }
      case 'unblock':
        await q(
          'DELETE FROM finfolk.blocks WHERE owner_id=$1 AND target_id=$2',
          [uid, id(v.target)],
        );
        result = { ok: true };
        break;
      case 'blocks':
        result = await q(
          "SELECT b.target_id AS id,m.profile->>'displayName' AS name FROM finfolk.blocks b JOIN finfolk.members m ON m.user_id=b.target_id WHERE b.owner_id=$1",
          [uid],
        );
        break;
      case 'report':
        verified();
        await member(v.target);
        if (
          typeof v.reason !== 'string' ||
          !v.reason.trim() ||
          v.reason.length > 1000
        )
          fail(400, 'Describe the issue in up to 1,000 characters.');
        await q(
          'INSERT INTO finfolk.reports(owner_id,target_id,reason) VALUES($1,$2,$3)',
          [uid, id(v.target), v.reason],
        );
        result = { ok: true };
        break;
      case 'sessions': {
        const owner = v.owner || uid;
        if (owner !== uid && (await blocked(owner)))
          fail(404, 'Sessions unavailable.');
        const cursor = typeof v.cursor === 'string' ? v.cursor : '9999';
        const rows = await q(
          "SELECT * FROM finfolk.sessions WHERE owner_id=$1 AND id::text<$2 AND ($3::boolean OR data->>'visibility'='public') ORDER BY id DESC LIMIT 31",
          [owner, cursor, owner === uid],
        );
        result = {
          sessions: rows
            .slice(0, 30)
            .map((row) => ({ ...row.data, id: row.id, ownerId: row.owner_id })),
          cursor: rows.length > 30 ? rows[29].id : null,
          more: rows.length > 30,
        };
        break;
      }
      case 'session': {
        const row = (
          await q('SELECT * FROM finfolk.sessions WHERE id::text=$1', [
            id(v.id),
          ])
        )[0];
        if (
          !row ||
          (await blocked(row.owner_id)) ||
          (row.owner_id !== uid && row.data.visibility !== 'public')
        )
          fail(404, 'Session unavailable.');
        result = { ...row.data, id: row.id, ownerId: row.owner_id };
        break;
      }
      case 'saveSession': {
        const { sessionInput } = await import('../web/logbook-model.js');
        let data;
        try {
          data = sessionInput(v.values);
        } catch (e) {
          fail(400, e.message);
        }
        data.visibility = 'private';
        data.photos = [];
        if (data.photos?.length)
          fail(400, 'Keep photos on Instagram or TikTok and add a post link.');
        if (data.visibility === 'public') verified();
        if (data.beachId) await beach(data.beachId);
        if (v.id) {
          const rows = await q(
            'UPDATE finfolk.sessions SET data=$3::jsonb,beach_id=$4,updated_at=now() WHERE id::text=$1 AND owner_id=$2 RETURNING id',
            [id(v.id), uid, JSON.stringify(data), data.beachId || null],
          );
          if (!rows.length) fail(404, 'Session unavailable.');
          result = { id: rows[0].id };
        } else
          result = (
            await q(
              'INSERT INTO finfolk.sessions(owner_id,beach_id,data) VALUES($1,$2,$3::jsonb) RETURNING id',
              [uid, data.beachId || null, JSON.stringify(data)],
            )
          )[0];
        break;
      }
      case 'deleteSession':
        await q(
          'DELETE FROM finfolk.sessions WHERE id::text=$1 AND owner_id=$2',
          [id(v.id), uid],
        );
        result = { deleted: true };
        break;
      case 'visibility': {
        if (v.visibility === 'public') verified();
        if (!['public', 'private'].includes(v.visibility))
          fail(400, 'Invalid visibility.');
        await q(
          "UPDATE finfolk.sessions SET data=jsonb_set(data,'{visibility}',$3::jsonb),updated_at=now() WHERE id::text=$1 AND owner_id=$2",
          [id(v.id), uid, JSON.stringify(v.visibility)],
        );
        result = { ok: true };
        break;
      }
      case 'deleteAccount':
        await db.transaction(async tq=>{
          await tq("SELECT id FROM finfolk.messaging_accounts WHERE id='instagram' FOR UPDATE");
        await tq("UPDATE finfolk.instagram_claims SET state='cancelled',code_hash=null WHERE user_id=$1",[uid]);
        await tq('DELETE FROM finfolk.instagram_dm_limits WHERE sender_id IN (SELECT rate_limit_key FROM finfolk.instagram_dm_events WHERE owner_id=$1)',[uid]);
        await tq('DELETE FROM finfolk.instagram_dm_events WHERE owner_id=$1',[uid]);
        await tq('DELETE FROM finfolk.messaging_idempotency WHERE user_id=$1',[uid]);
        await tq('DELETE FROM finfolk.messaging_oauth_states WHERE user_id=$1',[uid]);
        await tq('DELETE FROM finfolk.instagram_dm_limits WHERE sender_id IN (SELECT sender_id FROM finfolk.instagram_connections WHERE user_id=$1)',[uid]);
        await tq('DELETE FROM finfolk.instagram_claims WHERE user_id=$1',[uid]);
        await tq('DELETE FROM finfolk.trips WHERE owner_id=$1',[uid]);
        await tq("UPDATE finfolk.instagram_discoveries SET state='hidden',owner_id=NULL,author_id=NULL,author=NULL,caption='',updated_at=now() WHERE owner_id=$1",[uid]);
        await tq('DELETE FROM finfolk.points_ledger WHERE user_id=$1',[uid]);
        await tq('DELETE FROM finfolk.instagram_actions WHERE owner_id=$1',[uid]);
        await tq('DELETE FROM finfolk.instagram_connections WHERE user_id=$1',[uid]);
        await tq('DELETE FROM finfolk.invitation_joins WHERE invitee_id=$1 OR inviter_id=$1',[uid]);
        await tq('DELETE FROM finfolk.invitations WHERE inviter_id=$1',[uid]);
        await tq(
          "UPDATE finfolk.members SET deleted=true,profile='{}'::jsonb,updated_at=now() WHERE user_id=$1",
          [uid],
        );
        await tq('DELETE FROM finfolk.checkins WHERE user_id=$1', [uid]);
        await tq('DELETE FROM finfolk.sessions WHERE owner_id=$1', [uid]);
        await tq('DELETE FROM finfolk.posts WHERE owner_id=$1', [uid]);
        await tq('DELETE FROM finfolk.connections WHERE a=$1 OR b=$1', [uid]);
        await tq(
          'DELETE FROM finfolk.blocks WHERE owner_id=$1 OR target_id=$1',
          [uid],
        );
        await tq('DELETE FROM finfolk.reports WHERE owner_id=$1', [uid]);
        });
        result = { deleted: true };
        break;
      default:
        fail(400, 'Unknown account operation.');
    }
    return c.json({ data: result });
  });
  return app;
}
