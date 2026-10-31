import {
  hashClaim,
  claimsEnabled,
  completeInstagramClaim,
} from "./instagram-claims.mjs";
import { commands } from "./messaging-config.mjs";
import { windowFor } from "./community-core.mjs";
const accountURL = "https://finfolk.com.au/?view=account&tab=instagram";
export const helpText = (enabled = Object.keys(commands)) =>
  "Hey! Welcome to FinFolk 🌊\nYour coastal companion for finding beaches, exploring depths and keeping your dive memories together.\n\nAvailable here:\n" +
  Object.entries(commands)
    .filter(([name]) => enabled.includes(name))
    .map(([, c]) => c.syntax + " — " + c.description)
    .join("\n") +
  "\n\nGet started: https://finfolk.com.au\nExplore the map or sign in to start your logbook.\n\nYou don’t need to follow or connect your account to ask for help.";
export const commandHelp = helpText();
export function parseInstagramCommand(text = "") {
  const match = String(text)
    .trim()
    .match(/^\/([a-z]+)(?:\s+([^\r\n]*))?$/i);
  if (!match)
    return {
      command: String(text).trim().startsWith("/") ? "unknown" : "prompt",
      args: "",
    };
  const command = match[1].toLowerCase(),
    args = (match[2] || "").trim();
  if (command === "claim")
    return /^[a-f0-9]{24}$/i.test(args)
      ? { command, args: "", challengeHash: hashClaim(args) }
      : { command: "claim_usage", args: "" };
  if (!Object.keys(commands).includes(command))
    return { command: "unknown", args: "" };
  if (command !== "checkin" && args) return { command: "unknown", args: "" };
  return { command, args: args.slice(0, 200) };
}
const beachLabel = (b) =>
  [b.name, b.area_name, b.state].filter(Boolean).join(", ");
