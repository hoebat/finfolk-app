import { randomUUID } from 'node:crypto';
import { hashClaim, claimsEnabled, dmEnabled, completeInstagramClaim } from './instagram-claims.mjs';
import { windowFor } from './community-core.mjs';
const accountURL='https://finfolk.com.au/?view=account&tab=instagram';
export const commandHelp=`FinFolk commands:\n/help — available commands\n/claim <CODE> — claim your Instagram account\n/status — your connection\n/checkin <beach> — record today’s visit\n/points — your points\n\nFollow @finfolk.com.au, then get your claim command at ${accountURL}`;
export function parseInstagramCommand(text='') {
  const match=String(text).trim().match(/^\/([a-z]+)(?:\s+([^\r\n]*))?$/i);
  if(!match)return {command:String(text).trim().startsWith('/')?'unknown':'prompt',args:''};
  const command=match[1].toLowerCase(),args=(match[2] || '').trim();
  if(command==='claim')return /^[a-f0-9]{24}$/i.test(args)?{command,args:'',challengeHash:hashClaim(args)}:{command:'claim_usage',args:''};
  if(!['help','status','points','checkin'].includes(command))return {command:'unknown',args:''};
  if(command!=='checkin' && args)return {command:'unknown',args:''};
  return {command,args:args.slice(0,200)};
}
export async function collectInstagramDM(event,env,q) {
  if(!dmEnabled(env) || event.message?.is_echo || typeof event.message?.text!=='string')return;
  const sender=String(event.sender?.id || ''),recipient=String(event.recipient?.id || ''),mid=String(event.message?.mid || '');
  if(!/^\d{1,40}$/.test(sender) || recipient!==env.INSTAGRAM_ACCOUNT_ID || sender===recipient || !mid || mid.length>500)return;
  const parsed=parseInstagramCommand(event.message.text);
  const timestamp=Number(event.timestamp),when=Number.isFinite(timestamp) && timestamp>0?new Date(timestamp):new Date();
  if(!Number.isFinite(when.getTime()))return;
  const id='command:'+mid;
  const rows=await q(`INSERT INTO finfolk.instagram_dm_events(id,sender_id,recipient_id,command,args,challenge_hash,message_at,owner_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,coalesce((SELECT user_id FROM finfolk.instagram_claims WHERE code_hash=$6),(SELECT user_id FROM finfolk.instagram_connections WHERE sender_id=$2 AND status='connected'))) ON CONFLICT DO NOTHING RETURNING id`,[id,sender,recipient,parsed.command,parsed.args,parsed.challengeHash || null,when]);
  if(rows.length)await env.INSTAGRAM_QUEUE.send({kind:'instagram-dm',id});
}
export async function instagramSender(sender,env,fetcher=fetch) {
  const url=new URL(`https://graph.facebook.com/${env.INSTAGRAM_GRAPH_VERSION}/${sender}`);
  url.searchParams.set('fields','id,username,is_user_follow_business');
  const response=await fetcher(url,{headers:{Authorization:'Bearer '+env.INSTAGRAM_ACCESS_TOKEN},signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok || String(data.id)!==sender || typeof data.username!=='string' || !/^[a-z0-9._]{1,30}$/i.test(data.username) || typeof data.is_user_follow_business!=='boolean')throw Error('Instagram could not confirm the sender and follow status. Retry or request review in FinFolk.');
  return {handle:data.username.toLowerCase(),follows:data.is_user_follow_business};
}
const beachLabel=b=>[b.name,b.area_name,b.state].filter(Boolean).join(', ');
async function claimedMember(q,sender) {
  return (await q(`SELECT c.user_id,c.handle,m.profile FROM finfolk.instagram_connections c JOIN finfolk.members m ON m.user_id=c.user_id JOIN neon_auth."user" u ON u.id::text=m.user_id
    WHERE c.sender_id=$1 AND c.status='connected' AND NOT m.deleted AND u."emailVerified" AND coalesce(u.banned,false)=false FOR UPDATE OF m`,[sender]))[0];
}
async function commandResult(q,event,env,identity,identityError) {
  if(event.command==='prompt') {
    const sent=await q("UPDATE finfolk.instagram_dm_limits SET prompted_at=now() WHERE sender_id=$1 AND (prompted_at IS NULL OR prompted_at<now()-interval '24 hours') RETURNING sender_id",[event.sender_id]);
    return sent.length?'Hi! Send /help to see FinFolk commands.':null;
  }
  if(['help','unknown'].includes(event.command))return event.command==='help'?commandHelp:'I don’t recognise that command.\n\n'+commandHelp;
  if(event.command==='claim_usage')return 'Use /claim followed by your one-time code. Copy the complete command from '+accountURL;
  if(event.command==='claim') {
    if(!claimsEnabled(env))return 'Automatic Instagram claims are not open yet. Check '+accountURL;
    const c=(await q('SELECT * FROM finfolk.instagram_claims WHERE code_hash=$1 FOR UPDATE',[event.challenge_hash]))[0];
    if(!c || c.state==='cancelled')return 'That claim code is invalid or has been replaced. Get a new command at '+accountURL;
    if(c.state==='claimed') {
      const owner=await claimedMember(q,event.sender_id);
      return owner?.user_id===c.user_id?`@${owner.handle} is already claimed. Send /help for commands.`:'That code has already been used. Get your own command at '+accountURL;
    }
    if(new Date(c.expires_at).getTime()<=Date.now())return 'That claim code has expired. Generate a new command at '+accountURL;
    // Pin the first sender. Another Instagram account cannot hijack a retry/review.
    if(c.sender_id && c.sender_id!==event.sender_id)return 'This code was sent from another Instagram account. Generate a new command for this account at '+accountURL;
    if(identityError) {
      await q("UPDATE finfolk.instagram_claims SET state='failed',sender_id=$2,error=$3,updated_at=now() WHERE user_id=$1",[c.user_id,event.sender_id,identityError]);
      return identityError+' '+accountURL;
    }
    if(!identity?.follows) {
      await q("UPDATE finfolk.instagram_claims SET state='follow_required',sender_id=$2,handle=$3,error='Follow @finfolk.com.au, then resend the same claim command.',updated_at=now() WHERE user_id=$1",[c.user_id,event.sender_id,identity?.handle || null]);
      return 'Follow @finfolk.com.au, then resend the same /claim command. Your code is still valid.';
    }
    const handle=await completeInstagramClaim(q,{uid:c.user_id,senderId:event.sender_id,handle:identity.handle,actor:'instagram-dm',codeHash:c.code_hash});
    return `Your Instagram account @${handle} is now claimed on FinFolk.\nSend /help for commands or return to ${accountURL}`;
  }
  const owner=await claimedMember(q,event.sender_id);
  if(!owner)return 'This Instagram account is not claimed yet. Follow @finfolk.com.au, then copy and send your /claim command from '+accountURL;
  if(event.command==='status')return `@${owner.handle} is claimed on FinFolk. Your connection is active. Send /help for commands.`;
  if(event.command==='points') {
    const row=(await q(`SELECT (SELECT coalesce(sum(points),0) FROM finfolk.points_ledger WHERE user_id=$1 AND NOT reversed)::int AS participation,
      (SELECT count(*) FROM finfolk.invitation_joins WHERE inviter_id=$1 AND rewarded_at IS NOT NULL)::int AS referrals`,[owner.user_id]))[0];
    return `Your FinFolk points: ${row.participation} participation + ${row.referrals} referral = ${Number(row.participation)+Number(row.referrals)} total. No points reward depth or breath-hold performance.`;
  }
  if(event.command==='checkin') {
    if(!event.args) {
      const beaches=await q("SELECT name,area_name,state FROM finfolk.beaches WHERE id IN (SELECT jsonb_array_elements_text(profile->'beaches') FROM finfolk.members WHERE user_id=$1) ORDER BY name LIMIT 5",[owner.user_id]);
      return 'Use /checkin followed by the beach name.'+(beaches.length?'\nYour followed beaches:\n'+beaches.map(b=>'/checkin '+beachLabel(b)).join('\n'):'\nExample: /checkin Bondi Beach');
    }
    const name=event.args.toLowerCase().replace(/\s+/g,' ');
    const beaches=await q(`SELECT id,name,timezone,area_name,state FROM finfolk.beaches WHERE lower(name)=$1 OR lower(id)=$1
      OR lower(regexp_replace(name,' Beach$','','i'))=$1 OR lower(concat_ws(', ',name,nullif(area_name,''),nullif(state,'')))=$1
      OR lower(concat_ws(', ',name,nullif(area_name,'')))=$1 ORDER BY name,id LIMIT 6`,[name]);
    if(!beaches.length)return 'I couldn’t find that beach. Use its full name, or send /checkin to see your followed beaches.';
    if(beaches.length>1)return 'Which beach did you visit? Send one of these commands:\n'+beaches.slice(0,5).map(b=>'/checkin '+(beaches.filter(other=>beachLabel(other)===beachLabel(b)).length>1?b.id:beachLabel(b))).join('\n');
    const beach=beaches[0],{today}=windowFor(new Date(),beach.timezone);
    const inserted=await q('INSERT INTO finfolk.checkins(user_id,beach_id,visit_day) VALUES($1,$2,$3::date) ON CONFLICT DO NOTHING RETURNING visit_day',[owner.user_id,beach.id,today]);
    return inserted.length?`Checked in at ${beachLabel(beach)} for ${today}. Your profile and sharing preferences still apply.`:`You’re already checked in here today: ${beachLabel(beach)}.`;
  }
  return commandHelp;
}
async function sendDMReply(id,env,q,fetcher) {
  const row=(await q("UPDATE finfolk.instagram_dm_events SET send_state='sending',updated_at=now() WHERE id=$1 AND status='done' AND send_state='pending' AND reply IS NOT NULL AND message_at>now()-interval '24 hours' RETURNING sender_id,reply",[id]))[0];
  if(!row)return;
  try {
    const response=await fetcher(`https://graph.facebook.com/${env.INSTAGRAM_GRAPH_VERSION}/${env.INSTAGRAM_ACCOUNT_ID}/messages`,{
      method:'POST',headers:{Authorization:'Bearer '+env.INSTAGRAM_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({recipient:{id:row.sender_id},message:{text:row.reply}}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(!response.ok || !data.message_id)throw Error('Message delivery not confirmed');
    await q("UPDATE finfolk.instagram_dm_events SET send_state='sent',updated_at=now() WHERE id=$1 AND send_state='sending'",[id]);
  } catch {
    // Meta provides no proven idempotency contract here. Never blindly resend.
    await q("UPDATE finfolk.instagram_dm_events SET send_state='uncertain',error='Reply delivery uncertain; do not automatically resend.',updated_at=now() WHERE id=$1 AND send_state='sending'",[id]);
  }
}
export async function processInstagramDM(id,env,db,{fetcher=fetch}={}) {
  if(!dmEnabled(env))return;
  const lease=randomUUID();
  const event=(await db.query("UPDATE finfolk.instagram_dm_events SET status='processing',lease=$2,attempts=attempts+1,updated_at=now() WHERE id=$1 AND status IN ('queued','error') AND attempts<5 RETURNING *",[id,lease]))[0];
  if(!event){await sendDMReply(id,env,db.query,fetcher);return;}
  if(event.recipient_id!==env.INSTAGRAM_ACCOUNT_ID){await db.query("UPDATE finfolk.instagram_dm_events SET status='done',send_state='skipped',error='Recipient configuration changed',updated_at=now() WHERE id=$1 AND lease=$2",[id,lease]);return;}
  let identity,identityError;
  try {
    if(new Date(event.message_at).getTime()<Date.now()-86400000 || new Date(event.message_at).getTime()>Date.now()+300000) {
      await db.query("UPDATE finfolk.instagram_dm_events SET status='done',send_state='skipped',error='Message outside allowed processing window',updated_at=now() WHERE id=$1 AND lease=$2",[id,lease]);return;
    }
  const rate=(await db.query(`INSERT INTO finfolk.instagram_dm_limits(sender_id,count) VALUES($1,1) ON CONFLICT(sender_id) DO UPDATE
    SET minute=date_trunc('minute',now()),count=CASE WHEN instagram_dm_limits.minute=date_trunc('minute',now()) THEN instagram_dm_limits.count+1 ELSE 1 END RETURNING count`,[event.sender_id]))[0];
  if(rate.count>30){await db.query("UPDATE finfolk.instagram_dm_events SET status='done',send_state='skipped',error='Sender rate limit',updated_at=now() WHERE id=$1 AND lease=$2",[id,lease]);return;}
  if(event.command==='claim' && claimsEnabled(env)) {
    // Only ask Meta about a sender after matching a live, unused challenge.
    const valid=await db.query("SELECT 1 FROM finfolk.instagram_claims WHERE code_hash=$1 AND expires_at>now() AND state NOT IN ('claimed','cancelled')",[event.challenge_hash]);
    if(valid.length)await db.query("UPDATE finfolk.instagram_claims SET state='checking',sender_id=coalesce(sender_id,$2),updated_at=now() WHERE code_hash=$1 AND state IN ('waiting','failed','follow_required') AND (sender_id IS NULL OR sender_id=$2)",[event.challenge_hash,event.sender_id]);
    if(valid.length)try{identity=await instagramSender(event.sender_id,env,fetcher);}catch{identityError='Instagram could not confirm the sender and follow status. Retry or request review in FinFolk.';}
  }
    await db.transaction(async q=>{
      const locked=(await q("SELECT id FROM finfolk.instagram_dm_events WHERE id=$1 AND lease=$2 AND status='processing' FOR UPDATE",[id,lease]))[0];
      if(!locked)return;
      if(new Date(event.message_at).getTime()<Date.now()-86400000 || new Date(event.message_at).getTime()>Date.now()+300000) {
        await q("UPDATE finfolk.instagram_dm_events SET status='done',send_state='skipped',error='Message outside allowed processing window',updated_at=now() WHERE id=$1",[id]);return;
      }
      const reply=await commandResult(q,event,env,identity,identityError);
      await q("UPDATE finfolk.instagram_dm_events SET status='done',reply=$2,send_state=$3,error='',updated_at=now() WHERE id=$1",[id,reply,reply?'pending':'skipped']);
    });
  }catch(error) {
    if(error.status || error.code==='23505') {
      const reply=error.status?error.message:'This Instagram account is already claimed. Request help in FinFolk.';
      await db.query("UPDATE finfolk.instagram_dm_events SET status='done',reply=$3,send_state='pending',error='',updated_at=now() WHERE id=$1 AND lease=$2 AND status='processing'",[id,lease,reply]);
      if(event.challenge_hash)await db.query("UPDATE finfolk.instagram_claims SET state='failed',sender_id=coalesce(sender_id,$2),error=$3,updated_at=now() WHERE code_hash=$1 AND state NOT IN ('claimed','cancelled')",[event.challenge_hash,event.sender_id,reply]);
    } else {
      await db.query("UPDATE finfolk.instagram_dm_events SET status='error',error='Command processing failed',updated_at=now() WHERE id=$1 AND lease=$2 AND status='processing'",[id,lease]);if(event.challenge_hash)await db.query("UPDATE finfolk.instagram_claims SET state='failed',error='Verification could not finish. Resend your command or request review.',updated_at=now() WHERE code_hash=$1 AND state='checking'",[event.challenge_hash]);
      throw Error('Command processing failed');
    }
  }
  await sendDMReply(id,env,db.query,fetcher);
}
export async function reconcileInstagramDM(env,q) {
  await q("UPDATE finfolk.instagram_dm_events SET status='error',error='Processing interrupted',updated_at=now() WHERE status='processing' AND updated_at<now()-interval '5 minutes'");
  await q("UPDATE finfolk.instagram_dm_events SET send_state='uncertain',error='Delivery interrupted',updated_at=now() WHERE send_state='sending' AND updated_at<now()-interval '5 minutes'");
  if(dmEnabled(env))for(const row of await q("SELECT id FROM finfolk.instagram_dm_events WHERE ((status IN ('queued','error') AND attempts<5) OR (status='done' AND send_state='pending')) AND message_at>now()-interval '24 hours' ORDER BY created_at LIMIT 50"))await env.INSTAGRAM_QUEUE.send({kind:'instagram-dm',id:row.id});
  await q("DELETE FROM finfolk.instagram_dm_events WHERE created_at<now()-interval '30 days'");
  await q("DELETE FROM finfolk.instagram_dm_limits WHERE minute<now()-interval '30 days'");
}
