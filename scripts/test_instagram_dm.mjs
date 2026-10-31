// Explicitly isolated database + restricted production role, with mocked Meta transport.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID,createHmac } from 'node:crypto';
import { database } from '../backend/db.mjs';
import { createAPI } from '../backend/api.mjs';
import { instagramWebhook } from '../backend/instagram-webhook.mjs';
import { processInstagramDM,reconcileInstagramDM } from '../backend/instagram-dm.mjs';
const branch='finfolk-community-pilot-test',project='odd-voice-85400108';
const connection=role=>execFileSync('neon',['connection-string',branch,'--project-id',project,...(role?['--role-name',role]:[])],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const url=connection();if(!new URL(url).hostname.startsWith('ep-little-thunder-a7s1soji'))throw Error('Unexpected isolated endpoint.');
execFileSync(process.execPath,['scripts/migrate_neon.mjs'],{env:{...process.env,DATABASE_URL_UNPOOLED:url},stdio:['ignore','pipe','pipe']});
const db=database(url),runtime=database(connection('finfolk_api')),q=db.query;
const owner=randomUUID(),other=randomUUID(),admin=randomUUID(),unverified=randomUUID(),third=randomUUID(),users=[owner,other,admin,unverified,third];
const base=String(Date.now()),sender=base+'1',otherSender=base+'2',thirdSender=base+'3',brand='99999999',queued=[],replies=[];
const env={INSTAGRAM_ACCESS_TOKEN:'test-only',INSTAGRAM_APP_SECRET:'test-secret',INSTAGRAM_ACCOUNT_ID:brand,INSTAGRAM_GRAPH_VERSION:'v26.0',INSTAGRAM_DM_ENABLED:'true',INSTAGRAM_AUTO_CLAIM_ENABLED:'true',INSTAGRAM_ADMIN_IDS:admin,INSTAGRAM_QUEUE:{send:async m=>queued.push(m)}};
const app=createAPI({db:runtime,verify:async token=>{if(!users.includes(token))throw Error('Invalid');return {sub:token};}});
let follows=true,profileError=false,sendError=false,serial=0;
const fetcher=async(url,options={})=>{
 if(options.method==='POST'){if(sendError)throw Error('Uncertain send');replies.push(JSON.parse(options.body));return {ok:true,json:async()=>({message_id:'reply-'+serial++})};}
 if(profileError)return {ok:true,json:async()=>({username:'missing.follow'})};
 const id=new URL(url).pathname.split('/').pop();return {ok:true,json:async()=>({id,username:id===sender?'owner.dives':id===otherSender?'other.dives':'third.dives',is_user_follow_business:follows})};
};
async function call(uid,action,values={},expected=200){const r=await app.request('http://localhost/api',{method:'POST',headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json'},body:JSON.stringify({action,...values})},env);const result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));return result.data;}
async function incoming(who,text,mid='dm-'+base+'-'+serial++,when=Date.now()){
 const payload=JSON.stringify({object:'instagram',entry:[{id:brand,messaging:[{sender:{id:who},recipient:{id:brand},timestamp:when,message:{mid,text}}]}]});
 const signature='sha256='+createHmac('sha256',env.INSTAGRAM_APP_SECRET).update(payload).digest('hex');
 const response=await instagramWebhook(new Request('https://api.test/instagram/webhook',{method:'POST',headers:{'x-hub-signature-256':signature},body:payload}),env,runtime.query);assert.equal(response.status,200);
 while(queued.length){const job=queued.shift();if(job.kind==='instagram-dm')await processInstagramDM(job.id,env,runtime,{fetcher});}
 return 'command:'+mid;
}
const command=async uid=>(await call(uid,'instagramClaimStart')).command;
try{
 for(const uid of users){await q(`INSERT INTO neon_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,'DM test',$2,$3,now(),now())`,[uid,uid+'@example.com',uid!==unverified]);await call(uid,'me');}
 await q('INSERT INTO finfolk.invitation_joins(invitee_id,inviter_id) VALUES($1,$2)',[owner,admin]);
 await call(unverified,'instagramClaimStart',{},403);
 const start=await command(owner);assert.match(start,/^\/claim [a-f0-9]{24}$/);
 const record=(await q('SELECT * FROM finfolk.instagram_claims WHERE user_id=$1',[owner]))[0];assert.notEqual(record.code_hash,start.split(' ')[1]);
 follows=false;await incoming(sender,start);assert.equal((await call(owner,'instagramClaimStatus')).state,'follow_required');assert.match(replies.at(-1).message.text,/Follow @finfolk/);
 follows=true;const message='claim-'+base;await incoming(sender,start,message);assert.equal((await call(owner,'instagramClaimStatus')).state,'claimed');
 assert.equal((await call(owner,'me')).profile.instagram,'https://www.instagram.com/owner.dives/');assert.equal((await call(owner,'me')).profile.open,false);
 assert.equal((await q('SELECT count(*)::int AS n FROM finfolk.invitation_joins WHERE verified_sender_id=$1 AND rewarded_at IS NOT NULL',[sender]))[0].n,1);
 const count=replies.length;await incoming(sender,start,message);assert.equal(replies.length,count,'Duplicate webhook must not send twice');
 await incoming(sender,'/status');assert.match(replies.at(-1).message.text,/owner.dives.*claimed/);
 await incoming(sender,'/points');assert.match(replies.at(-1).message.text,/total/);
 await incoming(sender,'/help');assert.match(replies.at(-1).message.text,/\/checkin/);
 await incoming(sender,'/unknown');assert.match(replies.at(-1).message.text,/don’t recognise/);
 await incoming(sender,'/checkin Bondi Beach');assert.match(replies.at(-1).message.text,/Checked in at/);
 await incoming(sender,'/checkin Bondi Beach');assert.match(replies.at(-1).message.text,/already checked in/);
 assert.equal((await call(owner,'myCheckins')).length,1);
 await incoming(sender,'/checkin');assert.match(replies.at(-1).message.text,/Use \/checkin/);
 await incoming(sender,'/checkin not-a-beach');assert.match(replies.at(-1).message.text,/couldn’t find/);
 const a='dm-test-a-'+base,b='dm-test-b-'+base;
 await q("INSERT INTO finfolk.beaches(id,name,timezone,area_name,state) VALUES($1,'Test Shelly','Australia/Sydney','Manly','NSW'),($2,'Test Shelly','Australia/Sydney','Elsewhere','NSW')",[a,b]);
 await incoming(sender,'/checkin Test Shelly');assert.match(replies.at(-1).message.text,/Which beach/);assert.match(replies.at(-1).message.text,/Manly/);
 await incoming(sender,'/checkin Test Shelly, Manly, NSW');assert.match(replies.at(-1).message.text,/Checked in/);
 const old=await command(other),replacement=await command(other);await incoming(otherSender,old);assert.match(replies.at(-1).message.text,/invalid or has been replaced/);
 profileError=true;await incoming(otherSender,replacement);assert.equal((await call(other,'instagramClaimStatus')).state,'failed');
 await incoming(thirdSender,replacement);assert.match(replies.at(-1).message.text,/another Instagram account/);
 await call(other,'instagramClaimRequestReview');await call(owner,'instagramClaimReviewInbox',{},403);
 const reviews=await call(admin,'instagramClaimReviewInbox');assert.ok(reviews.some(c=>c.user_id===other));
 await call(admin,'instagramClaimReview',{userId:other,decision:'approve',handle:'other.dives',senderChecked:true},400);
 await call(admin,'instagramClaimReview',{userId:other,decision:'approve',handle:'other.dives',senderChecked:true,followChecked:true});assert.equal((await call(other,'instagramClaimStatus')).state,'claimed');profileError=false;
 const thirdCode=await command(third);await incoming(sender,thirdCode);assert.equal((await call(owner,'instagramClaimStatus')).handle,'owner.dives');assert.notEqual((await call(third,'instagramClaimStatus')).state,'claimed');
 const expire=await command(third);await q("UPDATE finfolk.instagram_claims SET expires_at=now()-interval '1 minute' WHERE user_id=$1",[third]);await incoming(thirdSender,expire);assert.match(replies.at(-1).message.text,/expired/);
 await call(owner,'instagramDisconnect');await incoming(sender,'/status');assert.match(replies.at(-1).message.text,/not claimed/);
 const newCode=await command(owner);await incoming(sender,newCode);assert.equal((await call(owner,'instagramClaimStatus')).state,'claimed');
 sendError=true;const uncertain=await incoming(sender,'/points');sendError=false;const before=replies.length;await processInstagramDM(uncertain,env,runtime,{fetcher});assert.equal(replies.length,before);assert.equal((await q('SELECT send_state FROM finfolk.instagram_dm_events WHERE id=$1',[uncertain]))[0].send_state,'uncertain');
 const stale=await incoming(sender,'/checkin Bondi Beach','stale-'+base,Date.now()-90000000);assert.equal((await q('SELECT send_state FROM finfolk.instagram_dm_events WHERE id=$1',[stale]))[0].send_state,'skipped');
 await incoming(thirdSender,'hello');const prompted=replies.length;await incoming(thirdSender,'hello again');assert.equal(replies.length,prompted);
 await q("UPDATE finfolk.instagram_dm_limits SET minute=date_trunc('minute',now()),count=30 WHERE sender_id=$1",[thirdSender]);
 const limited=await incoming(thirdSender,'/help');assert.equal((await q('SELECT send_state FROM finfolk.instagram_dm_events WHERE id=$1',[limited]))[0].send_state,'skipped');
 await call(owner,'deleteAccount');
 assert.equal((await q('SELECT count(*)::int AS n FROM finfolk.instagram_dm_events WHERE owner_id=$1',[owner]))[0].n,0);
 assert.equal((await q('SELECT count(*)::int AS n FROM finfolk.instagram_claims WHERE user_id=$1',[owner]))[0].n,0);
 await reconcileInstagramDM(env,runtime.query);
 console.log('Instagram DM integration passed under finfolk_api: signed webhook, follow gate, identity proof, generated/replaced/expired codes, automatic and manual claims, private commands, beach disambiguation, duplicate effects/replies, uncertain delivery and stale messages.');
}finally{
 for(const who of [sender,otherSender,thirdSender]){await q('DELETE FROM finfolk.instagram_dm_events WHERE sender_id=$1',[who]);await q('DELETE FROM finfolk.instagram_dm_limits WHERE sender_id=$1',[who]);}
 for(const uid of users){await q('DELETE FROM finfolk.members WHERE user_id=$1',[uid]);await q('DELETE FROM neon_auth."user" WHERE id::text=$1',[uid]);}
 await q("DELETE FROM finfolk.beaches WHERE id LIKE $1",['dm-test-%-'+base]);
 await runtime.pool.end();await db.pool.end();
}
