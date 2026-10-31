import { createHash, randomBytes } from "node:crypto";
import {
  matchInstagramBeach,
  ingestInstagramMedia,
} from "./instagram-discovery.mjs";
import { windowFor } from "./community-core.mjs";
const account = "https://finfolk.com.au/?view=account";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const numeric = (s) => /^\d{1,40}$/.test(String(s || ""));
const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const namespace = (env) =>
  "facebook-comments:" + env.INSTAGRAM_APP_ID + ":" + env.INSTAGRAM_ACCOUNT_ID;
export const commentHelp =
  "Mention @finfolk.com.au with /help, /status (this post), /me (your profile), /publish Beach or /checkin [YYYY-MM-DD] Beach. Check-ins are self-reported visits within the last 30 days. Manage privately: " +
  account;
export function parseCommentCommand(text = "") {
  if (
    typeof text !== "string" ||
    !/(^|\s)@finfolk\.com\.au(?=\s|$|[!?,])/i.test(text)
  )
    return null;
  const value = text
    .replace(/(^|\s)@finfolk\.com\.au(?=\s|$|[!?,])/gi, " ")
    .trim();
  if (!/(^|\s)\//.test(value)) return null;
  const m = value.match(
    /^\/(help|status|me|publish|checkin)(?:\s+([^\r\n]*))?$/i,
  );
  if (!m || (value.match(/(^|\s)\//g) || []).length !== 1)
    return { command: "help", invalid: true };
  const command = m[1].toLowerCase(),
    args = (m[2] || "").trim();
  if (
    /[\r\n]/.test(value) ||
    args.length > 200 ||
    (["help", "status"].includes(command) && args)
  )
    return { command: "help", invalid: true };
  if (command === "me")
    return !args
      ? { command, args: {} }
      : /^[a-f0-9]{24}$/i.test(args)
        ? { command, args: { challengeHash: hash(args.toLowerCase()) } }
        : { command: "help", invalid: true };
  const date =
    command === "checkin" ? args.match(/^\d{1,4}[-/]\S*(?=\s|$)/)?.[0] : null;
  return {
    command,
    args: { beach: date ? args.slice(date.length).trim() : args, day: date },
  };
}
export function checkinDay({ day, commentAt, now = new Date(), timezone }) {
  const range = windowFor(now, timezone);
  if (
    day &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day ||
      day < range.start ||
      day > range.today)
  )
    return { error: "Choose today or a date within the last 30 days." };
  if (
    !day &&
    (!commentAt ||
      !Number.isFinite(Date.parse(commentAt)) ||
      windowFor(new Date(commentAt), timezone).today !== range.today)
  )
    return { confirmation: true };
  return { day: day || range.today };
}
async function member(q, actor, ns) {
  return (
    await q(
      `SELECT c.user_id,c.handle,c.media_owner_id,c.share_posts,m.profile FROM finfolk.instagram_comment_identities i
    JOIN finfolk.instagram_connections c ON c.user_id=i.user_id AND c.sender_id=i.sender_id AND c.handle=i.handle AND c.status='connected'
    JOIN finfolk.members m ON m.user_id=c.user_id JOIN neon_auth."user" u ON u.id::text=m.user_id
    WHERE i.actor_id=$1 AND i.namespace=$2 AND NOT m.deleted AND u."emailVerified" AND NOT coalesce(u.banned,false) FOR UPDATE OF m`,
      [actor, ns],
    )
  )[0];
}
async function publicStatus(q, url, owner) {
  if (!url) return "This post has not been published on FinFolk.";
  const trips = await q(
    "SELECT t.id FROM finfolk.trips t JOIN finfolk.members m ON m.user_id=t.owner_id WHERE t.published IS NOT NULL AND NOT m.deleted AND (t.published->'links') ? $1 ORDER BY t.published_at DESC LIMIT 1",
    [url],
  );
  if (trips.length)
    return (
      "Published trip: https://finfolk.com.au/?view=trip&trip=" + trips[0].id
    );
  const published = await q(
    "SELECT d.beach_id FROM finfolk.instagram_discoveries d LEFT JOIN finfolk.members m ON m.user_id=d.owner_id WHERE d.url=$1 AND d.state='published' AND coalesce(m.deleted,false)=false UNION ALL SELECT p.beach_id FROM finfolk.posts p JOIN finfolk.members m ON m.user_id=p.owner_id WHERE p.url=$1 AND p.status='approved' AND p.public_consent AND NOT m.deleted LIMIT 1",
    [url],
  );
  if (published.length)
    return (
      "Published on FinFolk: https://finfolk.com.au/?view=maps&site=" +
      encodeURIComponent(published[0].beach_id)
    );
  if (
    owner &&
    (
      await q(
        "SELECT 1 FROM finfolk.instagram_discoveries WHERE url=$1 AND owner_id=$2 AND state='pending' UNION ALL SELECT 1 FROM finfolk.posts WHERE url=$1 AND owner_id=$2 AND status='pending' LIMIT 1",
        [url, owner],
      )
    ).length
  )
    return "Your post is awaiting review. " + account;
  return "This post has not been published on FinFolk.";
}
async function execute(q, row, env, identity, media, now) {
  if (row.command === "help") return { reply: commentHelp };
  if (row.command === "status")
    return { reply: await publicStatus(q, row.source_url, identity?.user_id) };
  if (!identity)
    return {
      reply:
        "Connect and verify your Instagram comment identity in FinFolk, then try again: " +
        account,
    };
  if (row.command === "me")
    return {
      reply: identity.profile?.open
        ? "Verified FinFolk profile: https://finfolk.com.au/?view=logbook&profile=" +
          encodeURIComponent(identity.user_id)
        : "Your Instagram is verified. Manage your private profile: " + account,
    };
  if (row.command === "publish") {
    if (env.INSTAGRAM_COMMAND_PUBLICATION_ENABLED !== "true")
      return { reply: "Post sharing requests are not open yet. " + account };
    if (!media)
      return { reply: "Submit your sharing request in FinFolk: " + account };
    const places = matchInstagramBeach(row.args.beach || media.caption || "");
    const author =
      identity.media_owner_id &&
      String(media.owner?.id) === identity.media_owner_id;
    // Recommendations by someone other than the independently verified media author stay in review.
    const result = await ingestInstagramMedia(
      media,
      "command:" + row.id,
      env,
      q,
      {
        beachId: places.length === 1 ? places[0].id : null,
        forceReview: !author || !identity.share_posts || places.length !== 1,
      },
    );
    return {
      reply: result
        ? "Your sharing request has been recorded. " + account
        : "Submit your sharing request in FinFolk: " + account,
    };
  }
  if (env.INSTAGRAM_COMMAND_CHECKINS_ENABLED !== "true")
    return {
      reply:
        "Instagram comment check-ins are not open yet. Check in privately: " +
        account,
    };
  const places = matchInstagramBeach(row.args.beach || "");
  const beach =
    places.length === 1
      ? (
          await q("SELECT * FROM finfolk.beaches WHERE id=$1", [places[0].id])
        )[0]
      : null;
  if (!beach)
    return {
      state: "confirmation",
      reply: "Finish your check-in privately in FinFolk: " + account,
    };
  const date = checkinDay({
    day: row.args.day,
    commentAt: row.comment_at?.toISOString?.() || row.comment_at,
    now,
    timezone: beach.timezone,
  });
  if (date.error) return { reply: date.error + " " + account };
  if (date.confirmation)
    return {
      state: "confirmation",
      reply: "Confirm your visit privately in FinFolk: " + account,
    };
  await q(
    "INSERT INTO finfolk.checkins(user_id,beach_id,visit_day) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [identity.user_id, beach.id, date.day],
  );
  return {
    reply: "Check-in saved. Manage your visits privately: " + account,
    beachId: beach.id,
    day: date.day,
  };
}
export async function processCommentCommand(
  comment,
  context,
  env,
  db,
  { fetcher = fetch, now = new Date() } = {},
) {
  const parsed = parseCommentCommand(comment.text);
  if (!parsed) return false;
  // Consume slash commands even while gated; never pass them to discovery or legacy actions.
  if (env.INSTAGRAM_COMMAND_REPLIES_ENABLED !== "true") return true;
  const actor = String(comment.from?.id || ""),
    id = String(comment.id || "");
  if (!numeric(actor) || !numeric(id) || actor === env.INSTAGRAM_ACCOUNT_ID)
    return true;
  const ns = namespace(env),
    media = comment.media;
  let source = null;
  try {
    const u = new URL(media?.permalink);
    if (
      u.protocol === "https:" &&
      ["www.instagram.com", "instagram.com"].includes(u.hostname) &&
      /^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)
    )
      source = "https://www.instagram.com" + u.pathname.replace(/\/?$/, "/");
  } catch {}
  await db.transaction(async (q) => {
    // Serialize the whole reservation scope; rolling limits cannot race across queue consumers.
    await q("SELECT pg_advisory_xact_lock(76425385)");
    const existing = (
      await q(
        "SELECT * FROM finfolk.instagram_commands WHERE id=$1 FOR UPDATE",
        [id],
      )
    )[0];
    if (existing) return;
    const limits = (
      await q(
        `SELECT
      count(*) FILTER(WHERE namespace=$1 AND actor_id=$2 AND received_at>now()-interval '10 minutes')::int AS sender,
      count(*) FILTER(WHERE media_id=$3 AND received_at>now()-interval '1 hour')::int AS post,
      count(*) FILTER(WHERE send_state<>'skipped' AND received_at>now()-interval '1 hour')::int AS brand
      FROM finfolk.instagram_commands WHERE received_at>now()-interval '1 hour'`,
        [ns, actor, String(media?.id || "")],
      )
    )[0];
    const limited =
      limits.sender >= 5 || limits.post >= 20 || limits.brand >= 100;
    await q(
      `INSERT INTO finfolk.instagram_commands(id,context,actor_id,namespace,media_id,command,args,source_url,comment_at,state,send_state)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
      [
        id,
        context,
        actor,
        ns,
        numeric(media?.id) ? String(media.id) : null,
        parsed.command,
        JSON.stringify(parsed.args || {}),
        source,
        Number.isFinite(Date.parse(comment.timestamp))
          ? new Date(comment.timestamp)
          : null,
        limited ? "limited" : "new",
        limited ? "skipped" : "pending",
      ],
    );
    if (limited) return;
    if (parsed.args?.challengeHash) {
      // Code possession plus provider-fetched handle and existing DM claim, never a handle-only match.
      await q(
        `UPDATE finfolk.instagram_comment_identities i SET actor_id=$1,challenge_hash=null,expires_at=null,updated_at=now()
        FROM finfolk.instagram_connections c,finfolk.members m,neon_auth."user" u
        WHERE i.challenge_hash=$2 AND i.expires_at>now() AND i.namespace=$3 AND c.user_id=i.user_id AND c.status='connected'
        AND c.sender_id=i.sender_id AND c.handle=i.handle AND lower(i.handle)=lower($4) AND m.user_id=i.user_id AND NOT m.deleted AND u.id::text=m.user_id AND u."emailVerified" AND NOT coalesce(u.banned,false)`,
        [
          actor,
          parsed.args.challengeHash,
          ns,
          String(comment.from?.username || ""),
        ],
      );
      await q(
        "UPDATE finfolk.instagram_commands SET args='{}'::jsonb WHERE id=$1",
        [id],
      );
    }
    const identity = await member(q, actor, ns),
      row = (
        await q("SELECT * FROM finfolk.instagram_commands WHERE id=$1", [id])
      )[0];
    const result = await execute(q, row, env, identity, media, now);
    await q(
      `UPDATE finfolk.instagram_commands SET owner_id=$2,state=$3,reply=$4,result=$4,beach_id=$5,visit_day=$6,updated_at=now() WHERE id=$1`,
      [
        id,
        identity?.user_id || null,
        result.state || "done",
        result.reply,
        result.beachId || null,
        result.day || null,
      ],
    );
  });
  await sendCommandReply(id, env, db, fetcher);
  return true;
}
export async function sendCommandReply(id, env, db, fetcher = fetch) {
  if (
    env.INSTAGRAM_COMMAND_REPLIES_ENABLED !== "true" ||
    !env.INSTAGRAM_ACCESS_TOKEN
  )
    return;
  const row = await db.transaction(async (q) => {
    await q("SELECT pg_advisory_xact_lock(76425385)");
    const pending = (
      await q(
        "SELECT * FROM finfolk.instagram_commands WHERE id=$1 AND send_state='pending' AND reply IS NOT NULL FOR UPDATE",
        [id],
      )
    )[0];
    if (!pending) return null;
    const limits = (
      await q(
        `SELECT count(*)::int AS brand,
      count(*) FILTER(WHERE namespace=$1 AND actor_id=$2 AND send_started_at>now()-interval '10 minutes')::int AS sender,
      count(*) FILTER(WHERE media_id=$3)::int AS post
      FROM finfolk.instagram_commands WHERE send_started_at>now()-interval '1 hour'`,
        [pending.namespace, pending.actor_id, pending.media_id],
      )
    )[0];
    if (limits.brand >= 100 || limits.sender >= 5 || limits.post >= 20)
      return null;
    if (pending.owner_id) {
      const identity = await member(q, pending.actor_id, pending.namespace);
      if (!identity || identity.user_id !== pending.owner_id) {
        await q(
          "UPDATE finfolk.instagram_commands SET send_state='skipped',updated_at=now() WHERE id=$1",
          [id],
        );
        return null;
      }
      if (pending.command === "me" && !identity.profile?.open)
        pending.reply =
          "Your Instagram is verified. Manage your private profile: " + account;
    }
    return (
      await q(
        "UPDATE finfolk.instagram_commands SET send_state='sending',send_started_at=now(),reply=$2,updated_at=now() WHERE id=$1 AND send_state='pending' RETURNING *",
        [id, pending.reply],
      )
    )[0];
  });
  if (!row) return;
  let replyId = null;
  try {
    if (
      !/^v\d+\.0$/.test(env.INSTAGRAM_GRAPH_VERSION || "") ||
      !numeric(env.INSTAGRAM_ACCOUNT_ID)
    )
      throw Error("Invalid configuration");
    const path =
      row.context === "owned"
        ? row.id + "/replies"
        : env.INSTAGRAM_ACCOUNT_ID + "/mentions";
    const body = new URLSearchParams({ message: row.reply });
    if (row.context === "mention") body.set("comment_id", row.id);
    const response = await fetcher(
      `https://graph.facebook.com/${env.INSTAGRAM_GRAPH_VERSION}/${path}`,
      {
        method: "POST",
        headers: { Authorization: "Bearer " + env.INSTAGRAM_ACCESS_TOKEN },
        body,
        signal: AbortSignal.timeout(15000),
      },
    );
    const output = await response.json();
    if (response.ok && numeric(output.id)) replyId = String(output.id);
  } catch {}
  // Any non-confirmed POST is ambiguous. Admin reconciles; automatic retries never resend.
  await db.query(
    "UPDATE finfolk.instagram_commands SET send_state=$2,reply_id=$3,updated_at=now() WHERE id=$1 AND send_state='sending'",
    [id, replyId ? "sent" : "uncertain", replyId],
  );
}
export async function reconcileCommentCommands(env, q) {
  await q(
    "UPDATE finfolk.instagram_commands SET send_state='uncertain',updated_at=now() WHERE send_state='sending' AND updated_at<now()-interval '20 minutes'",
  );
  if (env.INSTAGRAM_COMMAND_REPLIES_ENABLED === "true")
    for (const row of await q(
      "SELECT id FROM finfolk.instagram_commands WHERE send_state='pending' AND reply IS NOT NULL ORDER BY received_at LIMIT 50",
    ))
      await env.INSTAGRAM_QUEUE.send({
        kind: "instagram-comment-reply",
        id: row.id,
      });
  await q(
    "DELETE FROM finfolk.instagram_comment_identities WHERE challenge_hash IS NOT NULL AND expires_at<now() AND actor_id IS NULL",
  );
}
export async function commentCommandAction({
  action,
  v,
  uid,
  env,
  q,
  db,
  verified,
  admin,
}) {
  if (action === "instagramCommandStatus")
    return {
      enabled: env.INSTAGRAM_COMMAND_REPLIES_ENABLED === "true",
      checkins: env.INSTAGRAM_COMMAND_CHECKINS_ENABLED === "true",
      commands: await q(
        "SELECT id,command,state,result,send_state,received_at FROM finfolk.instagram_commands WHERE owner_id=$1 ORDER BY received_at DESC LIMIT 30",
        [uid],
      ),
    };
  if (action === "instagramCommandVerify") {
    if (typeof verified === "function") verified();
    else if (!verified) fail("Verify your email first.", 403);
    const code = randomBytes(12).toString("hex");
    await db.transaction(async (tq) => {
      await tq(
        "SELECT user_id FROM finfolk.members WHERE user_id=$1 FOR UPDATE",
        [uid],
      );
      const c = (
        await tq(
          "SELECT * FROM finfolk.instagram_connections WHERE user_id=$1 AND status='connected'",
          [uid],
        )
      )[0];
      if (!c?.sender_id) fail("Verify your Instagram connection first.");
      await tq(
        `INSERT INTO finfolk.instagram_comment_identities(user_id,namespace,sender_id,handle,challenge_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes') ON CONFLICT(user_id) DO UPDATE SET namespace=excluded.namespace,sender_id=excluded.sender_id,handle=excluded.handle,challenge_hash=excluded.challenge_hash,expires_at=excluded.expires_at,updated_at=now()`,
        [uid, namespace(env), c.sender_id, c.handle, hash(code)],
      );
    });
    return { command: "/me " + code + " @finfolk.com.au" };
  }
  if (action === "instagramCommandConfirm") {
    if (typeof verified === "function") verified();
    else if (!verified) fail("Verify your email first.", 403);
    if (env.INSTAGRAM_COMMAND_CHECKINS_ENABLED !== "true")
      fail("Comment check-ins are not open.", 403);
    return db.transaction(async (tq) => {
      const row = (
        await tq(
          "SELECT * FROM finfolk.instagram_commands WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [String(v.id), uid],
        )
      )[0];
      if (!row || row.command !== "checkin" || row.state !== "confirmation")
        fail("This check-in is no longer awaiting confirmation.", 409);
      const identity = await member(tq, row.actor_id, row.namespace);
      if (identity?.user_id !== uid)
        fail("Reconnect your verified Instagram identity.", 403);
      const beach = (
        await tq("SELECT * FROM finfolk.beaches WHERE id=$1", [
          String(v.beachId),
        ])
      )[0];
      if (!beach) fail("Choose a beach.");
      const date = checkinDay({
        day: v.day,
        now: new Date(),
        timezone: beach.timezone,
      });
      if (!v.day || date.error) fail(date.error || "Choose the visit date.");
      await tq(
        "INSERT INTO finfolk.checkins(user_id,beach_id,visit_day) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [uid, beach.id, date.day],
      );
      await tq(
        "UPDATE finfolk.instagram_commands SET state='done',beach_id=$2,visit_day=$3,result='Check-in saved.',updated_at=now() WHERE id=$1",
        [row.id, beach.id, date.day],
      );
      return { saved: true };
    });
  }
  if (action === "instagramCommandReview") {
    if (!admin) fail("Admin access required.", 403);
    return q(
      "SELECT id,command,state,send_state,reply_id,result,received_at FROM finfolk.instagram_commands ORDER BY received_at DESC LIMIT 100",
    );
  }
  if (action === "instagramCommandResolve") {
    if (!admin) fail("Admin access required.", 403);
    if (!["sent", "skipped"].includes(v.decision))
      fail("Mark sent after verifying the thread, or skip.");
    if (v.decision === "sent" && !numeric(v.replyId))
      fail("Enter the actual Instagram reply ID.");
    await q(
      "UPDATE finfolk.instagram_commands SET send_state=$2,reply_id=$3,updated_at=now() WHERE id=$1 AND send_state='uncertain'",
      [
        String(v.id),
        v.decision,
        v.decision === "sent" ? String(v.replyId) : null,
      ],
    );
    return { resolved: true };
  }
  fail("Unknown comment command action.");
}
