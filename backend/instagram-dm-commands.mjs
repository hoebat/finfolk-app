import { issueConnectCode } from './instagram-connect.mjs';
import { commands } from "./messaging-config.mjs";
import { windowFor } from "./community-core.mjs";
const accountURL = "https://finfolk.com.au/?view=account&tab=instagram";
export const followRequiredReply =
  "Please follow @finfolk.com.au to use this feature.\nhttps://www.instagram.com/finfolk.com.au/\n\nOnce you’re following, send the same command again. You can use /help without following or connecting an account.";
export const helpText = (enabled = Object.keys(commands)) =>
  "Hey! Welcome to FinFolk 🌊\nYour coastal companion for finding beaches, exploring depths and keeping your dive memories together.\n\nAvailable here:\n" +
  Object.entries(commands)
    .filter(([name]) => enabled.includes(name))
    .map(([, c]) => c.syntax + " — " + c.description)
    .join("\n") +
  "\n\nGet started: https://finfolk.com.au\nExplore the map or sign in to start your logbook.\n\nYou don’t need to follow or connect your account to ask for help. Please follow @finfolk.com.au to connect your account and use member features, comments and posts.";
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
  if (command === "claim") return { command: "claim_retired", args: "" };
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
    return sent.length
      ? "Hi! Send /help to see FinFolk commands. Everyone can message us. Please follow @finfolk.com.au to connect your account and use member features."
      : null;
  }
  if (["help", "unknown"].includes(event.command))
    return event.command === "help"
      ? helpText(env.MESSAGING_ENABLED_COMMANDS)
      : "I don’t recognise that command.\n\n" +
          helpText(env.MESSAGING_ENABLED_COMMANDS);
  if (event.command === "claim_retired") return "/claim has been retired. Follow @finfolk.com.au and send /connect to receive a code, then enter it on FinFolk: " + accountURL;
  if (event.command === "connect") return issueConnectCode(q, event, env, identity);
  const owner = await claimedMember(
    q,
    event.sender_id,
    env.MESSAGING_PROVIDER_SCOPE,
  );
  if (!owner)
    return (
      "This Instagram account is not connected yet. Follow @finfolk.com.au, send /connect, then enter the code at " +
      accountURL
    );
  if (event.command === "status")
    return `@${owner.handle} is connected to FinFolk. Your connection is active. Send /help for commands.`;
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
