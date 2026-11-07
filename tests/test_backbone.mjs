import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {memberProfile,withActor,saveMemberProfile,recordMemberCheckin} from '../backend/backbone.mjs';
const pg=new PGlite();
const query=async(sql,args=[]) => (await pg.query(sql,args)).rows;
const db={query,transaction:fn=>pg.transaction(tx=>fn(async(sql,args=[]) => (await tx.query(sql,args)).rows))};
try {
 await pg.exec('CREATE ROLE finfolk_api; CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id text PRIMARY KEY,name text,"emailVerified" boolean,banned boolean);');
 await pg.exec(`INSERT INTO neon_auth."user"(id,"emailVerified",banned) VALUES('alice',true,false),('bob',false,false)`);
 await pg.exec(await readFile('backend/migrations/0001_community.sql','utf8'));
 await pg.exec(await readFile('db/generated/pilot.sql','utf8'));
 await query("INSERT INTO finfolk.members(user_id,profile) VALUES('alice','{\"displayName\":\"Alice\"}'),('bob','{\"displayName\":\"Bob\"}')");
 assert.deepEqual(await memberProfile(db,'alice'),{displayName:'Alice'});
 assert.deepEqual(await memberProfile(db,'bob'),{displayName:'Bob'});
 await query("INSERT INTO finfolk.beaches VALUES('bondi','Bondi','Australia/Sydney')");
 assert.deepEqual(await saveMemberProfile(db,'alice',{displayName:'Updated',open:true}),{displayName:'Updated',open:true});
 await assert.rejects(()=>saveMemberProfile(db,'bob',{displayName:'Bob',open:true}),/not permitted/);
 const visit=await recordMemberCheckin(db,'alice','bondi');assert.equal(visit.count,1);
 assert.equal((await recordMemberCheckin(db,'alice','bondi')).count,1,'Duplicate day is idempotent');
 await assert.rejects(()=>recordMemberCheckin(db,'bob','bondi'),/Verify/);
 await assert.rejects(()=>recordMemberCheckin(db,'alice','missing'),/valid beach/);

 assert.equal((await query('SELECT finfolk_rpc.member_profile() AS profile'))[0].profile,null,'Actor context cannot leak outside a transaction');
 await assert.rejects(()=>withActor(db,'alice',async()=>{throw Error('rollback');}),/rollback/);
 assert.equal((await query('SELECT finfolk_rpc.member_profile() AS profile'))[0].profile,null);
 await query("UPDATE finfolk.members SET deleted=true WHERE user_id='alice'");
 assert.equal(await memberProfile(db,'alice'),null);
 await assert.rejects(()=>memberProfile(db,"alice';SELECT 1"),/Invalid authenticated actor/);
 assert.equal((await query("SELECT has_function_privilege('finfolk_api','finfolk_rpc.member_profile()','EXECUTE') AS allowed"))[0].allowed,true);
 console.log('BACKBONE_PILOT_PASS: generated PostgreSQL functions, actor isolation, rollback cleanup and deleted profiles.');
} finally { await pg.close(); }
