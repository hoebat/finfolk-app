import { randomBytes } from 'node:crypto';
import { digest, messagingConfig, messagingError, runtimeEnv, modeAllows } from './messaging-config.mjs';
import { InstagramProvider } from './instagram-provider.mjs';
import { completeInstagramClaim } from './instagram-claims.mjs';

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const normalizeConnectCode = value => typeof value === 'string' && value.length <= 32 ? value.toUpperCase().replace(/[\s-]/g, '') : '';
export const validConnectCode = code => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code);
export const generateConnectCode = () => [...randomBytes(8)].map(byte => alphabet[byte & 31]).join('');
const invalid = () => messagingError('invalid_connect_code', 'That code is invalid or expired. Send /connect to @finfolk.com.au for a new code.', 400);
export function connectEnabled(config, env) {
  return runtimeEnv(config, env).INSTAGRAM_DM_ENABLED === 'true' && config.enabled_commands.includes('connect');
}
// Count attempts independently of code validation so rejected requests cannot roll back limits.
export async function connectLimit(q, bucket, minutes) {
  return (await q(`INSERT INTO finfolk.instagram_connect_limits(bucket,count,resets_at) VALUES($1,1,now()+$2::integer*interval '1 minute')
    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN instagram_connect_limits.resets_at<=now() THEN 1 ELSE instagram_connect_limits.count+1 END,
    resets_at=CASE WHEN instagram_connect_limits.resets_at<=now() THEN excluded.resets_at ELSE instagram_connect_limits.resets_at END RETURNING count`, [bucket, minutes]))[0].count;
}
export async function issueConnectCode(q, event, env, identity) {
  const guidance = body => ({ kind: 'connect_guidance', body });
  if (!identity?.follows) return guidance('Follow @finfolk.com.au, then send /connect again to receive your connection code.');
  const scope = env.MESSAGING_PROVIDER_SCOPE;
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['connect:'+scope+':'+event.sender_id]);
  if ((await q("SELECT 1 FROM finfolk.instagram_connections WHERE provider_scope=$1 AND sender_id=$2 AND status='connected'", [scope,event.sender_id])).length)
    return guidance('Your Instagram account is already connected to FinFolk. Manage it at https://finfolk.com.au/?view=account&tab=instagram');
  if (await connectLimit(q, 'issue:'+digest(scope+':'+event.sender_id), 10) > 3)
    return guidance('Too many connection codes requested. Wait 10 minutes, then send /connect again.');
  await q('UPDATE finfolk.instagram_connect_codes SET invalidated=true WHERE provider_scope=$1 AND sender_id=$2 AND consumed_by IS NULL', [scope,event.sender_id]);
  let code, row;
  do {
    code = generateConnectCode();
    row = (await q(`INSERT INTO finfolk.instagram_connect_codes(code_hash,sender_id,handle,provider_scope,generation,event_id)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(code_hash) DO NOTHING RETURNING id`,[digest(code),event.sender_id,identity.handle,scope,event.generation,event.id]))[0];
  } while (!row);
  return { kind:'connect_code', id:row.id, body:`Your FinFolk code: ${code.slice(0,4)} ${code.slice(4)}\nEnter it at https://finfolk.com.au/?view=account&tab=instagram\nExpires in 10 minutes. Only enter this code on FinFolk; don’t share it with anyone.` };
}
export async function prepareConnect({db,uid,env,code,clientIP,verified,fetcher=fetch}) {
  verified();
  const counts = await db.transaction(async q => {
    const counts = [];
    // Stable lock order for requests sharing either identity or trusted IP.
    for (const bucket of ['redeem:user:'+digest(uid), ...(clientIP ? ['redeem:ip:'+digest(clientIP)] : [])].sort())
      counts.push(await connectLimit(q,bucket,15));
    return counts;
  });
  if (counts.some(count=>count>10)) throw messagingError('connect_rate_limited','Too many attempts. Wait 15 minutes before trying again.',429);
  const normalized=normalizeConnectCode(code);
  if (!validConnectCode(normalized)) throw invalid();
  const config=await messagingConfig(db.query,env,{credentials:true});
  if (!connectEnabled(config,env)) throw messagingError('connect_unavailable','Instagram connection is temporarily unavailable. Please try again later.',503);
  const challenge=(await db.query('SELECT * FROM finfolk.instagram_connect_codes WHERE code_hash=$1',[digest(normalized)]))[0];
  if (!challenge || challenge.provider_scope!==config.scope || challenge.generation!==config.generation || challenge.invalidated || (challenge.consumed_by ? challenge.consumed_by!==uid : new Date(challenge.expires_at)<=new Date())) throw invalid();
  if (!modeAllows(config,challenge.sender_id,'connect')) throw invalid();
  if (challenge.consumed_by===uid) return {challenge,config};
  const identity=await new InstagramProvider(config,fetcher).profile(challenge.sender_id);
  if (!identity.follows) throw messagingError('follow_required','Follow @finfolk.com.au, then try your code again.',409);
  return {challenge,config,identity};
}
// Called within the API's idempotent transaction after provider preflight.
export async function redeemConnect(q,{uid,env,proof}) {
  await q("SELECT id FROM finfolk.messaging_accounts WHERE id='instagram' FOR SHARE");
  const current=await messagingConfig(q,env);
  if (!connectEnabled(current,env) || current.scope!==proof.config.scope || current.generation!==proof.config.generation)
    throw messagingError('connect_unavailable','Connection settings changed. Send /connect again.',409);
  // Match legacy /claim and disconnect ordering before taking the member lock.
  await q('SELECT user_id FROM finfolk.instagram_claims WHERE user_id=$1 FOR UPDATE',[uid]);
  const member=(await q(`SELECT m.user_id FROM finfolk.members m JOIN neon_auth."user" u ON u.id::text=m.user_id
    WHERE m.user_id=$1 AND NOT m.deleted AND u."emailVerified" AND NOT coalesce(u.banned,false) FOR UPDATE OF m`,[uid]))[0];
  if (!member) throw messagingError('email_verification_required','Verify your FinFolk email and sign in again.',403);
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['connect:'+proof.config.scope+':'+proof.challenge.sender_id]);
  const c=(await q('SELECT * FROM finfolk.instagram_connect_codes WHERE id=$1 FOR UPDATE',[proof.challenge.id]))[0];
  if (!c || c.invalidated || c.provider_scope!==current.scope || c.generation!==current.generation) throw invalid();
  if (c.consumed_by) {
    const existing=(await q("SELECT handle FROM finfolk.instagram_connections WHERE user_id=$1 AND provider_scope=$2 AND sender_id=$3 AND identity_version=$4 AND status='connected'",[uid,c.provider_scope,c.sender_id,c.consumed_version]))[0];
    if (c.consumed_by!==uid || !existing) throw invalid();
    return {state:'claimed',handle:existing.handle,profileUrl:'https://www.instagram.com/'+existing.handle+'/'};
  }
  if (new Date(c.expires_at)<=new Date() || !proof.identity?.follows) throw invalid();
  const existing=(await q('SELECT sender_id,provider_scope,status,handle FROM finfolk.instagram_connections WHERE user_id=$1',[uid]))[0];
  if(existing?.status==='connected' && (existing.sender_id!==c.sender_id || existing.provider_scope!==c.provider_scope))
    throw messagingError('instagram_already_connected','Disconnect your current Instagram account before connecting another.',409);
  let handle=existing?.status==='connected' ? existing.handle : null;
  if(!handle) {
    try { handle=await completeInstagramClaim(q,{uid,senderId:c.sender_id,handle:proof.identity.handle,actor:'instagram-connect',scope:c.provider_scope}); }
    catch(error) { if(error.code==='23505') throw messagingError('instagram_already_connected','This Instagram account is already connected. Manage the existing link first.',409); throw error; }
  }
  await q(`UPDATE finfolk.instagram_connect_codes SET consumed_by=$2,consumed_at=now(),consumed_version=(SELECT identity_version FROM finfolk.instagram_connections WHERE user_id=$2) WHERE id=$1`,[c.id,uid]);
  await q('UPDATE finfolk.instagram_dm_events SET owner_id=$2 WHERE id=$1',[c.event_id,uid]);
  return {state:'claimed',handle,profileUrl:'https://www.instagram.com/'+handle+'/'};
}
