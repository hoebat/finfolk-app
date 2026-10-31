import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database } from "../backend/db.mjs";
import {
  ingestInstagramMedia,
  discoveryAction,
  publicInstagramFeed,
} from "../backend/instagram-discovery.mjs";
import { instagramAction } from "../backend/instagram-actions.mjs";
import { createAPI } from "../backend/api.mjs";
import {
  collectMention,
  collectInstagramSource,
} from "../backend/instagram-collector.mjs";
if (process.env.NEON_BRANCH !== "finfolk-regulars-dev")
  throw Error("Isolated test branch required.");
const db = database(process.env.DATABASE_URL),
  q = db.query,
  tag = randomBytes(5).toString("hex"),
  uid = "discovery_" + tag,
  other = "discovery_other_" + tag,
  admin = "discovery_admin_" + tag,
  author = String(Date.now()),
  ids = [];
const env = {
  INSTAGRAM_ADMIN_IDS: admin,
  INSTAGRAM_PUBLICATION_ENABLED: "true",
};
const act = (action, v = {}, user = uid) =>
  discoveryAction({ action, v, uid: user, env, q });
const media = (id, caption, extra = {}) => ({
  id,
  permalink: "https://www.instagram.com/p/TEST" + tag + id + "/",
  owner: { id: author },
  username: "test_" + tag,
  caption,
  timestamp: "2026-10-01T12:00:00Z",
  ...extra,
});
let serial = 0;
async function ingest(caption, extra = {}, source = "tags") {
  const id = author + String(++serial);
  ids.push(id);
  return ingestInstagramMedia(media(id, caption, extra), source, env, q);
}
try {
  for (const user of [uid, other, admin])
    await q(
      "INSERT INTO finfolk.members(user_id,profile) VALUES($1,$2::jsonb)",
      [user, JSON.stringify({ displayName: "Discovery test", open: false })],
    );
  await q(
    "INSERT INTO finfolk.instagram_connections(user_id,handle,sender_id,status,media_owner_id) VALUES($1,$2,$3,'connected',$4)",
    [uid, "test_" + tag, author + "9", author],
  );
  let row = await ingest("Bondi Beach");
  assert.equal(row.state, "pending");
  await act("instagramSharing", { enabled: true });
  row = await ingest("Bondi Beach");
  assert.equal(row.state, "published");
  const repeat = await ingestInstagramMedia(
    media(ids.at(-1), "Bondi Beach"),
    "hashtag:bondibeach",
    env,
    q,
  );
  assert.equal(repeat.id, row.id);
  assert.equal(
    (
      await q("SELECT sources FROM finfolk.instagram_discoveries WHERE id=$1", [
        row.id,
      ])
    )[0].sources.length,
    2,
  );
  await act("instagramHidePost", { id: row.id });
  assert.equal(
    (
      await ingestInstagramMedia(
        media(ids.at(-1), "Bondi Beach"),
        "tags",
        env,
        q,
      )
    ).state,
    "hidden",
  );
  row = await ingest("Bondi Beach and Clovelly Beach");
  assert.equal(row.state, "pending");
  await assert.rejects(
    act("instagramChoosePostBeach", { id: row.id, beachId: "bondi" }, other),
    /unavailable/,
  );
  await act("instagramChoosePostBeach", { id: row.id, beachId: "bondi" });
  assert.equal(
    (
      await q("SELECT state FROM finfolk.instagram_discoveries WHERE id=$1", [
        row.id,
      ])
    )[0].state,
    "published",
  );
  const noOwner = await ingest("Bondi Beach", { owner: undefined });
  assert.equal(noOwner.state, "pending");
  assert.equal(
    (
      await q(
        "SELECT owner_id FROM finfolk.instagram_discoveries WHERE id=$1",
        [noOwner.id],
      )
    )[0].owner_id,
    null,
  );
  await assert.rejects(
    act("instagramDiscoveryInbox", {}, other),
    /Administrator/,
  );
  await act(
    "instagramReviewPost",
    { id: noOwner.id, beachId: "bondi", mode: "approve" },
    admin,
  );
  const closedRow = await ingest("Bondi Beach");
  assert.equal(closedRow.state, "published"); // explicit post consent is independent of private logbook profile
  let feed = await publicInstagramFeed(q, "bondi");
  assert.ok(feed.posts.some((p) => p.id === row.id));
  assert.ok(feed.posts.some((p) => p.id === closedRow.id));
  assert.ok(!JSON.stringify(feed).includes("caption"));
  await act("instagramSharing", { enabled: false });
  assert.ok(
    (await publicInstagramFeed(q, "bondi")).posts.some((p) => p.id === row.id),
  );
  assert.equal((await ingest("Bondi Beach")).state, "pending");
  await assert.rejects(publicInstagramFeed(q, "bondi", "broken"), /cursor/);
  for (let i = 0; i < 22; i++) {
    const p = await ingest("Bondi Beach", { owner: undefined });
    await act(
      "instagramReviewPost",
      { id: p.id, beachId: "bondi", mode: "approve" },
      admin,
    );
  }
  feed = await publicInstagramFeed(q, "bondi");
  assert.equal(feed.posts.length, 20);
  assert.ok(feed.cursor);
  const next = await publicInstagramFeed(q, "bondi", feed.cursor);
  assert.ok(next.posts.length > 0);
  assert.equal(
    new Set([...feed.posts, ...next.posts].map((p) => p.id)).size,
    feed.posts.length + next.posts.length,
  );
  const app = createAPI({
    db,
    verify: async () => {
      throw Error("No auth");
    },
  });
  let response = await app.request("/instagram/posts?beachId=bondi", {}, env);
  assert.equal(response.status, 200);
  response = await app.request(
    "/api",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "instagramDiscoveryInbox" }),
    },
    env,
  );
  assert.equal(response.status, 401);
  response = await app.request(
    "/instagram/posts/" + row.id + "/report",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "wrong_location" }),
    },
    env,
  );
  assert.equal(response.status, 200);
  await act("instagramSuppressSource", { id: closedRow.id }, admin);
  assert.equal(await ingest("Bondi Beach"), null);
  assert.ok(
    !(await publicInstagramFeed(q, "bondi")).posts.some(
      (p) => p.id === closedRow.id,
    ),
  );
  await instagramAction({
    action: "instagramDisconnect",
    v: {},
    uid,
    env,
    q,
    verified: () => {},
  });
  assert.ok(
    !(await publicInstagramFeed(q, "bondi")).posts.some((p) => p.id === row.id),
  );
  // Provider failure preserves published content and durable backoff, without live provider calls.
  const sourceKey = "test:" + tag;
  await q(
    "INSERT INTO finfolk.instagram_sources(key,kind,status,lease_until) VALUES($1,'tags','queued',now()+interval '5 minutes')",
    [sourceKey],
  );
  await collectInstagramSource(
    sourceKey,
    { INSTAGRAM_DISCOVERY_ENABLED: "true" },
    q,
  );
  const source = (
    await q(
      "SELECT status,failures FROM finfolk.instagram_sources WHERE key=$1",
      [sourceKey],
    )
  )[0];
  assert.equal(source.status, "retry");
  assert.equal(source.failures, 1);
  await q("DELETE FROM finfolk.instagram_sources WHERE key=$1", [sourceKey]);
  // Real database + mocked Meta transport: pagination checkpoints, caption drafts, unavailable vs temporary failures.
  await q(
    "UPDATE finfolk.instagram_connections SET status='connected',media_owner_id=$2 WHERE user_id=$1",
    [uid, author],
  );
  await q(
    "DELETE FROM finfolk.instagram_suppressed_sources WHERE author_id=$1",
    [author],
  );
  const savedFetch = globalThis.fetch;
  let pages = 0;
  try {
    await q(
      "INSERT INTO finfolk.instagram_sources(key,kind,status,lease_until) VALUES($1,'tags','queued',now()+interval '5 minutes')",
      [sourceKey],
    );
    globalThis.fetch = async () => {
      pages++;
      const mediaId = author + String(++serial);
      ids.push(mediaId);
      return Response.json({
        data: [media(mediaId, "Bondi Beach")],
        paging: { next: "ignored", cursors: { after: "page" + pages } },
      });
    };
    await collectInstagramSource(
      sourceKey,
      {
        ...env,
        INSTAGRAM_DISCOVERY_ENABLED: "true",
        INSTAGRAM_ACCESS_TOKEN: "fixture",
        INSTAGRAM_GRAPH_VERSION: "v26.0",
        INSTAGRAM_ACCOUNT_ID: "123",
      },
      q,
    );
    const completed = (
      await q(
        "SELECT status,checkpoint FROM finfolk.instagram_sources WHERE key=$1",
        [sourceKey],
      )
    )[0];
    assert.equal(completed.status, "ready");
    assert.equal(completed.checkpoint, "page2");
    assert.equal(pages, 2);
    const captionId = author + String(++serial);
    ids.push(captionId);
    globalThis.fetch = async () =>
      Response.json({
        mentioned_media: media(
          captionId,
          "@finfolk.com.au log Bondi Beach depth 8 duration 30",
        ),
      });
    await collectMention(
      captionId,
      null,
      {
        ...env,
        INSTAGRAM_DISCOVERY_ENABLED: "true",
        INSTAGRAM_ACCESS_TOKEN: "fixture",
        INSTAGRAM_GRAPH_VERSION: "v26.0",
        INSTAGRAM_ACCOUNT_ID: "123",
      },
      q,
    );
    const drafts = await q(
      "SELECT id,data,state FROM finfolk.instagram_actions WHERE source_id=$1 AND kind='dive'",
      ["media:" + captionId],
    );
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].state, "review");
    assert.equal(drafts[0].data.depth, 8);
    await collectMention(
      captionId,
      null,
      {
        ...env,
        INSTAGRAM_DISCOVERY_ENABLED: "true",
        INSTAGRAM_ACCESS_TOKEN: "fixture",
        INSTAGRAM_GRAPH_VERSION: "v26.0",
        INSTAGRAM_ACCOUNT_ID: "123",
      },
      q,
    );
    assert.equal(
      (
        await q("SELECT id FROM finfolk.instagram_actions WHERE source_id=$1", [
          "media:" + captionId,
        ])
      ).length,
      1,
    );
    assert.equal(
      Number(
        (
          await q(
            "SELECT count(*) AS count FROM finfolk.sessions WHERE owner_id=$1",
            [uid],
          )
        )[0].count,
      ),
      0,
    );
  } finally {
    globalThis.fetch = savedFetch;
    await q("DELETE FROM finfolk.instagram_sources WHERE key=$1", [sourceKey]);
  }
  console.log(
    "INSTAGRAM_DISCOVERY_DB_PASS: consent, ownership, duplicates, suppression, ambiguous location, public pagination, admin denial, report endpoint, pause, disconnect and durable retry.",
  );
} finally {
  await q(
    "DELETE FROM finfolk.instagram_suppressed_sources WHERE author_id=$1",
    [author],
  );
  await q(
    "DELETE FROM finfolk.instagram_discoveries WHERE media_id IN(SELECT jsonb_array_elements_text($1::jsonb))",
    [JSON.stringify(ids)],
  );
  await q(
    "DELETE FROM finfolk.members WHERE user_id IN(SELECT jsonb_array_elements_text($1::jsonb))",
    [JSON.stringify([uid, other, admin])],
  );
  await db.pool.end();
}
