import { instagramFollowerProof } from "./instagram-eligibility.mjs";

const fail = (code, message, status) => {
  throw Object.assign(Error(message), { code, status });
};

// Manual submissions use a verified connected handle plus explicit per-post
// consent and human ownership review. Discovered media additionally requires
// independent media-owner evidence and the member's sharing preference.
export async function instagramPublicationProof(
  uid, env, q, { handle, authorId, sharing = false, fetcher = fetch } = {},
) {
  const proof = await instagramFollowerProof(uid, env, q, { fetcher });
  if (!proof.eligible) {
    if (proof.reason === "not_following")
      fail("instagram_follow_required", "Please follow @finfolk.com.au to use Instagram post features.", 403);
    if (proof.reason === "connection_required" || proof.reason === "identity_changed")
      fail("instagram_connection_required", "Connect and verify your current Instagram account before sharing posts.", 403);
    fail("instagram_follow_unverified", "Instagram follow status could not be verified. Please try again shortly.", 503);
  }
  if (handle !== undefined && String(handle).toLowerCase() !== proof.handle)
    fail("instagram_owner_mismatch", "Submit posts from your connected Instagram account.", 403);
  if (authorId !== undefined && (!authorId || authorId !== proof.mediaOwnerId))
    fail("instagram_owner_unverified", "Verify the Instagram post owner's connected account before publishing.", 403);
  if (sharing && !proof.sharePosts)
    fail("instagram_sharing_required", "The post owner must enable public sharing before publishing.", 403);
  return proof;
}

// Only the parameter number and fixed options are interpolated. Proof values
// stay parameterized JSON supplied by server-side follower verification.
// Lock connection/member rows through the effect so concurrent disconnect or
// consent changes cannot overtake a successful eligibility check.
export function instagramPublicationSQL(parameter, { sharing = false, mediaOwner = false } = {}) {
  if (!Number.isSafeInteger(parameter) || parameter < 1) throw Error("Invalid proof parameter.");
  const p = `($${parameter}::jsonb)`;
  return `EXISTS(SELECT 1 FROM finfolk.instagram_connections c
    JOIN finfolk.members m ON m.user_id=c.user_id
    JOIN neon_auth."user" u ON u.id::text=m.user_id
    JOIN finfolk.messaging_accounts a ON a.id='instagram' AND a.provider_scope=c.provider_scope
    WHERE c.user_id=${p}->>'userId' AND c.status='connected'
    AND c.sender_id=${p}->>'senderId' AND c.provider_scope=${p}->>'scope'
    AND c.identity_version=(${p}->>'version')::uuid
    AND lower(c.handle)=${p}->>'handle'
    AND (${p}->>'eligible')::boolean
    AND (${p}->>'checkedAt')::numeric BETWEEN extract(epoch FROM clock_timestamp())*1000-30000 AND extract(epoch FROM clock_timestamp())*1000
    AND NOT m.deleted AND u."emailVerified" AND NOT coalesce(u.banned,false)
    AND a.mode IN ('pilot','live') AND (a.token_expires_at IS NULL OR a.token_expires_at>now())
    AND a.checks->>'authorization'='true' AND a.checks->>'subscription'='true' AND a.checks->>'liveDelivery'='true'
    AND (a.mode='live' OR a.pilot_sender_ids ? c.sender_id)
    ${sharing ? "AND c.share_posts" : ""}
    ${mediaOwner ? `AND c.media_owner_id=${p}->>'mediaOwnerId'` : ""}
    FOR SHARE OF c,m)`;
}
