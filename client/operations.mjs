// Browser contract registry. The existing server remains authoritative for access.
const reads={
 member:'me profile myCheckins', community:'community stats connections blocks',
 logbook:'sessions session', posts:'postStatus posts followedPosts myPosts reviewPosts communityMetrics',
 trips:'tripList tripGet tripDives tripPreview tripReviewInbox',
 instagram:'instagramActions instagramAdminInbox instagramClaimStatus instagramClaimReviewInbox instagramCommandStatus instagramDiscoveryInbox instagramDiscoveryStatus instagramMyPosts instagramStatus',
 invitations:'invitationStatus',
};
const writes={
 member:'preferences', community:'checkin removeCheckin connection block unblock report',
 logbook:'saveSession deleteSession visibility', posts:'post removePost reportPost reviewPost resolvePostReport',
 trips:'tripSave tripDelete tripImportBegin tripImportBatch tripImportConfirm tripPublish tripUnpublish tripReport tripReview',
 instagram:'instagramBindMediaOwner instagramCancel instagramChoosePostBeach instagramClaimRequestReview instagramClaimReview instagramClaimStart instagramCommandConfirm instagramCommandResolve instagramCommandReview instagramCommandVerify instagramConfirm instagramConnect instagramDisconnect instagramDiscoveryRetry instagramHidePost instagramPointsConsent instagramProfileLink instagramReconcile instagramRemoveAllPosts instagramRetryEvent instagramReversePoints instagramReview instagramReviewPost instagramSharing instagramSuppressSource instagramVerify',
 invitations:'invitationClaim', memberDelete:'deleteAccount',
};
export const operations={};
for(const [write,groups] of [[false,reads],[true,writes]])for(const [domain,names] of Object.entries(groups))for(const name of names.split(' '))operations[name]={name,domain:domain==='memberDelete'?'member':domain,auth:true,write,transport:'action'};
const rest=[
 ['instagramAccount','GET','/v1/me/instagram','instagram'],
 ['instagramCodeConnect','POST','/v1/me/instagram/connect','instagram'],
 ['instagramProfile','PUT','/v1/me/instagram/profile','instagram'],
 ['instagramUnlink','DELETE','/v1/me/instagram','instagram'],
 ['instagramClaimCreate','POST','/v1/me/instagram/claims','instagram'],
 ['instagramClaimRead','GET','/v1/me/instagram/claims/:id','instagram'],
 ['instagramClaimRequest','POST','/v1/me/instagram/claims/:id/review-request','instagram'],
 ['messagingSettings','GET','/v1/admin/messaging/instagram','admin'],
 ['messagingSettingsSave','PUT','/v1/admin/messaging/instagram','admin'],
 ['messagingEvents','GET','/v1/admin/messaging/events','admin'],
 ['messagingEvent','GET','/v1/admin/messaging/events/:id','admin'],
 ['messagingEventRetry','POST','/v1/admin/messaging/events/:id/retry','admin'],
 ['messagingClaimReviews','GET','/v1/admin/messaging/claim-reviews','admin'],
 ['messagingClaimDecision','POST','/v1/admin/messaging/claim-reviews/:id/decision','admin'],
 ['messagingAuthorize','POST','/v1/admin/messaging/instagram/authorization','admin'],
 ['publicPosts','GET','/community/posts','posts',false],
 ['publicReferral','POST','/community/referral','posts',false],
 ['publicTrips','GET','/trips','trips',false],
 ['publicTrip','GET','/trips/:id','trips',false],
 ['publicInstagram','GET','/instagram/posts','instagram',false],
 ['publicInstagramReport','POST','/instagram/posts/:id/report','instagram',false],
];
for(const [name,method,path,domain,auth=true] of rest)operations[name]={name,method,path,domain,auth,write:method!=='GET',transport:'rest'};
export function operation(name){const spec=operations[name];if(!spec)throw Error('Unknown substrate operation: '+name);return spec;}
export function restOperation(path,method='GET'){
 const pathname=new URL(path,'https://local.invalid').pathname;
 for(const spec of Object.values(operations))if(spec.transport==='rest' && spec.method===method && new RegExp('^'+spec.path.replace(/:[a-z]+/g,'[^/]+')+'$').test(pathname))return spec;
 throw Error('Unknown substrate endpoint: '+method+' '+pathname);
}
// Invalidate by affected domain; privacy changes also invalidate public views.
export function affectedDomains(spec){return [...new Set([spec.domain,...({member:['community','logbook','posts','trips'],community:['member','logbook','posts','trips'],logbook:['community','trips'],instagram:['posts','member','admin'],admin:['instagram','posts'],invitations:['member']}[spec.domain]||[])])];}
for(const name of 'reviewPosts reviewPost resolvePostReport communityMetrics tripReviewInbox tripReview instagramAdminInbox instagramVerify instagramRetryEvent instagramReconcile instagramReversePoints instagramReview instagramClaimReviewInbox instagramClaimReview instagramCommandResolve instagramCommandVerify instagramDiscoveryInbox instagramBindMediaOwner instagramDiscoveryRetry instagramSuppressSource'.split(' '))operations[name].admin=true;
for(const spec of Object.values(operations))if(spec.path?.startsWith('/v1/admin/'))spec.admin=true;
