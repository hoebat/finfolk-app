import { randomBytes } from "node:crypto";
const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
export async function rewardInvitation(q, userId, senderId) {
  // A sender can produce one referral reward, even after changing handles or disconnecting.
  try {
    await q(
      "UPDATE finfolk.invitation_joins SET verified_sender_id=$2,rewarded_at=now() WHERE invitee_id=$1 AND rewarded_at IS NULL AND NOT EXISTS(SELECT 1 FROM finfolk.invitation_joins WHERE verified_sender_id=$2)",
      [userId, senderId],
    );
  } catch (e) {
    if (e.code !== "23505") throw e;
  }
}
export async function invitationAction({ action, v, uid, q, verified }) {
  verified();
  if (action === "invitationStatus") {
    await q(
      "INSERT INTO finfolk.invitations(code,inviter_id) VALUES($1,$2) ON CONFLICT(inviter_id) DO NOTHING",
      [randomBytes(18).toString("base64url"), uid],
    );
    const invite = (
      await q("SELECT code FROM finfolk.invitations WHERE inviter_id=$1", [uid])
    )[0];
    const stats = (
      await q(
        "SELECT count(*)::integer AS joined,count(rewarded_at)::integer AS verified FROM finfolk.invitation_joins WHERE inviter_id=$1",
        [uid],
      )
    )[0];
    return {
      url: `https://finfolk.com.au/?view=account&invite=${invite.code}`,
      joined: stats.joined,
      verified: stats.verified,
      points: stats.verified,
    };
  }
  if (action === "invitationClaim") {
    if (typeof v.code !== "string" || !/^[-_A-Za-z0-9]{24}$/.test(v.code))
      fail("Invalid invite.");
    const member = (
      await q(
        "SELECT invite_eligible,joined_at FROM finfolk.members WHERE user_id=$1",
        [uid],
      )
    )[0];
    if (
      !member?.invite_eligible ||
      Date.now() - new Date(member.joined_at).getTime() > 7 * 86400000
    )
      fail("Invites apply to new members within seven days of joining.");
    const inviter = (
      await q("SELECT inviter_id FROM finfolk.invitations WHERE code=$1", [
        v.code,
      ])
    )[0];
    if (!inviter || inviter.inviter_id === uid)
      fail("This invitation cannot be used.");
    await q(
      "INSERT INTO finfolk.invitation_joins(invitee_id,inviter_id) VALUES($1,$2) ON CONFLICT(invitee_id) DO NOTHING",
      [uid, inviter.inviter_id],
    );
    const connected = (
      await q(
        "SELECT sender_id FROM finfolk.instagram_connections WHERE user_id=$1 AND status='connected'",
        [uid],
      )
    )[0];
    if (connected) await rewardInvitation(q, uid, connected.sender_id);
    return { ok: true };
  }
  fail("Unknown invitation action.");
}
