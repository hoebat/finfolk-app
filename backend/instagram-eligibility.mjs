import { messagingConfig } from "./messaging-config.mjs";
import { InstagramProvider } from "./instagram-provider.mjs";
// Never use a Facebook comment actor ID as an Instagram Login sender ID.
export async function instagramFollowerProof(
  uid,
  env,
  q,
  { fetcher = fetch } = {},
) {
  const connection = (
    await q(
      `SELECT c.user_id,c.sender_id,c.provider_scope,c.identity_version,c.handle,c.media_owner_id,c.share_posts FROM finfolk.instagram_connections c
    JOIN finfolk.members m ON m.user_id=c.user_id JOIN neon_auth."user" u ON u.id::text=m.user_id
    WHERE c.user_id=$1 AND c.status='connected' AND NOT m.deleted AND u."emailVerified" AND NOT coalesce(u.banned,false)`,
      [uid],
    )
  )[0];
  if (!connection) return { eligible: false, reason: "connection_required" };
  try {
    const config = await messagingConfig(q, env, { credentials: true });
    if (
      !config.token ||
      connection.provider_scope !== config.scope ||
      config.mode === "disabled" ||
      !config.checks?.authorization ||
      !config.checks?.subscription ||
      !config.checks?.liveDelivery ||
      (config.mode === "pilot" &&
        !config.pilot_sender_ids.includes(connection.sender_id)) ||
      (config.token_expires_at &&
        new Date(config.token_expires_at) <= new Date())
    )
      return { eligible: false, reason: "messaging_not_ready" };
    const profile = await new InstagramProvider(config, fetcher).profile(
      connection.sender_id,
    );
    if (!profile.follows) return { eligible: false, reason: "not_following" };
    if (profile.handle !== connection.handle.toLowerCase())
      return { eligible: false, reason: "identity_changed" };
    return {
      eligible: true,
      userId: uid,
      senderId: connection.sender_id,
      scope: connection.provider_scope,
      version: connection.identity_version,
      handle: connection.handle.toLowerCase(),
      mediaOwnerId: connection.media_owner_id,
      sharePosts: connection.share_posts,
      checkedAt: Date.now(),
    };
  } catch {
    return { eligible: false, reason: "follow_unverified" };
  }
}
export function proofMatches(proof, connection) {
  return !!(
    proof?.eligible &&
    Date.now() - proof.checkedAt >= 0 &&
    Date.now() - proof.checkedAt < 30000 &&
    proof.userId === connection?.user_id &&
    proof.senderId === connection.sender_id &&
    proof.scope === connection.provider_scope &&
    proof.version === connection.identity_version
  );
}
