// Actor context must be set on the same connection and transaction as the operation.
export async function withActor(db, uid, operation) {
  if(typeof uid!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw Error('Invalid authenticated actor.');
  return db.transaction(async query=>{
    await query("SELECT set_config('finfolk.actor_id',$1,true)",[uid]);
    return operation(query);
  });
}
export async function memberProfile(db,uid) {
  return withActor(db,uid,async q=>(await q('SELECT finfolk_rpc.member_profile() AS profile'))[0]?.profile);
}

export async function saveMemberProfile(db,uid,value) {
  const result=await withActor(db,uid,async q=>(await q('SELECT finfolk_rpc.profile_save($1::jsonb) AS profile',[JSON.stringify(value)]))[0]?.profile);
  if(!result)throw Object.assign(Error('Profile update is not permitted.'),{status:403});
  return result;
}
export async function recordMemberCheckin(db,uid,beachId) {
  return withActor(db,uid,async q=>{
    const result=(await q('SELECT finfolk_rpc.checkin_record($1) AS result',[beachId]))[0]?.result;
    if(!result)throw Object.assign(Error('Verify your email and select a valid beach.'),{status:403});
    const count=(await q("SELECT count(*)::integer AS count FROM finfolk.checkins WHERE user_id=$1 AND beach_id=$2 AND visit_day BETWEEN $3::date-29 AND $3::date",[uid,beachId,result.day]))[0].count;
    return {...result,count};
  });
}

export async function lookupIdentity(query,uid){return (await query('SELECT finfolk_rpc.auth_identity($1) AS identity',[uid]))[0]?.identity;}
