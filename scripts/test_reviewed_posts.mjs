// Migration + real Postgres/API checks on the isolated, expiring feature branch.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { database } from '../backend/db.mjs';
import { createAPI } from '../backend/api.mjs';
const branch='finfolk-community-pilot-test', project='odd-voice-85400108';
const url=execFileSync('neon',['connection-string',branch,'--project-id',project],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const host=new URL(url).hostname;
if(!host.startsWith('ep-little-thunder-a7s1soji')) throw Error('Unexpected database endpoint. Refusing integration test.');
execFileSync(process.execPath,['scripts/migrate_neon.mjs'],{env:{...process.env,DATABASE_URL_UNPOOLED:url},stdio:['ignore','pipe','pipe']});
const db=database(url),q=db.query;
const admin=randomUUID(), owner=randomUUID(), viewer=randomUUID(), unverified=randomUUID(),ids=[admin,owner,viewer,unverified];
const env={COMMUNITY_POSTS_ENABLED:'true',INSTAGRAM_ADMIN_IDS:admin};
const app=createAPI({db,verify:async token=>{if(!ids.includes(token))throw Error('Invalid test token');return {sub:token};}});
async function call(uid,action,data={},expected=200){
 const response=await app.request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json',...(uid?{Authorization:'Bearer '+uid}:{})},body:JSON.stringify({action,...data})},env);
 const value=await response.json();assert.equal(response.status,expected,JSON.stringify(value));return value.data;
}
async function feed(cursor='',settings=env,postId=''){const response=await app.request('http://localhost/community/posts?beachId=bondi&cursor='+encodeURIComponent(cursor)+'&postId='+postId,{},settings);assert.equal(response.status,200);return response.json();}
const submission={beachId:'bondi',url:'https://www.instagram.com/p/FinfolkPilotTest/',creatorHandle:'test.diver',ownPost:true,tagged:true,publicConsent:true};
try {
 for(const uid of ids)await q(`INSERT INTO neon_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,'Pilot test',$2,$3,now(),now())`,[uid,uid+'@example.com',uid!==unverified]);
 for(const uid of ids)await call(uid,'me');
 await call(null,'reviewPosts',{},401);
 await call(viewer,'reviewPosts',{},403);
 await call(unverified,'post',submission,403);
 await call(owner,'post',{...submission,publicConsent:false},400);
 await call(owner,'post',{...submission,url:'https://example.com/post'},400);
 await call(owner,'post',{...submission,url:'https://www.tiktok.com/@someone/video/123',creatorHandle:'different'},400);
 const post=await call(owner,'post',submission);
 assert.equal(post.status,'pending'); assert.equal((await feed()).posts.length,0);
 await call(owner,'post',submission,409);
 await call(admin,'reviewPost',{id:post.id,decision:'approved'},400);
 await call(admin,'reviewPost',{id:post.id,decision:'approved',ownershipChecked:true,tagChecked:true,beachChecked:true});
 let publicFeed=await feed();assert.equal(publicFeed.posts[0].id,post.id);
 assert.equal(publicFeed.posts[0].creator_handle,'test.diver');assert.ok(!('owner_id' in publicFeed.posts[0]));
 assert.equal((await call(owner,'me')).profile.open,false);
 await call(viewer,'preferences',{profile:{displayName:'Pilot',beaches:['bondi']}});
 assert.equal((await call(viewer,'followedPosts')).posts.length,1);
 await call(owner,'block',{target:viewer});
 assert.equal((await call(viewer,'posts',{beachId:'bondi'})).posts.length,0);
 assert.equal((await call(viewer,'followedPosts')).posts.length,0);
 await call(viewer,'reportPost',{id:post.id,reason:'Wrong beach'});
 let queue=await call(admin,'reviewPosts');assert.equal(queue.reports.length,1);
 await call(admin,'reviewPost',{id:post.id,decision:'removed',reason:'Beach mismatch'});
 assert.equal((await feed()).posts.length,0);
 await call(admin,'resolvePostReport',{id:queue.reports[0].id});
 await call(owner,'post',submission);
 await call(admin,'reviewPost',{id:post.id,decision:'rejected',reason:'Please correct the tag.'});
 assert.equal((await call(owner,'myPosts'))[0].rejection_reason,'Please correct the tag.');
 await call(owner,'post',submission);
 await call(owner,'removePost',{id:post.id});
 await call(admin,'reviewPost',{id:post.id,decision:'approved',ownershipChecked:true,tagChecked:true,beachChecked:true},409);
 assert.equal((await feed()).posts.length,0);
 await call(viewer,'removePost',{id:post.id},404);
 assert.equal((await feed('',{})).enabled,false);
 await call(admin,'communityMetrics');
 // Equal timestamps test cursor tie-breaking, including microseconds.
 for(let i=0;i<23;i++)await q(`INSERT INTO finfolk.posts(owner_id,beach_id,url,platform,creator_handle,status,public_consent,created_at) VALUES($1,'bondi',$2,'instagram','test.diver','approved',true,'2026-10-30T01:02:03.123456Z')`,[owner,'https://www.instagram.com/p/Pagination'+i]);
 const first=await feed(),second=await feed(first.cursor);
 assert.equal(first.posts.length,20);assert.equal(second.posts.length,3);
 assert.equal(new Set([...first.posts,...second.posts].map(p=>p.id)).size,23);
 assert.equal((await feed('',env,second.posts[2].id)).posts[0].id,second.posts[2].id);
 assert.equal((await feed('',env,post.id)).posts.length,0);
 const click=await app.request('http://localhost/community/referral',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId:first.posts[0].id})},env);assert.equal(click.status,200);
 assert.ok((await call(admin,'communityMetrics')).referrals.some(r=>Number(r.clicks)>0));
 await call(owner,'deleteAccount');
 assert.equal((await feed()).posts.length,0);
 console.log('Reviewed posts integration passed: migrated isolated branch, verified submissions, consent, moderation, admin access, public/Closed separation, blocking, reports, withdrawal races, microsecond pagination, metrics and account deletion.');
}finally{
 for(const uid of ids){await q('DELETE FROM finfolk.members WHERE user_id=$1',[uid]);await q('DELETE FROM neon_auth."user" WHERE id::text=$1',[uid]);}
 await db.pool.end();
}
