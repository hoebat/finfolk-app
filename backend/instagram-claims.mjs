import { createHash } from 'node:crypto';
import { instagramHandle } from '../web/logbook-model.js';
const fail = (message,status=400) => {throw Object.assign(Error(message),{status});};
export const hashClaim = code => createHash('sha256').update(code.toLowerCase()).digest('hex');
export const dmConfigured = env => !!env.INSTAGRAM_ACCESS_TOKEN && /^\d{1,40}$/.test(env.INSTAGRAM_ACCOUNT_ID || '') && /^v\d+\.0$/.test(env.INSTAGRAM_GRAPH_VERSION || '');
export const dmEnabled = env => env.INSTAGRAM_DM_ENABLED==='true' && dmConfigured(env);
export const claimsEnabled = () => false;
export const reviewAvailable = () => false;
export async function claimStatus(q,uid,env) {
  const connection=(await q("SELECT c.handle,c.status,m.profile->>'instagram' AS profile_url FROM finfolk.members m LEFT JOIN finfolk.instagram_connections c ON c.user_id=m.user_id WHERE m.user_id=$1",[uid]))[0];
  const claim=(await q('SELECT state,handle,error,expires_at,review_requested_at FROM finfolk.instagram_claims WHERE user_id=$1',[uid]))[0];
  let state=connection?.status==='connected'?'claimed':claim?.state || 'ready';
  if(state==='claimed' && connection?.status!=='connected')state='ready';
  if(claim && !['claimed','cancelled'].includes(state) && new Date(claim.expires_at).getTime()<=Date.now())state='expired';
  if(state==='cancelled')state='ready';
  return {profileUrl:connection?.profile_url || '',enabled:claimsEnabled(env),reviewAvailable:reviewAvailable(env),state,handle:connection?.status==='connected'?connection.handle:claim?.handle || null,error:claim?.error || '',expiresAt:claim?.expires_at || null};
}
// Caller supplies a transaction-scoped query. Locking the member serialises claims,
// disconnects and command writes for the same FinFolk identity.
export async function completeInstagramClaim(q,{uid,senderId,handle,actor,codeHash,scope='facebook-login:legacy'}) {
  if(codeHash)throw Object.assign(Error('Use /connect to connect Instagram.'),{status:410,code:'claim_retired'});
  const identity=(await q(`SELECT m.user_id FROM finfolk.members m JOIN neon_auth."user" u ON u.id::text=m.user_id WHERE m.user_id=$1 AND NOT m.deleted AND u."emailVerified" AND coalesce(u.banned,false)=false FOR UPDATE OF m`,[uid]))[0];
  if(!identity)fail('Verify your FinFolk email and sign in again before connecting.');
  const current=(await q('SELECT sender_id,status,provider_scope,handle FROM finfolk.instagram_connections WHERE user_id=$1',[uid]))[0];
  if(current?.status==='connected' && (current.provider_scope===scope?current.sender_id!==senderId:current.handle?.toLowerCase()!==handle?.toLowerCase()))fail('Disconnect your current Instagram account in FinFolk before connecting another.');
  const taken=await q("SELECT user_id FROM finfolk.instagram_connections WHERE sender_id=$1 AND status='connected' AND user_id<>$2 AND provider_scope=$3",[senderId,uid,scope]);
  if(taken.length)fail('This Instagram account is already connected. Request help in FinFolk to resolve it.');
  const normalized=instagramHandle(handle);
  if(!normalized)fail('The Instagram username could not be verified.');
  await q(`INSERT INTO finfolk.instagram_connections(user_id,handle,sender_id,status,challenge_hash,expires_at,provider_scope)
    VALUES($1,$2,$3,'connected',null,null,$4) ON CONFLICT(user_id) DO UPDATE SET handle=excluded.handle,sender_id=excluded.sender_id,provider_scope=excluded.provider_scope,identity_version=gen_random_uuid(),media_owner_id=null,share_posts=false,status='connected',challenge_hash=null,expires_at=null,updated_at=now()`,[uid,normalized,senderId,scope]);
  await q("UPDATE finfolk.members SET profile=jsonb_set(profile,'{instagram}',to_jsonb($2::text)),updated_at=now() WHERE user_id=$1",[uid,'https://www.instagram.com/'+normalized+'/']);
  await q("UPDATE finfolk.instagram_claims SET state='cancelled',code_hash=null WHERE user_id=$1",[uid]);
  await q("INSERT INTO finfolk.instagram_audit(actor,event) VALUES($1,$2)",[actor,'claimed_instagram:'+uid]);
  // The connection's unique sender ID serialises competing referral awards.
  await q('UPDATE finfolk.invitation_joins SET verified_sender_id=$2,rewarded_at=now() WHERE invitee_id=$1 AND rewarded_at IS NULL AND NOT EXISTS(SELECT 1 FROM finfolk.invitation_joins WHERE verified_sender_id=$2)',[uid,senderId]);
  return normalized;
}
export async function instagramClaimAction({action,uid,env,q,verified}) {
  if(action==='instagramClaimStatus')return claimStatus(q,uid,env);
  verified();
  if(action==='instagramClaimReviewInbox')return [];
  throw Object.assign(Error('Claiming has been retired. Follow @finfolk.com.au, send /connect, then enter the code on FinFolk.'),{status:410,code:'claim_retired'});
}
