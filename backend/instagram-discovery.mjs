import places from "./instagram-places.json" with { type: "json" };
import { isInstagramAdmin } from "./instagram-actions.mjs";
import { socialPostURL } from "../web/media.js";
const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const numeric = (v) => /^\d{1,40}$/.test(String(v || ""));
const key = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const normal = (s) =>
  String(s || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const exactTags = {
  bondibeach: "bondi",
  maroubrabeach: "maroubra",
  gordonsbay: "gordons-bay",
  clovellybeach: "clovelly",
  portseabeach: "portsea",
  hyamsbeach: "hyams-beach",
};
export function matchInstagramBeach(text = "") {
  const normalized = " " + normal(text) + " ",
    matches = new Set();
  for (const p of places) {
    const terms = [p.name, ...p.aliases]
      .map(normal)
      .filter((t) => t.length > 4);
    if (terms.some((t) => normalized.includes(" " + t + " ")))
      matches.add(p.id);
  }
  for (const [, tag] of text.matchAll(/#([a-z0-9_]+)/gi))
    if (exactTags[tag.toLowerCase()]) matches.add(exactTags[tag.toLowerCase()]);
  // Do not treat a short name inside a more specific name as a second beach.
  const states = [
    ["VIC", "victoria"],
    ["NSW", "new south wales"],
  ]
    .filter(
      ([code, name]) =>
        normalized.includes(" " + name + " ") ||
        normalized.includes(" " + code.toLowerCase() + " "),
    )
    .map(([code]) => code);
  const found = places.filter(
    (p) =>
      matches.has(p.id) &&
      (states.length !== 1 ||
        (p.state === "Victoria" || p.state === "VIC" ? "VIC" : "NSW") ===
          states[0]),
  );
  return found
    .filter(
      (p) =>
        !found.some(
          (other) =>
            other.id !== p.id &&
            normal(other.name).endsWith(" " + normal(p.name)),
        ),
    )
    .map((p) => ({ id: p.id, name: p.name }));
}
export function normalizeInstagramMedia(media, source) {
  const parsed = socialPostURL(media?.permalink);
  if (parsed?.platform !== "instagram" || !numeric(media?.id)) return null;
  const timestamp = Date.parse(media.timestamp);
  return {
    mediaId: String(media.id),
    url: parsed.url,
    authorId: numeric(media.owner?.id) ? String(media.owner.id) : null,
    author:
      typeof media.username === "string" ? media.username.slice(0, 100) : null,
    caption: String(media.caption || "").slice(0, 5000),
    postedAt: Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : null,
    source: String(source).slice(0, 120),
  };
}
export async function ingestInstagramMedia(media, source, env, q, options = {}) {
  const item = normalizeInstagramMedia(media, source);
  if (!item) return null;
  const suppressed = item.authorId
    ? (
        await q(
          "SELECT author_id FROM finfolk.instagram_suppressed_sources WHERE author_id=$1",
          [item.authorId],
        )
      ).length
    : false;
  if (suppressed) return null;
  const requested = options.beachId && places.find(p => p.id === options.beachId);
  const candidates = requested ? [{id:requested.id,name:requested.name}] : matchInstagramBeach(item.caption);
  const member = item.authorId
    ? (
        await q(
          "SELECT c.user_id,c.share_posts FROM finfolk.instagram_connections c JOIN finfolk.members m ON m.user_id=c.user_id WHERE c.media_owner_id=$1 AND c.status='connected' AND m.deleted=false",
          [item.authorId],
        )
      )[0]
    : null;
  const auto =
    !options.forceReview &&
    env.INSTAGRAM_PUBLICATION_ENABLED === "true" &&
    member?.share_posts &&
    candidates.length === 1;
  const rows = await q(
    `INSERT INTO finfolk.instagram_discoveries(media_id,url,author_id,author,owner_id,caption,posted_at,candidates,beach_id,state,automatic,sources,checked_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb,now())
 ON CONFLICT DO NOTHING RETURNING id,state`,
    [
      item.mediaId,
      item.url,
      item.authorId,
      item.author,
      member?.user_id || null,
      item.caption,
      item.postedAt,
      JSON.stringify(candidates),
      candidates.length === 1 ? candidates[0].id : null,
      auto ? "published" : "pending",
      !!auto,
      JSON.stringify([item.source]),
    ],
  );
  if (rows[0]) return rows[0];
  const existing = await q(
    "UPDATE finfolk.instagram_discoveries SET sources=(SELECT jsonb_agg(DISTINCT value) FROM jsonb_array_elements(sources || $3::jsonb)),checked_at=now(),updated_at=now() WHERE media_id=$1 OR url=$2 RETURNING id,state",
    [item.mediaId, item.url, JSON.stringify([item.source])],
  );
  return existing[0];
}
export async function instagramGraph(path, env, params = {}, fetcher = fetch) {
  if (
    !env.INSTAGRAM_ACCESS_TOKEN ||
    !/^v\d+\.0$/.test(env.INSTAGRAM_GRAPH_VERSION || "")
  )
    fail("Instagram connection is not configured.", 503);
  if (!/^[A-Za-z0-9_/-]+$/.test(path)) fail("Invalid provider path.");
  const u = new URL(
    `https://graph.facebook.com/${env.INSTAGRAM_GRAPH_VERSION}/${path}`,
  );
  for (const [k, v] of Object.entries(params))
    if (v !== null && v !== undefined) u.searchParams.set(k, String(v));
  const response = await fetcher(u, {
    headers: { Authorization: `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    fail("Instagram returned an invalid response.", 503);
  }
  if (!response.ok || body.error) {
    const error = Object.assign(Error("Instagram source could not be read."), {
      status: 503,
      providerCode: Number(body.error?.code) || 0,
      providerSubcode: Number(body.error?.error_subcode) || 0,
      transient: body.error?.is_transient === true,
      retryAfter: Number(response.headers.get("retry-after")) || 0,
    });
    throw error;
  }
  return body;
}
export async function publicInstagramFeed(q, beachId, cursor) {
  if (!key(beachId)) fail("Choose a valid beach.");
  let after = "9999-01-01T00:00:00.000Z",
    afterId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  if (cursor && cursor.length > 500) fail("Invalid page cursor.");
  if (cursor) {
    try {
      const parts = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (
        !Array.isArray(parts) ||
        parts.length !== 2 ||
        !Number.isFinite(Date.parse(parts[0])) ||
        !/^[a-f0-9-]{36}$/.test(parts[1])
      )
        throw Error();
      [after, afterId] = parts;
    } catch {
      fail("Invalid page cursor.");
    }
  }
  const rows = await q(
    `SELECT d.id,d.url,d.author,d.posted_at,d.created_at,d.created_at::text AS cursor_time,b.name AS beach_name FROM finfolk.instagram_discoveries d JOIN finfolk.beaches b ON b.id=d.beach_id
 WHERE d.beach_id=$1 AND d.state='published' AND (d.created_at,d.id)<($2::timestamptz,$3::uuid)
 AND NOT EXISTS(SELECT 1 FROM finfolk.instagram_suppressed_sources s WHERE s.author_id=d.author_id)
 AND (d.owner_id IS NULL OR EXISTS(SELECT 1 FROM finfolk.members m WHERE m.user_id=d.owner_id AND m.deleted=false))
 AND (NOT d.automatic OR EXISTS(SELECT 1 FROM finfolk.instagram_connections c WHERE c.user_id=d.owner_id AND c.status='connected' AND c.media_owner_id=d.author_id))
 ORDER BY d.created_at DESC,d.id DESC LIMIT 21`,
    [beachId, after, afterId],
  );
  const page = rows.slice(0, 20),
    last = page.at(-1);
  return {
    posts: page.map((r) => ({
      id: r.id,
      url: r.url,
      author: r.author,
      title: r.beach_name,
      posted_at: r.posted_at,
      location_context: "Shared around " + r.beach_name,
      discovered: true,
    })),
    cursor:
      rows.length > 20
        ? Buffer.from(JSON.stringify([last.cursor_time, last.id])).toString(
            "base64url",
          )
        : null,
  };
}
const audit = (q, id, uid, event) =>
  q(
    "INSERT INTO finfolk.instagram_discovery_audit(discovery_id,actor,event) VALUES($1,$2,$3)",
    [id, uid, event],
  );
export async function discoveryAction({ action, v, uid, env, q }) {
  const admin = isInstagramAdmin(uid, env);
  if (action === "instagramDiscoveryStatus")
    return {
      collection: env.INSTAGRAM_DISCOVERY_ENABLED === "true",
      publication: env.INSTAGRAM_PUBLICATION_ENABLED === "true",
      hashtags: env.INSTAGRAM_HASHTAGS_ENABLED === "true",
      sources: admin
        ? await q(
            "SELECT key,kind,last_success,next_at,status FROM finfolk.instagram_sources ORDER BY key",
          )
        : [],
      pending: Number(
        (
          await q(
            "SELECT count(*) AS count FROM finfolk.instagram_discoveries WHERE state='pending'",
          )
        )[0].count,
      ),
    };
  if (action === "instagramSharing") {
    if (typeof v.enabled !== "boolean") fail("Choose a sharing preference.");
    const rows = await q(
      "UPDATE finfolk.instagram_connections SET share_posts=$2,updated_at=now() WHERE user_id=$1 AND status='connected' RETURNING share_posts,media_owner_id",
      [uid, v.enabled],
    );
    if (!rows.length) fail("Verify your Instagram account first.");
    return rows[0];
  }
  if (action === "instagramMyPosts")
    return {
      connection:
        (
          await q(
            "SELECT share_posts,media_owner_id FROM finfolk.instagram_connections WHERE user_id=$1",
            [uid],
          )
        )[0] || null,
      posts: await q(
        "SELECT id,url,author,beach_id,candidates,state,posted_at,created_at FROM finfolk.instagram_discoveries WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
        [uid],
      ),
    };
  if (action === "instagramDiscoveryInbox") {
    if (!admin) fail("Administrator access required.", 403);
    return {
      posts: await q(
        "SELECT id,url,author,author_id,owner_id,caption,candidates,beach_id,state,posted_at,sources FROM finfolk.instagram_discoveries WHERE state='pending' ORDER BY created_at LIMIT 100",
      ),
      reports: await q(
        "SELECT r.discovery_id,r.reason,r.created_at,d.url FROM finfolk.instagram_post_reports r JOIN finfolk.instagram_discoveries d ON d.id=r.discovery_id ORDER BY r.created_at DESC LIMIT 100",
      ),
      connections: await q(
        "SELECT user_id,handle,media_owner_id FROM finfolk.instagram_connections WHERE status='connected' ORDER BY handle LIMIT 100",
      ),
    };
  }
  if (action === "instagramBindMediaOwner") {
    if (!admin) fail("Administrator access required.", 403);
    if (v.confirmed !== true || !numeric(v.mediaId))
      fail("Check the verified member and actual Instagram post first.");
    const c = (
      await q(
        "SELECT handle FROM finfolk.instagram_connections WHERE user_id=$1 AND status='connected'",
        [v.userId],
      )
    )[0];
    if (!c) fail("Verified connection not found.");
    const media = await instagramGraph(String(v.mediaId), env, {
      fields: "id,owner,username,permalink",
    });
    if (
      !numeric(media.owner?.id) ||
      String(media.username || "").toLowerCase() !== c.handle.toLowerCase()
    )
      fail(
        "Meta did not provide matching media-owner evidence. Posts will remain reviewed.",
      );
    await q(
      "UPDATE finfolk.instagram_connections SET media_owner_id=$2 WHERE user_id=$1 AND status='connected'",
      [v.userId, String(media.owner.id)],
    );
    await q(
      "UPDATE finfolk.instagram_discoveries SET owner_id=$1 WHERE author_id=$2 AND owner_id IS NULL AND state='pending'",
      [v.userId, String(media.owner.id)],
    );
    await audit(q, null, uid, "bind_media_owner");
    return { ok: true };
  }
  if (action === "instagramRemoveAllPosts") {
    await q(
      "UPDATE finfolk.instagram_discoveries SET state='hidden',updated_at=now() WHERE owner_id=$1 AND state NOT IN ('hidden','rejected')",
      [uid],
    );
    await audit(q, null, uid, "hide_all");
    return { ok: true };
  }
  if (action === "instagramDiscoveryRetry") {
    if (!admin) fail("Administrator access required.", 403);
    await q(
      "UPDATE finfolk.instagram_sources SET next_at=now(),status='ready' WHERE key=$1 AND (lease_until IS NULL OR lease_until<now())",
      [v.key],
    );
    return { ok: true };
  }
  if (
    action === "instagramReviewPost" ||
    action === "instagramChoosePostBeach" ||
    action === "instagramHidePost" ||
    action === "instagramSuppressSource"
  ) {
    if (!key(v.id)) fail("Invalid post.");
    const row = (
      await q("SELECT * FROM finfolk.instagram_discoveries WHERE id::text=$1", [
        v.id,
      ])
    )[0];
    if (!row) fail("Post unavailable.", 404);
    if (!admin && row.owner_id !== uid) fail("Post unavailable.", 404);
    if (action === "instagramHidePost")
      await q(
        "UPDATE finfolk.instagram_discoveries SET state='hidden',updated_at=now() WHERE id=$1",
        [row.id],
      );
    else if (action === "instagramSuppressSource") {
      if (!admin) fail("Administrator access required.", 403);
      if (!row.author_id)
        fail(
          "This source has no provider author ID. Reject the individual post.",
        );
      await q(
        "INSERT INTO finfolk.instagram_suppressed_sources(author_id) VALUES($1) ON CONFLICT DO NOTHING",
        [row.author_id],
      );
      await q(
        "UPDATE finfolk.instagram_discoveries SET state='hidden',updated_at=now() WHERE author_id=$1",
        [row.author_id],
      );
    } else {
      if (action === "instagramReviewPost" && !admin)
        fail("Administrator access required.", 403);
      if (action === "instagramReviewPost" && v.mode === "reject")
        await q(
          "UPDATE finfolk.instagram_discoveries SET state='rejected',updated_at=now() WHERE id=$1",
          [row.id],
        );
      else {
        if (
          !key(v.beachId) ||
          (await q("SELECT id FROM finfolk.beaches WHERE id=$1", [v.beachId]))
            .length !== 1
        )
          fail("Choose a beach from the directory.");
        if (!admin && !["pending", "published"].includes(row.state))
          fail("Only pending or published posts can be placed.");
        if (!admin) {
          const c = (
            await q(
              "SELECT share_posts FROM finfolk.instagram_connections WHERE user_id=$1 AND status='connected'",
              [uid],
            )
          )[0];
          if (!c?.share_posts) fail("Enable public sharing first.");
          if (env.INSTAGRAM_PUBLICATION_ENABLED !== "true")
            fail("Publication is paused.", 503);
        }
        if (env.INSTAGRAM_PUBLICATION_ENABLED !== "true")
          fail("Publication is paused.", 503);
        await q(
          "UPDATE finfolk.instagram_discoveries SET beach_id=$2,state='published',automatic=$3,updated_at=now() WHERE id=$1",
          [row.id, v.beachId, !admin],
        );
      }
    }
    await audit(q, row.id, uid, action);
    return { ok: true };
  }
  fail("Unknown discovery action.");
}
export const discoveryActions = new Set([
  "instagramDiscoveryStatus",
  "instagramSharing",
  "instagramMyPosts",
  "instagramDiscoveryInbox",
  "instagramBindMediaOwner",
  "instagramRemoveAllPosts",
  "instagramDiscoveryRetry",
  "instagramReviewPost",
  "instagramChoosePostBeach",
  "instagramHidePost",
  "instagramSuppressSource",
]);