async function claimedMember(q, sender, scope) {
  return (
    await q(
      `SELECT c.user_id,c.handle,m.profile FROM finfolk.instagram_connections c JOIN finfolk.members m ON m.user_id=c.user_id JOIN neon_auth."user" u ON u.id::text=m.user_id
    WHERE c.sender_id=$1 AND c.provider_scope=$2 AND c.status='connected' AND NOT m.deleted AND u."emailVerified" AND coalesce(u.banned,false)=false FOR UPDATE OF m`,
      [sender, scope],
    )
  )[0];
}
export async function commandResult(q, event, env, identity, identityError) {
  if (event.command === "ping")
    return "Pong. Reference: " + event.correlation_id;
  if (event.command === "prompt") {
    const sent = await q(
      "UPDATE finfolk.instagram_dm_limits SET prompted_at=now() WHERE sender_id=$1 AND (prompted_at IS NULL OR prompted_at<now()-interval '24 hours') RETURNING sender_id",
      [event.rate_limit_key],
    );
    return sent.length ? "Hi! Send /help to see FinFolk commands." : null;
  }
  if (["help", "unknown"].includes(event.command))
    return event.command === "help"
      ? helpText(env.MESSAGING_ENABLED_COMMANDS)
      : "I don’t recognise that command.\n\n" +
          helpText(env.MESSAGING_ENABLED_COMMANDS);
  if (event.command === "claim_usage")
    return (
      "Use /claim followed by your one-time code. Copy the complete command from " +
      accountURL
    );
  if (event.command === "claim") {
    if (!claimsEnabled(env))
      return "Automatic Instagram claims are not open yet. Check " + accountURL;
    const c = (
      await q(
        "SELECT * FROM finfolk.instagram_claims WHERE code_hash=$1 AND provider_scope=$2 FOR UPDATE",
        [event.challenge_hash, env.MESSAGING_PROVIDER_SCOPE],
      )
    )[0];
    if (!c || c.state === "cancelled")
      return (
        "That claim code is invalid or has been replaced. Get a new command at " +
        accountURL
      );
    if (c.state === "claimed") {
      const owner = await claimedMember(
        q,
        event.sender_id,
        env.MESSAGING_PROVIDER_SCOPE,
      );
      return owner?.user_id === c.user_id
        ? `@${owner.handle} is already claimed. Send /help for commands.`
        : "That code has already been used. Get your own command at " +
            accountURL;
    }
    if (new Date(c.expires_at).getTime() <= Date.now())
      return (
        "That claim code has expired. Generate a new command at " + accountURL
      );
    // Pin the first sender. Another Instagram account cannot hijack a retry/review.
    if (c.sender_id && c.sender_id !== event.sender_id)
      return (
        "This code was sent from another Instagram account. Generate a new command for this account at " +
        accountURL
      );
    if (identityError) {
      await q(
        "UPDATE finfolk.instagram_claims SET state='failed',sender_id=$2,error=$3,updated_at=now() WHERE user_id=$1",
        [c.user_id, event.sender_id, identityError],
      );
      return identityError + " " + accountURL;
    }
    if (!identity?.follows) {
      await q(
        "UPDATE finfolk.instagram_claims SET state='follow_required',sender_id=$2,handle=$3,error='Follow @finfolk.com.au, then resend the same claim command.',updated_at=now() WHERE user_id=$1",
        [c.user_id, event.sender_id, identity?.handle || null],
      );
      return "Follow @finfolk.com.au, then resend the same /claim command. Your code is still valid.";
    }
    const handle = await completeInstagramClaim(q, {
      uid: c.user_id,
      senderId: event.sender_id,
      handle: identity.handle,
      actor: "instagram-dm",
      codeHash: c.code_hash,
      scope: env.MESSAGING_PROVIDER_SCOPE,
    });
    return `Your Instagram account @${handle} is now claimed on FinFolk.\nSend /help for commands or return to ${accountURL}`;
  }
  const owner = await claimedMember(
    q,
    event.sender_id,
    env.MESSAGING_PROVIDER_SCOPE,
  );
  if (!owner)
    return (
      "This Instagram account is not claimed yet. Follow @finfolk.com.au, then copy and send your /claim command from " +
      accountURL
    );
  if (event.command === "status")
    return `@${owner.handle} is claimed on FinFolk. Your connection is active. Send /help for commands.`;
  if (event.command === "points") {
    const row = (
      await q(
        `SELECT (SELECT coalesce(sum(points),0) FROM finfolk.points_ledger WHERE user_id=$1 AND NOT reversed)::int AS participation,
      (SELECT count(*) FROM finfolk.invitation_joins WHERE inviter_id=$1 AND rewarded_at IS NOT NULL)::int AS referrals`,
        [owner.user_id],
      )
    )[0];
    return `Your FinFolk points: ${row.participation} participation + ${row.referrals} referral = ${Number(row.participation) + Number(row.referrals)} total. No points reward depth or breath-hold performance.`;
  }
  if (event.command === "checkin") {
    if (!event.args) {
      const beaches = await q(
        "SELECT name,area_name,state FROM finfolk.beaches WHERE id IN (SELECT jsonb_array_elements_text(profile->'beaches') FROM finfolk.members WHERE user_id=$1) ORDER BY name LIMIT 5",
        [owner.user_id],
      );
      return (
        "Use /checkin followed by the beach name." +
        (beaches.length
          ? "\nYour followed beaches:\n" +
            beaches.map((b) => "/checkin " + beachLabel(b)).join("\n")
          : "\nExample: /checkin Bondi Beach")
      );
    }
    const name = event.args.toLowerCase().replace(/\s+/g, " ");
    const beaches = await q(
      `SELECT id,name,timezone,area_name,state FROM finfolk.beaches WHERE lower(name)=$1 OR lower(id)=$1
      OR lower(regexp_replace(name,' Beach$','','i'))=$1 OR lower(concat_ws(', ',name,nullif(area_name,''),nullif(state,'')))=$1
      OR lower(concat_ws(', ',name,nullif(area_name,'')))=$1 ORDER BY name,id LIMIT 6`,
      [name],
    );
    if (!beaches.length)
      return "I couldn’t find that beach. Use its full name, or send /checkin to see your followed beaches.";
    if (beaches.length > 1)
      return (
        "Which beach did you visit? Send one of these commands:\n" +
        beaches
          .slice(0, 5)
          .map(
            (b) =>
              "/checkin " +
              (beaches.filter((other) => beachLabel(other) === beachLabel(b))
                .length > 1
                ? b.id
                : beachLabel(b)),
          )
          .join("\n")
      );
    const beach = beaches[0],
      { today } = windowFor(new Date(event.message_at), beach.timezone);
    const inserted = await q(
      "INSERT INTO finfolk.checkins(user_id,beach_id,visit_day) VALUES($1,$2,$3::date) ON CONFLICT DO NOTHING RETURNING visit_day",
      [owner.user_id, beach.id, today],
    );
    return inserted.length
      ? `Checked in at ${beachLabel(beach)} for ${today}. Your profile and sharing preferences still apply.`
      : `You’re already checked in here today: ${beachLabel(beach)}.`;
  }
  return commandHelp;
}
