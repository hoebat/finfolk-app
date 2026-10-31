import { processCommentCommand, reconcileCommentCommands } from './instagram-commands.mjs';
import { instagramGraph } from './instagram-discovery.mjs';
import { collectInstagramDM } from './instagram-dm.mjs';
import { collectMention } from "./instagram-collector.mjs";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { parseActionRequest } from "./instagram-actions.mjs";
export function validSignature(raw, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature || "")) return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    createHmac("sha256", secret).update(raw).digest(),
  );
}
export async function instagramWebhook(request, env, q) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    if (
      env.INSTAGRAM_VERIFY_TOKEN &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === env.INSTAGRAM_VERIFY_TOKEN
    )
      return new Response(url.searchParams.get("hub.challenge") || "");
    return new Response("Verification failed", { status: 403 });
  }
  if (!env.INSTAGRAM_APP_SECRET || !env.INSTAGRAM_QUEUE)
    return Response.json({ error: "Integration unavailable" }, { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > 262144)
    return new Response("", { status: 413 });
  const raw = await request.text();
  if (raw.length > 262144) return new Response("", { status: 413 });
  if (
    !validSignature(
      raw,
      request.headers.get("x-hub-signature-256"),
      env.INSTAGRAM_APP_SECRET,
    )
  )
    return new Response("", { status: 403 });
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return new Response("", { status: 400 });
  }
  if (data.object !== "instagram") return new Response("Ignored");
  for (const entry of data.entry || []) {
    if (String(entry.id) !== env.INSTAGRAM_ACCOUNT_ID) continue;
    for (const event of entry.messaging || []) {
      await collectInstagramDM(event,env,q);
      const match = String(event.message?.text || "")
          .trim()
          .match(/^FINFOLK ([a-f0-9]{24})$/i),
        senderId = String(event.sender?.id || ""),
        mid = String(event.message?.mid || "");
      if (
        match &&
        /^\d{1,40}$/.test(senderId) &&
        mid.length > 0 &&
        mid.length < 500 &&
        !event.message?.is_echo
      ) {
        const payload = {
          senderId,
          challengeHash: createHash("sha256")
            .update(match[1].toLowerCase())
            .digest("hex"),
        };
        await q(
          "INSERT INTO finfolk.instagram_events(id,payload,status) VALUES($1,$2::jsonb,'done') ON CONFLICT DO NOTHING",
          ["dm:" + mid, JSON.stringify(payload)],
        );
      }
    }
    for (const change of entry.changes || []) {
      if (
        change.field === "mentions" &&
        !change.value?.comment_id &&
        /^\d{1,40}$/.test(String(change.value?.media_id || ""))
      ) {
        const mediaId = String(change.value.media_id),
          id = "media:" + mediaId;
        await q(
          "INSERT INTO finfolk.instagram_events(id,payload) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING",
          [id, JSON.stringify({ mediaId })],
        );
        await env.INSTAGRAM_QUEUE.send({ id });
      }
    }
    for (const change of entry.changes || [])
      if (
        ["mentions","comments"].includes(change.field) &&
        /^\d{1,40}$/.test(String(change.value?.comment_id || change.value?.id || ""))
      ) {
        const id = String(change.value.comment_id || change.value.id),
          payload = {
            commentId: id,
            context: change.field === "comments" ? "owned" : "mention",
            mediaId: String(change.value.media_id || change.value.media?.id || ""),
          };
        // Persist before enqueue; reconciliation re-enqueues stranded rows.
        await q(
          "INSERT INTO finfolk.instagram_events(id,payload) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING",
          [id, JSON.stringify(payload)],
        );
        await env.INSTAGRAM_QUEUE.send({ id });
      }
  }
  return new Response("Accepted");
}
export async function processInstagramEvent(id, env, q, db) {
  if (
    env.INSTAGRAM_DISCOVERY_ENABLED === "true" &&
    /^media:\d{1,40}$/.test(id)
  ) {
    const event = (
      await q(
        "SELECT status,attempts FROM finfolk.instagram_events WHERE id=$1",
        [id],
      )
    )[0];
    if (!event || event.status === "done" || event.attempts >= 5) return;
    try {
      await collectMention(id.slice(6), null, env, q);
      await q(
        "UPDATE finfolk.instagram_events SET status='done',updated_at=now() WHERE id=$1",
        [id],
      );
    } catch {
      await q(
        "UPDATE finfolk.instagram_events SET status='error',attempts=attempts+1,updated_at=now(),error='Caption retrieval failed' WHERE id=$1",
        [id],
      );
      throw Error("Caption retrieval failed");
    }
    return;
  }
  if (
    env.INSTAGRAM_ENABLED !== "true" &&
    env.INSTAGRAM_DISCOVERY_ENABLED !== "true" &&
    env.INSTAGRAM_COMMAND_REPLIES_ENABLED !== "true"
  )
    return; // Keep pending until pilot activation.
  if (
    !/^\d{1,40}$/.test(id) ||
    !env.INSTAGRAM_ACCESS_TOKEN ||
    !/^v\d+\.0$/.test(env.INSTAGRAM_GRAPH_VERSION || "")
  )
    throw Error("Provider configuration unavailable");
  const row = (
    await q(
      "UPDATE finfolk.instagram_events SET status='processing',attempts=attempts+1,updated_at=now() WHERE id=$1 AND status IN ('queued','error') AND attempts<5 RETURNING *",
      [id],
    )
  )[0];
  if (!row) return;
  try {
    const context = row.payload?.context === 'owned' ? 'owned' : 'mention';
    const fields = 'id,text,from{id,username},timestamp,media{id,permalink,caption,username,timestamp,owner}';
    const output = await instagramGraph(context === 'owned' ? id : env.INSTAGRAM_ACCOUNT_ID, env,
      {fields: context === 'owned' ? fields : `mentioned_comment.comment_id(${id}){${fields}}`});
    const comment = context === 'owned' ? output : output.mentioned_comment;
    if (!comment || String(comment.id) !== id) throw Error('Comment unavailable');
    if (context === 'owned' && String(comment.media?.owner?.id) !== env.INSTAGRAM_ACCOUNT_ID)
      throw Error('Comment media is not owned by FinFolk');
    if (await processCommentCommand(comment, context, env, db)) {
      await q("UPDATE finfolk.instagram_events SET status='done',error=null,updated_at=now() WHERE id=$1",[id]);
      return;
    }
    if (context === 'owned') {
      await q("UPDATE finfolk.instagram_events SET status='done',error=null,updated_at=now() WHERE id=$1",[id]);
      return;
    }
    if (env.INSTAGRAM_DISCOVERY_ENABLED === 'true') await collectMention(null,id,env,q);
    const sender = String(comment.from?.id || ""),
      text = String(comment.text || "").slice(0, 5000),
      parsed = parseActionRequest(text);
    const owner = /^\d{1,40}$/.test(sender)
      ? (
          await q(
            "SELECT user_id FROM finfolk.instagram_connections WHERE sender_id=$1 AND status='connected'",
            [sender],
          )
        )[0]?.user_id
      : null;
    const candidates = await q(
      "SELECT id,name FROM finfolk.beaches WHERE length(name)>3 AND position(lower(name) in lower($1))>0 LIMIT 5",
      [text],
    );
    let sourceUrl = null;
    try {
      const u = new URL(comment.media?.permalink);
      if (
        u.protocol === "https:" &&
        ["www.instagram.com", "instagram.com"].includes(u.hostname)
      )
        sourceUrl = u.href;
    } catch {}
    const data = {
      text,
      sourceUrl,
      beaches: candidates,
      depth: parsed.depth,
      duration: parsed.duration,
      reply: "",
      thirdParty: true,
    };
    if (owner && parsed.kinds.includes("stats") && candidates.length === 1) {
      const profile = (
        await q("SELECT profile FROM finfolk.members WHERE user_id=$1", [owner])
      )[0]?.profile;
      if (profile?.open) {
        const counts = (
          await q(
            "SELECT (SELECT count(*) FROM finfolk.checkins WHERE user_id=$1 AND beach_id=$2 AND visit_day>=((now() AT TIME ZONE 'Australia/Melbourne')::date-29))::integer AS visits,count(*)::integer AS dives,coalesce(sum((data->>'durationMinutes')::numeric),0) AS minutes,round(avg((data->>'maxDepthMetres')::numeric),1) AS depth FROM finfolk.sessions WHERE owner_id=$1 AND beach_id=$2",
            [owner, candidates[0].id],
          )
        )[0];
        const parts = [];
        if (profile.sharing?.visits)
          parts.push(`${counts.visits} recent visit days`);
        if (profile.sharing?.dives)
          parts.push(`${counts.dives} logged sessions`);
        if (profile.sharing?.time)
          parts.push(`${counts.minutes} logged minutes`);
        if (profile.sharing?.depth && counts.depth !== null)
          parts.push(`${counts.depth}m typical logged maximum depth`);
        if (parts.length)
          data.reply = `FinFolk at ${candidates[0].name}: ${parts.join(" · ")}. Self-reported records.`;
      }
    }
    for (const kind of owner ? parsed.kinds : ["reply"])
      await q(
        "INSERT INTO finfolk.instagram_actions(source_id,owner_id,sender_id,kind,data) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(source_id,kind) DO NOTHING",
        [
          id,
          owner || null,
          sender || null,
          kind,
          JSON.stringify({
            ...data,
            reply: kind === "stats" ? data.reply : "",
          }),
        ],
      );
    await q(
      "UPDATE finfolk.instagram_events SET status='done',error=null,updated_at=now() WHERE id=$1",
      [id],
    );
  } catch {
    await q(
      "UPDATE finfolk.instagram_events SET status='error',updated_at=now(),error='Mention retrieval failed; source may be private, deleted or inaccessible.' WHERE id=$1",
      [id],
    );
    throw Error("Mention processing failed");
  }
}
export async function reconcileInstagram(env, q) {
  await reconcileCommentCommands(env,q);
  await q(
    "UPDATE finfolk.instagram_actions SET state='uncertain',updated_at=now() WHERE state='sending' AND updated_at<now()-interval '20 minutes'",
  );
  await q(
    "UPDATE finfolk.instagram_actions SET data=data-'text' WHERE created_at<now()-interval '30 days' AND data ? 'text'",
  );
  await q(
    "UPDATE finfolk.instagram_events SET status='error',error='Processing interrupted' WHERE status='processing' AND updated_at<now()-interval '20 minutes'",
  );
  if (
    env.INSTAGRAM_ENABLED === "true" ||
    env.INSTAGRAM_DISCOVERY_ENABLED === "true" ||
    env.INSTAGRAM_COMMAND_REPLIES_ENABLED === "true"
  )
    for (const row of await q(
      "SELECT id FROM finfolk.instagram_events WHERE status IN ('queued','error') AND attempts<5 ORDER BY created_at LIMIT 50",
    ))
      await env.INSTAGRAM_QUEUE.send({ id: row.id });
  await q(
    "UPDATE finfolk.instagram_connections SET challenge_hash=null WHERE expires_at<now() AND challenge_hash IS NOT NULL",
  );
  await q(
    "DELETE FROM finfolk.instagram_events WHERE created_at<now()-interval '30 days'",
  );
}
