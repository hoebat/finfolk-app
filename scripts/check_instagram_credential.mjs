const token=process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
const brand='17841461601419539',app='1667613151655339';
if(!token){console.log(JSON.stringify({secretPresent:false}));process.exitCode=1;}else{
 const records=[];
 async function probe(host,path,label,extract){
  try{
   const response=await fetch('https://'+host+'/v26.0/'+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
   let data;try{data=await response.json();}catch{records.push({label,status:response.status,unreadable:true});return;}
   records.push({label,status:response.status,...(data.error?{errorCode:data.error.code,errorSubcode:data.error.error_subcode}:{data:extract(data)})});
  }catch{records.push({label,transportFailed:true});}
 }
 await probe('graph.facebook.com','me?fields=id','facebook_identity',d=>({identityPresent:!!d.id,isBrand:String(d.id)===brand}));
 await probe('graph.instagram.com','me?fields=id,username','instagram_identity',d=>({identityPresent:!!d.id,isBrand:String(d.id)===brand,usernameMatches:d.username?.toLowerCase()==='finfolk.com.au'}));
 await probe('graph.facebook.com',brand+'?fields=id,username','facebook_brand_access',d=>({isBrand:String(d.id)===brand,usernameMatches:d.username?.toLowerCase()==='finfolk.com.au'}));
 await probe('graph.facebook.com','me/permissions','facebook_permissions',d=>({permissions:(d.data||[]).map(p=>({permission:p.permission,status:p.status}))}));
 await probe('graph.facebook.com',brand+'/subscribed_apps','facebook_brand_subscription',d=>({appSubscribed:(d.data||[]).some(a=>String(a.id)===app),fields:(d.data||[]).filter(a=>String(a.id)===app).flatMap(a=>a.subscribed_fields||[])}));
 await probe('graph.facebook.com','me/assigned_instagram_accounts?fields=id,username','unified_assigned_accounts',d=>({brandAssigned:(d.data||[]).some(a=>String(a.id)===brand&&a.username?.toLowerCase()==='finfolk.com.au'),accountCount:(d.data||[]).length}));
 console.log('INSTAGRAM_TOKEN_DIAGNOSTIC '+JSON.stringify({secretPresent:true,records}));
}
