import { createHash, randomBytes } from 'node:crypto';
import { instagramHandle } from '../web/logbook-model.js';
const fail = (message,status=400) => {throw Object.assign(Error(message),{status});};
export const hashClaim = code => createHash('sha256').update(code.toLowerCase()).digest('hex');
export const dmConfigured = env => !!env.INSTAGRAM_ACCESS_TOKEN && /^\d{1,40}$/.test(env.INSTAGRAM_ACCOUNT_ID || '') && /^v\d+\.0$/.test(env.INSTAGRAM_GRAPH_VERSION || '');
export const dmEnabled = env => env.INSTAGRAM_DM_ENABLED==='true' && dmConfigured(env);
export const claimsEnabled = env => dmEnabled(env) && env.INSTAGRAM_AUTO_CLAIM_ENABLED==='true';
export const reviewAvailable = env => (env.INSTAGRAM_ADMIN_IDS || '').split(',').some(s=>s.trim());
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
  const identity=(await q(`SELECT m.user_id FROM finfolk.members m JOIN neon_auth."user" u ON u.id::text=m.user_id WHERE m.user_id=$1 AND NOT m.deleted AND u."emailVerified" AND coalesce(u.banned,false)=false FOR UPDATE OF m`,[uid]))[0];
  if(!identity)fail('Verify your FinFolk email and sign in again before claiming.');
  const current=(await q('SELECT sender_id,status,provider_scope,handle FROM finfolk.instagram_connections WHERE user_id=$1',[uid]))[0];
  if(current?.status==='connected' && (current.provider_scope===scope?current.sender_id!==senderId:current.handle?.toLowerCase()!==handle?.toLowerCase()))fail('Disconnect your current Instagram account in FinFolk before claiming another.');
  const taken=await q("SELECT user_id FROM finfolk.instagram_connections WHERE sender_id=$1 AND status='connected' AND user_id<>$2 AND provider_scope=$3",[senderId,uid,scope]);
  if(taken.length)fail('This Instagram account is already claimed. Request help in FinFolk to resolve it.');
  const normalized=instagramHandle(handle);
  if(!normalized)fail('The Instagram username could not be verified.');
  await q(`INSERT INTO finfolk.instagram_connections(user_id,handle,sender_id,status,challenge_hash,expires_at,provider_scope)
    VALUES($1,$2,$3,'connected',null,null,$4) ON CONFLICT(user_id) DO UPDATE SET handle=excluded.handle,sender_id=excluded.sender_id,provider_scope=excluded.provider_scope,status='connected',challenge_hash=null,expires_at=null,updated_at=now()`,[uid,normalized,senderId,scope]);
  await q("UPDATE finfolk.members SET profile=jsonb_set(profile,'{instagram}',to_jsonb($2::text)),updated_at=now() WHERE user_id=$1",[uid,'https://www.instagram.com/'+normalized+'/']);
  const changed=await q("UPDATE finfolk.instagram_claims SET state='claimed',sender_id=$2,handle=$3,error='',follow_checked_at=now(),verified_by=$4,updated_at=now() WHERE user_id=$1 AND code_hash=$5 RETURNING user_id",[uid,senderId,normalized,actor,codeHash]);
  if(!changed.length)fail('This claim was replaced. Generate a new command in FinFolk.',409);
  await q("INSERT INTO finfolk.instagram_audit(actor,event) VALUES($1,$2)",[actor,'claimed_instagram:'+uid]);
  // The connection's unique sender ID serialises competing referral awards.
  await q('UPDATE finfolk.invitation_joins SET verified_sender_id=$2,rewarded_at=now() WHERE invitee_id=$1 AND rewarded_at IS NULL AND NOT EXISTS(SELECT 1 FROM finfolk.invitation_joins WHERE verified_sender_id=$2)',[uid,senderId]);
  return normalized;
}
export async function instagramClaimAction({action,v,uid,env,q,db,verified,admin}) {
  if(action==='instagramClaimStatus')return claimStatus(q,uid,env);
  verified();
  if(action==='instagramClaimStart') {
    if(!claimsEnabled(env))fail('Instagram claims are not open yet. Your profile link is available separately.',503);
    if((await q("SELECT 1 FROM finfolk.instagram_connections WHERE user_id=$1 AND status='connected' AND provider_scope=$2",[uid,env.MESSAGING_PROVIDER_SCOPE || 'facebook-login:legacy'])).length)fail('Your Instagram account is already claimed. Disconnect it before claiming another.',409);
    const code=randomBytes(12).toString('hex');
    await q("UPDATE finfolk.instagram_connections SET status='disconnected',sender_id=null,challenge_hash=null WHERE user_id=$1 AND status='pending'",[uid]);
    const row=(await q(`INSERT INTO finfolk.instagram_claims(user_id,code_hash,expires_at,provider_scope) VALUES($1,$2,now()+interval '1 day',$3)
      ON CONFLICT(user_id) DO UPDATE SET claim_id=gen_random_uuid(),provider_scope=excluded.provider_scope,code_hash=excluded.code_hash,state='waiting',sender_id=null,handle=null,error='',expires_at=excluded.expires_at,follow_checked_at=null,review_requested_at=null,verified_by=null,updated_at=now() RETURNING expires_at,claim_id`,[uid,hashClaim(code),env.MESSAGING_PROVIDER_SCOPE || 'facebook-login:legacy']))[0];
    return {id:row.claim_id,command:'/claim '+code,expiresAt:row.expires_at,state:'waiting'};
  }
  if(action==='instagramClaimRequestReview') {
    if(!reviewAvailable(env))fail('Manual help is not available yet. Please try again later.',503);
    const rows=await q(`UPDATE finfolk.instagram_claims c SET state='review_requested',review_requested_at=now(),updated_at=now()
      WHERE c.user_id=$1 AND c.state IN ('failed','follow_required','waiting') AND c.expires_at>now() AND c.sender_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM finfolk.instagram_dm_events e WHERE e.challenge_hash=c.code_hash AND e.sender_id=c.sender_id AND e.recipient_id=$2 AND e.provider_scope=c.provider_scope) RETURNING user_id`,[uid,env.INSTAGRAM_ACCOUNT_ID || '']);
    if(!rows.length)fail('Send your current /claim command from Instagram before requesting review.');
    return {ok:true};
  }
  if(action==='instagramClaimReviewInbox') {
    if(!admin)fail('Administrator access required.',403);
    return q("SELECT claim_id,user_id,handle,sender_id,error,expires_at,review_requested_at FROM finfolk.instagram_claims WHERE state='review_requested' ORDER BY review_requested_at LIMIT 100");
  }
  if(action==='instagramClaimReview') {
    if(!admin)fail('Administrator access required.',403);
    if(!['approve','reject'].includes(v.decision))fail('Choose approve or reject.');
    if(v.decision==='reject') {
      const reason=typeof v.reason==='string'?v.reason.trim():'';
      if(!reason || reason.length>1000)fail('Enter a rejection reason of up to 1,000 characters.');
      const rejected=await q("UPDATE finfolk.instagram_claims SET state='failed',error=$2,verified_by=$3,updated_at=now() WHERE user_id=$1 AND state='review_requested' RETURNING user_id",[v.userId,reason,uid]);
      if(!rejected.length)fail('The claim changed. Refresh the review queue.',409);
      await q('INSERT INTO finfolk.instagram_audit(actor,event) VALUES($1,$2)',[uid,'rejected_instagram_claim:'+v.userId]);
      return {ok:true};
    }
    if(v.senderChecked!==true || v.followChecked!==true)fail('Check the actual message sender and that they follow @finfolk.com.au.');
    try { await db.transaction(async tq=>{
      const c=(await tq("SELECT * FROM finfolk.instagram_claims WHERE user_id=$1 AND state='review_requested' AND expires_at>now() FOR UPDATE",[v.userId]))[0];
      if(!c?.sender_id)fail('The claim changed or expired. Refresh the review queue.',409);
      if(!(await tq('SELECT 1 FROM finfolk.instagram_dm_events WHERE challenge_hash=$1 AND sender_id=$2 AND recipient_id=$3 AND provider_scope=$4',[c.code_hash,c.sender_id,env.INSTAGRAM_ACCOUNT_ID || '',c.provider_scope])).length)fail('No matching Instagram message was received.');
      await completeInstagramClaim(tq,{uid:c.user_id,senderId:c.sender_id,handle:v.handle,actor:uid,codeHash:c.code_hash,scope:c.provider_scope});
    }); } catch(error) { if(error.code==='23505')fail('This Instagram account is already claimed. Resolve the existing connection before approving.',409);throw error; }
    return {ok:true};
  }
  fail('Unknown claim action.');
}
