import { parseActionRequest } from "./instagram-actions.mjs";
import {
  instagramGraph,
  ingestInstagramMedia,
} from "./instagram-discovery.mjs";
export async function collectMention(mediaId, commentId, env, q) {
  if (env.INSTAGRAM_DISCOVERY_ENABLED !== "true") return;
  const fields = commentId
    ? `mentioned_comment.comment_id(${commentId}){id,text,media{id,permalink,caption,username,timestamp,owner}}`
    : `mentioned_media.media_id(${mediaId}){id,permalink,caption,username,timestamp,owner}`;
  const result = await instagramGraph(env.INSTAGRAM_ACCOUNT_ID, env, {
    fields,
  });
  const media = commentId
    ? result.mentioned_comment?.media
    : result.mentioned_media;
  if (media) {
    const discovered = await ingestInstagramMedia(
      media,
      commentId ? "comment:" + commentId : "caption:" + mediaId,
      env,
      q,
    );
    // Caption requests are authored by the media owner; comment requests continue through the existing Actions pipeline.
    if (!commentId && discovered) {
      const row = (
          await q(
            "SELECT owner_id,candidates FROM finfolk.instagram_discoveries WHERE id=$1",
            [discovered.id],
          )
        )[0],
        parsed = parseActionRequest(media.caption);
      if (row?.owner_id && parsed.kinds.includes("dive"))
        await q(
          "INSERT INTO finfolk.instagram_actions(source_id,owner_id,kind,data) VALUES($1,$2,'dive',$3::jsonb) ON CONFLICT(source_id,kind) DO NOTHING",
          [
            "media:" + mediaId,
            row.owner_id,
            JSON.stringify({
              text: String(media.caption || "").slice(0, 5000),
              sourceUrl: media.permalink,
              beaches: row.candidates,
              depth: parsed.depth,
              duration: parsed.duration,
              reply: "",
              thirdParty: false,
            }),
          ],
        );
    }
  }
}
export async function scheduleInstagramDiscovery(env, q) {
  // Disconnects take effect even when collection is paused.
  await q(
    "UPDATE finfolk.instagram_discoveries d SET state='hidden',updated_at=now() WHERE d.automatic AND d.state='published' AND NOT EXISTS(SELECT 1 FROM finfolk.instagram_connections c JOIN finfolk.members m ON m.user_id=c.user_id WHERE c.user_id=d.owner_id AND c.status='connected' AND m.deleted=false)",
  );
  await q(
    "UPDATE finfolk.instagram_discoveries SET caption='' WHERE created_at<now()-interval '30 days' AND caption<>''",
  );
  if (env.INSTAGRAM_DISCOVERY_ENABLED !== "true" || !env.INSTAGRAM_QUEUE)
    return;
  const sources = await q(
    `UPDATE finfolk.instagram_sources SET lease_until=now()+interval '15 minutes',status='queued'
 WHERE key IN(SELECT key FROM finfolk.instagram_sources WHERE next_at<=now() AND (lease_until IS NULL OR lease_until<now()) AND (kind<>'hashtag' OR $1::boolean) ORDER BY next_at,key LIMIT 4 FOR UPDATE SKIP LOCKED) RETURNING key`,
    [env.INSTAGRAM_HASHTAGS_ENABLED === "true"],
  );
  for (const s of sources)
    try {
      await env.INSTAGRAM_QUEUE.send({ kind: "discovery-source", key: s.key });
    } catch {
      await q(
        "UPDATE finfolk.instagram_sources SET lease_until=NULL,status='retry',next_at=now()+interval '5 minutes' WHERE key=$1",
        [s.key],
      );
    }
}
export async function collectInstagramSource(sourceKey, env, q) {
  if (env.INSTAGRAM_DISCOVERY_ENABLED !== "true") return;
  const s = (
    await q(
      "UPDATE finfolk.instagram_sources SET status='running',lease_until=now()+interval '15 minutes' WHERE key=$1 AND status='queued' AND lease_until>now() RETURNING *",
      [sourceKey],
    )
  )[0];
  if (!s) return;
  const finish = async (checkpoint = null, hours = 1) =>
    q(
      "UPDATE finfolk.instagram_sources SET checkpoint=$2,status='ready',failures=0,last_success=now(),lease_until=NULL,next_at=now()+($3::integer*interval '1 hour') WHERE key=$1",
      [s.key, checkpoint, hours],
    );
  try {
    if (s.kind === "recheck") {
      const rows = await q(
        "SELECT id,media_id FROM finfolk.instagram_discoveries WHERE state='published' AND media_id IS NOT NULL AND (checked_at IS NULL OR checked_at<now()-interval '1 day') ORDER BY checked_at NULLS FIRST LIMIT 20",
      );
      for (const row of rows) {
        try {
          await instagramGraph(row.media_id, env, { fields: "id,permalink" });
          await q(
            "UPDATE finfolk.instagram_discoveries SET checked_at=now() WHERE id=$1",
            [row.id],
          );
        } catch (e) {
          if (e.providerCode === 100 && e.providerSubcode === 33)
            await q(
              "UPDATE finfolk.instagram_discoveries SET state='unavailable',checked_at=now() WHERE id=$1",
              [row.id],
            );
          else throw e;
        }
      }
      await finish(null, rows.length === 20 ? 1 : 24);
      return;
    }
    let path = env.INSTAGRAM_ACCOUNT_ID + "/tags";
    if (s.kind === "hashtag") {
      if (env.INSTAGRAM_HASHTAGS_ENABLED !== "true") {
        await finish(null, 2);
        return;
      }
      let hashtagId = s.data.hashtagId;
      // Keep a conservative 20-tag budget, including tags queried outside this app.
      const used = await instagramGraph(
        env.INSTAGRAM_ACCOUNT_ID + "/recently_searched_hashtags",
        env,
        { fields: "id", limit: 100 },
      );
      if (
        (used.data || []).length >= 20 &&
        !(used.data || []).some((t) => String(t.id) === String(hashtagId))
      ) {
        await q(
          "UPDATE finfolk.instagram_sources SET status='quota_paused',lease_until=NULL,next_at=now()+interval '1 day' WHERE key=$1",
          [s.key],
        );
        return;
      }
      if (!hashtagId) {
        const found = await instagramGraph("ig_hashtag_search", env, {
          user_id: env.INSTAGRAM_ACCOUNT_ID,
          q: s.data.tag,
        });
        hashtagId = found.data?.[0]?.id;
        if (!/^\d+$/.test(String(hashtagId || "")))
          throw Error("Hashtag unavailable");
        await q(
          "UPDATE finfolk.instagram_sources SET data=jsonb_set(data,'{hashtagId}',$2::jsonb) WHERE key=$1",
          [s.key, JSON.stringify(String(hashtagId))],
        );
      }
      path = hashtagId + "/recent_media";
    }
    let cursor = s.checkpoint;
    for (let page = 0; page < 2; page++) {
      const params = {
        fields:
          s.kind === "hashtag"
            ? "id,caption,permalink,timestamp"
            : "id,caption,permalink,timestamp,username,owner",
        limit: 25,
        after: cursor,
      };
      if (s.kind === "hashtag") params.user_id = env.INSTAGRAM_ACCOUNT_ID;
      const result = await instagramGraph(path, env, params);
      for (const item of result.data || [])
        await ingestInstagramMedia(item, s.key, env, q);
      const next = result.paging?.next && result.paging?.cursors?.after;
      cursor = typeof next === "string" && next.length < 2048 ? next : null;
      // Persist between pages so interrupted batches resume without losing discoveries.
      await q(
        "UPDATE finfolk.instagram_sources SET checkpoint=$2 WHERE key=$1",
        [s.key, cursor],
      );
      if (!cursor) break;
    }
    await finish(cursor, s.kind === "hashtag" ? 2 : 1);
  } catch (e) {
    const denied = [10, 190, 200].includes(e.providerCode),
      rate = [4, 17, 32, 613].includes(e.providerCode);
    const delay = denied
      ? 86400
      : Math.max(
          e.retryAfter || 0,
          rate ? 3600 : Math.min(86400, 300 * 2 ** Math.min(s.failures, 8)),
        );
    await q(
      "UPDATE finfolk.instagram_sources SET status=$2,failures=failures+1,lease_until=NULL,next_at=now()+($3::integer*interval '1 second') WHERE key=$1",
      [
        s.key,
        denied ? "access_required" : rate ? "rate_limited" : "retry",
        delay,
      ],
    );
    // Source-level retry state is durable. Do not hot-loop the queue on provider errors.
  }
}
