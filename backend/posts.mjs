import { socialPost } from './community-core.mjs';
import { isInstagramAdmin } from './instagram-actions.mjs';
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const uuid = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail('Invalid post identifier.');
  return value;
};
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) fail(`${label} must contain 1–1,000 characters.`);
  return value.trim();
};
export const postsEnabled = env => env.COMMUNITY_POSTS_ENABLED === 'true';
export function postInput(v) {
  let url;
  try { url = socialPost(v.url).replace(/\/$/, ''); } catch(error) { fail(error.message); }
  const platform = new URL(url).hostname === 'www.instagram.com' ? 'instagram' : 'tiktok';
  const handle = String(v.creatorHandle || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) fail('Enter the username of the account that published this post.');
  if (platform === 'tiktok' && new URL(url).pathname.split('/')[1].slice(1).toLowerCase() !== handle.toLowerCase()) fail('The TikTok username must match the post link.');
  if (v.publicConsent !== true || v.ownPost !== true || v.tagged !== true) fail('Confirm ownership, the @finfolk.com.au tag and permission to list this post publicly.');
  return { url, platform, handle };
}
export async function publicPosts({ q, env, beachId, cursor = '', viewer = '' }) {
  if (!postsEnabled(env)) return { enabled: false, posts: [], cursor: null };
  if (typeof beachId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(beachId)) fail('Choose a beach.');
  let before = '9999-01-01T00:00:00.000Z', beforeId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  if (cursor) {
    const parts = cursor.split('~');
    if (parts.length !== 2 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(parts[0]) || !Number.isFinite(Date.parse(parts[0]))) fail('Invalid feed cursor.');
    before = parts[0]; beforeId = uuid(parts[1]);
  }
  const rows = await q(`SELECT p.id,p.beach_id,p.url,p.platform,p.creator_handle,p.created_at,to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM finfolk.posts p JOIN finfolk.members m ON m.user_id=p.owner_id
    WHERE p.beach_id=$1 AND p.status='approved' AND p.public_consent AND NOT m.deleted
    AND ($4='' OR NOT EXISTS(SELECT 1 FROM finfolk.blocks bl WHERE (bl.owner_id=$4 AND bl.target_id=p.owner_id) OR (bl.target_id=$4 AND bl.owner_id=p.owner_id)))
    AND (p.created_at,p.id)<($2::timestamptz,$3::uuid)
    ORDER BY p.created_at DESC,p.id DESC LIMIT 21`, [beachId, before, beforeId, viewer]);
  const posts = rows.slice(0,20), last = posts.at(-1);
  return { enabled: true, posts: posts.map(({cursor_at,...post}) => post), cursor: rows.length > 20 ? `${last.cursor_at}~${last.id}` : null };
}
export async function postAction({action,v,uid,env,q,verified,beach}) {
  const admin = isInstagramAdmin(uid,env);
  if (action === 'postStatus') return { enabled: postsEnabled(env), admin, tag: 'finfolk.com.au', pilotBeaches: (env.COMMUNITY_PILOT_BEACHES || '').split(',').map(s=>s.trim()).filter(Boolean) };
  if (action === 'posts') return publicPosts({q,env,beachId:v.beachId,cursor:v.cursor || '',viewer:uid});
  if (action === 'followedPosts') {
    if (!postsEnabled(env)) return {posts:[]};
    return {posts:await q(`SELECT p.id,p.beach_id,p.url,p.platform,p.creator_handle,b.name AS beach_name
      FROM finfolk.posts p JOIN finfolk.beaches b ON b.id=p.beach_id JOIN finfolk.members m ON m.user_id=p.owner_id
      WHERE p.status='approved' AND p.public_consent AND NOT m.deleted
      AND p.beach_id IN (SELECT jsonb_array_elements_text(profile->'beaches') FROM finfolk.members WHERE user_id=$1)
      AND NOT EXISTS(SELECT 1 FROM finfolk.blocks bl WHERE (bl.owner_id=$1 AND bl.target_id=p.owner_id) OR (bl.target_id=$1 AND bl.owner_id=p.owner_id))
      ORDER BY p.created_at DESC,p.id DESC LIMIT 30`,[uid])};
  }
  if (action === 'myPosts') return q(`SELECT p.id,p.beach_id,p.url,p.platform,p.creator_handle,p.status,p.public_consent,p.rejection_reason,p.created_at,b.name AS beach_name
    FROM finfolk.posts p JOIN finfolk.beaches b ON b.id=p.beach_id WHERE owner_id=$1 ORDER BY p.created_at DESC LIMIT 100`, [uid]);
  if (action === 'post') {
    verified();
    if (!postsEnabled(env)) fail('Beach post submissions are opening soon.',503);
    const pilot=(env.COMMUNITY_PILOT_BEACHES || '').split(',').map(s=>s.trim()).filter(Boolean);
    if (pilot.length && !pilot.includes(v.beachId)) fail('Post submissions are currently limited to the Sydney pilot beaches.');
    const b = await beach(v.beachId), p = postInput(v);
    const rows = await q(`INSERT INTO finfolk.posts(owner_id,beach_id,url,platform,creator_handle,public_consent)
      VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(owner_id,beach_id,url) DO UPDATE
      SET status='pending',public_consent=true,creator_handle=excluded.creator_handle,platform=excluded.platform,
      rejection_reason='',reviewed_by=null,reviewed_at=null,updated_at=now()
      WHERE finfolk.posts.status IN ('rejected','removed') OR NOT finfolk.posts.public_consent RETURNING id,status`,[uid,b.id,p.url,p.platform,p.handle]);
    if (!rows.length) fail('This post is already submitted at this beach.',409);
    return rows[0];
  }
  if (action === 'removePost') {
    const rows = await q(`WITH changed AS (UPDATE finfolk.posts SET status='removed',public_consent=false,updated_at=now()
      WHERE id=$1::uuid AND owner_id=$2 RETURNING id)
      INSERT INTO finfolk.post_reviews(post_id,actor,decision) SELECT id,$2,'withdrawn' FROM changed RETURNING post_id`,[uuid(v.id),uid]);
    if (!rows.length) fail('Post unavailable.',404);
    return {ok:true};
  }
  if (action === 'reportPost') {
    verified();
    const reason = text(v.reason,'Report');
    const rows = await q(`INSERT INTO finfolk.post_reports(post_id,reporter_id,reason)
      SELECT p.id,$2,$3 FROM finfolk.posts p JOIN finfolk.members m ON m.user_id=p.owner_id
      WHERE p.id=$1::uuid AND p.status='approved' AND p.public_consent AND NOT m.deleted
      ON CONFLICT(post_id,reporter_id) DO UPDATE SET reason=excluded.reason,status='open',resolved_by=null,resolved_at=null RETURNING id`,[uuid(v.id),uid,reason]);
    if (!rows.length) fail('Post unavailable.',404);
    return {ok:true};
  }
  if (['reviewPosts','reviewPost','resolvePostReport','communityMetrics'].includes(action)) {
    verified();
    if (!admin) fail('Administrator access required.',403);
    let filterURL = '';
    if (action === 'reviewPosts' && v.url) {
      try { filterURL=socialPost(v.url).replace(/\/$/, ''); } catch(error) { fail(error.message); }
    }
    if (action === 'reviewPosts') return {
      posts: await q(`SELECT p.id,p.url,p.beach_id,p.platform,p.creator_handle,p.public_consent,p.status,p.created_at,b.name AS beach_name
        FROM finfolk.posts p JOIN finfolk.beaches b ON b.id=p.beach_id JOIN finfolk.members m ON m.user_id=p.owner_id
        WHERE p.status IN ('pending','approved') AND p.public_consent AND NOT m.deleted AND ($1='' OR rtrim(p.url,'/')=$1) ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END,p.created_at DESC LIMIT 100`,[filterURL]),
      reports: await q(`SELECT r.id,r.post_id,r.reason,r.created_at,p.url,p.status,p.creator_handle FROM finfolk.post_reports r JOIN finfolk.posts p ON p.id=r.post_id WHERE r.status='open' ORDER BY r.created_at LIMIT 100`),
    };
    if (action === 'reviewPost') {
      if (!['approved','rejected','removed'].includes(v.decision)) fail('Invalid review decision.');
      if (v.decision === 'approved' && (v.ownershipChecked !== true || v.tagChecked !== true || v.beachChecked !== true)) fail('Check attribution, the FinFolk tag and the beach before approval.');
      const reason = v.decision === 'approved' ? '' : text(v.reason,'Review reason');
      const rows = await q(`WITH changed AS (UPDATE finfolk.posts SET status=$3,rejection_reason=$4,reviewed_by=$2,reviewed_at=now(),updated_at=now()
        WHERE id=$1::uuid AND public_consent AND status IN ('pending','approved') AND ($3!='approved' OR status='pending') RETURNING id)
        INSERT INTO finfolk.post_reviews(post_id,actor,decision,reason) SELECT id,$2,$3,$4 FROM changed RETURNING post_id`,[uuid(v.id),uid,v.decision,reason]);
      if (!rows.length) fail('Post changed or was withdrawn. Refresh the queue.',409);
      return {ok:true};
    }
    if (action === 'resolvePostReport') {
      await q(`UPDATE finfolk.post_reports SET status='resolved',resolved_by=$2,resolved_at=now() WHERE id=$1::uuid`,[uuid(v.id),uid]);
      return {ok:true};
    }
    return {
      weeks: await q(`SELECT date_trunc('week',visit_day)::date AS week,count(*)::int AS checkins,count(DISTINCT user_id)::int AS participants FROM finfolk.checkins WHERE visit_day>=current_date-28 GROUP BY 1 ORDER BY 1`),
      repeatParticipants: (await q(`SELECT count(*)::int AS count FROM (SELECT user_id FROM finfolk.checkins WHERE visit_day>=current_date-28 GROUP BY user_id HAVING count(DISTINCT date_trunc('week',visit_day))>1) r`))[0]?.count || 0,
      membership: (await q(`SELECT count(*)::int AS members,count(*) FILTER(WHERE u."createdAt">=now()-interval '28 days')::int AS joined FROM finfolk.members m JOIN neon_auth."user" u ON u.id::text=m.user_id WHERE NOT m.deleted`))[0],
      referrals: await q(`SELECT day,platform,clicks FROM finfolk.community_referrals WHERE day>=current_date-28 ORDER BY day DESC`),
    };
  }
  return undefined;
}
