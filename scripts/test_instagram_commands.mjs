import { completeInstagramClaim } from "../backend/instagram-claims.mjs";
import { messagingFixture } from "./messaging_fixture.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { database } from "../backend/db.mjs";
import {
  processCommentCommand,
  commentCommandAction,
  sendCommandReply,
  reconcileCommentCommands,
} from "../backend/instagram-commands.mjs";
import { createHmac } from "node:crypto";
import {
  instagramWebhook,
  processInstagramEvent,
} from "../backend/instagram-webhook.mjs";
import { windowFor } from "../backend/community-core.mjs";
if (process.env.NEON_BRANCH !== "finfolk-regulars-dev")
  throw Error("Isolated test branch required.");
const db = database(process.env.DATABASE_URL),
  q = db.query,
  tag = randomBytes(5).toString("hex"),
  uid = randomUUID(),
  other = randomUUID();
const actor = String(Date.now()),
  sender = actor + "1",
  brand = "17841461601419539";
const env = {
  INSTAGRAM_APP_ID: "1667613151655339",
  INSTAGRAM_ACCOUNT_ID: brand,
  INSTAGRAM_GRAPH_VERSION: "v26.0",
  INSTAGRAM_ACCESS_TOKEN: "mock",
  INSTAGRAM_COMMAND_REPLIES_ENABLED: "true",
  INSTAGRAM_COMMAND_CHECKINS_ENABLED: "true",
};
let sequence = 0,
  posts = 0,
  failSend = false;
const ids = [];
const nativeFetch = globalThis.fetch;
const fixture = await messagingFixture(db, env, {
  senderId: sender,
  handle: "comment.diver",
});
globalThis.fetch = async (url, options) =>
  new URL(url).hostname === "graph.instagram.com"
    ? fixture.profileResponse(url)
    : nativeFetch(url, options);
const fetcher = async (url, options = {}) => {
  if (new URL(url).hostname === "graph.instagram.com")
    return fixture.profileResponse(url);
  assert.equal(options.method, "POST");
  posts++;
  if (failSend) throw Error("Ambiguous timeout");
  return { ok: true, json: async () => ({ id: "999" + sequence }) };
};
const act = (action, v = {}, user = uid, extra = {}) =>
  commentCommandAction({
    action,
    v,
    uid: user,
    env,
    q,
    db,
    verified: true,
    admin: false,
    ...extra,
  });
const make = (text, who = actor, extra = {}) => {
  const id = actor + "8" + ++sequence;
  ids.push(id);
  return {
    id,
    text,
    from: { id: who, username: "comment.diver" },
    timestamp: new Date().toISOString(),
    media: {
      id: actor + "7" + sequence,
      permalink: "https://www.instagram.com/p/CMD" + tag + sequence + "/",
      owner: { id: "111" },
      caption: "Bondi Beach",
    },
    ...extra,
  };
};
const run = async (text, who = actor, extra = {}) => {
  const c = make(text, who, extra);
  await processCommentCommand(c, "mention", env, db, { fetcher });
  return (
    await q("SELECT * FROM finfolk.instagram_commands WHERE id=$1", [c.id])
  )[0];
};
try {
  for (const id of [uid, other]) {
    await q(
      `INSERT INTO neon_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,'Comment test',$2,true,now(),now())`,
      [id, id + "@example.com"],
    );
    await q("INSERT INTO finfolk.members(user_id) VALUES($1)", [id]);
  }
  await q(
    "INSERT INTO finfolk.instagram_connections(user_id,handle,sender_id,status) VALUES($1,'comment.diver',$2,'connected')",
    [uid, sender],
  );
  await q(
    "UPDATE finfolk.instagram_connections SET provider_scope=$2 WHERE user_id=$1",
    [uid, fixture.scope],
  );
  // DM identifiers alone never authorise a public comment.
  const unknown = await run("/checkin Bondi Beach @finfolk.com.au", sender);
  assert.equal(unknown.owner_id, null);
  assert.equal(
    (await q("SELECT * FROM finfolk.checkins WHERE user_id=$1", [uid])).length,
    0,
  );
  const challenge = await act("instagramCommandVerify");
  const verified = await run(challenge.command);
  assert.equal(verified.owner_id, uid);
  assert.match(verified.reply, /private profile/);
  assert.ok(!verified.reply.includes(uid));
  assert.deepEqual(verified.args, {});
  // Default today, explicit rolling window, privacy, duplicate concurrent delivery.
  const c = make("/checkin Bondi Beach @finfolk.com.au");
  const before = posts;
  await Promise.all([
    processCommentCommand(c, "mention", env, db, { fetcher }),
    processCommentCommand(c, "mention", env, db, { fetcher }),
  ]);
  assert.equal(posts, before + 1);
  let visits = await q(
    "SELECT visit_day::text FROM finfolk.checkins WHERE user_id=$1",
    [uid],
  );
  assert.equal(visits.length, 1);
  assert.equal(
    visits[0].visit_day,
    windowFor(new Date(), "Australia/Sydney").today,
  );
  const saved = (
    await q("SELECT * FROM finfolk.instagram_commands WHERE id=$1", [c.id])
  )[0];
  assert.ok(!/Bondi|\d{4}-\d\d-\d\d/.test(saved.reply));
  const old = windowFor(new Date(), "Australia/Sydney").start;
  await run("/checkin " + old + " Bondi Beach @finfolk.com.au");
  visits = await q(
    "SELECT visit_day::text FROM finfolk.checkins WHERE user_id=$1",
    [uid],
  );
  assert.equal(visits.length, 2);
  const invalid = await run("/checkin 2000-01-01 Bondi Beach @finfolk.com.au");
  assert.match(invalid.reply, /last 30 days/);
  fixture.follows = false;
  await q(
    "UPDATE finfolk.instagram_commands SET received_at=now()-interval '2 hours',send_started_at=null WHERE actor_id=$1",
    [actor],
  );
  const blocked = await run("/checkin Bondi Beach @finfolk.com.au");
  assert.equal(blocked.state, "cancelled");
  assert.equal(blocked.send_state, "skipped");
  fixture.follows = true;
  // Reset synthetic sender limit so subsequent cases exercise execution.
  await q(
    "UPDATE finfolk.instagram_commands SET received_at=now()-interval '2 hours',send_started_at=CASE WHEN send_started_at IS NULL THEN NULL ELSE now()-interval '2 hours' END WHERE actor_id=$1 OR actor_id=$2",
    [actor, sender],
  );
  const pending = await run("/checkin @finfolk.com.au");
  assert.equal(pending.state, "confirmation");
  await assert.rejects(() =>
    act(
      "instagramCommandConfirm",
      { id: pending.id, beachId: "bondi", day: old },
      other,
    ),
  );
  await act("instagramCommandConfirm", {
    id: pending.id,
    beachId: "bondi",
    day: old,
  });
  assert.equal(
    (await q("SELECT * FROM finfolk.checkins WHERE user_id=$1", [uid])).length,
    2,
  );
  const delayed = await run("/checkin Bondi Beach @finfolk.com.au", actor, {
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  });
  assert.equal(delayed.state, "confirmation");
  failSend = true;
  const uncertain = await run("/help @finfolk.com.au");
  assert.equal(uncertain.send_state, "uncertain");
  const attempts = posts;
  await sendCommandReply(uncertain.id, env, db, fetcher);
  assert.equal(posts, attempts);
  failSend = false;
  await assert.rejects(
    () =>
      act("instagramCommandResolve", {
        id: uncertain.id,
        decision: "sent",
        replyId: "999",
      }),
    /Admin/,
  );
  await act(
    "instagramCommandResolve",
    { id: uncertain.id, decision: "sent", replyId: "999" },
    uid,
    { admin: true },
  );
  const ordinary = make("Beautiful Bondi @finfolk.com.au");
  assert.equal(
    await processCommentCommand(ordinary, "mention", env, db, { fetcher }),
    false,
  );
  const gated = make("/checkin Bondi Beach @finfolk.com.au");
  assert.equal(
    await processCommentCommand(
      gated,
      "mention",
      { ...env, INSTAGRAM_COMMAND_REPLIES_ENABLED: "false" },
      db,
      { fetcher },
    ),
    true,
  );
  assert.equal(
    (
      await q("SELECT * FROM finfolk.instagram_commands WHERE id=$1", [
        gated.id,
      ])
    ).length,
    0,
  );
  // Limits are persisted and enforced across consumers.
  await q(
    "UPDATE finfolk.instagram_commands SET received_at=now()-interval '2 hours',send_started_at=CASE WHEN send_started_at IS NULL THEN NULL ELSE now()-interval '2 hours' END WHERE actor_id=$1",
    [actor],
  );
  const batch = Array.from({ length: 7 }, () => make("/help @finfolk.com.au"));
  await Promise.all(
    batch.map((x) => processCommentCommand(x, "mention", env, db, { fetcher })),
  );
  const limited = await q(
    "SELECT state,count(*)::int AS n FROM finfolk.instagram_commands WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)) GROUP BY state",
    [JSON.stringify(batch.map((x) => x.id))],
  );
  assert.equal(limited.find((x) => x.state === "limited").n, 2);
  // Send-time limits also hold when a backlog from older hours is drained together.
  const limitIds = [];
  const reserve = async (count, mediaId) => {
    const rows = Array.from({ length: count }, (_, i) => ({
      id: actor + "99" + ++sequence,
      actor: actor + "55" + i,
    }));
    ids.push(...rows.map((x) => x.id));
    limitIds.push(...rows.map((x) => x.id));
    await q(
      `INSERT INTO finfolk.instagram_commands(id,context,actor_id,namespace,media_id,command,state,reply,send_state,received_at,send_started_at)
      SELECT id,'mention',actor,'synthetic-limits',$2,'help','done','help','sent',now()-interval '2 hours',now() FROM jsonb_to_recordset($1::jsonb) AS x(id text,actor text)`,
      [JSON.stringify(rows), mediaId],
    );
  };
  const crowded = make("/help @finfolk.com.au", actor + "61");
  await reserve(20, crowded.media.id);
  await processCommentCommand(crowded, "mention", env, db, { fetcher });
  assert.equal(
    (
      await q("SELECT send_state FROM finfolk.instagram_commands WHERE id=$1", [
        crowded.id,
      ])
    )[0].send_state,
    "pending",
  );
  await q(
    "DELETE FROM finfolk.instagram_commands WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))",
    [JSON.stringify(limitIds)],
  );
  limitIds.length = 0;
  await reserve(100, actor + "662");
  const backlog = make("/help @finfolk.com.au", actor + "62");
  const sentBefore = posts;
  await processCommentCommand(backlog, "mention", env, db, { fetcher });
  assert.equal(posts, sentBefore);
  assert.equal(
    (
      await q("SELECT send_state FROM finfolk.instagram_commands WHERE id=$1", [
        backlog.id,
      ])
    )[0].send_state,
    "pending",
  );
  await q(
    "DELETE FROM finfolk.instagram_commands WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))",
    [JSON.stringify(limitIds)],
  );
  // A real same-account re-claim rotates the connection proof and invalidates old cross-provider evidence.
  const beforeRelink = (
    await q(
      "SELECT identity_version FROM finfolk.instagram_connections WHERE user_id=$1",
      [uid],
    )
  )[0].identity_version;
  const claimHash = randomBytes(32).toString("hex");
  await q(
    "INSERT INTO finfolk.instagram_claims(user_id,code_hash,state,expires_at,provider_scope) VALUES($1,$2,'waiting',now()+interval '1 hour',$3)",
    [uid, claimHash, fixture.scope],
  );
  await q(
    "UPDATE finfolk.instagram_connections SET media_owner_id=$2,share_posts=true WHERE user_id=$1",
    [uid, actor + "444"],
  );
  await db.transaction((tq) =>
    completeInstagramClaim(tq, {
      uid,
      senderId: sender,
      handle: "comment.diver",
      actor: uid,
      codeHash: claimHash,
      scope: fixture.scope,
    }),
  );
  const relinked = (
    await q("SELECT * FROM finfolk.instagram_connections WHERE user_id=$1", [
      uid,
    ])
  )[0];
  assert.notEqual(relinked.identity_version, beforeRelink);
  assert.equal(relinked.media_owner_id, null);
  assert.equal(relinked.share_posts, false);
  await q(
    "UPDATE finfolk.instagram_commands SET received_at=now()-interval '2 hours',send_started_at=null WHERE actor_id=$1",
    [actor],
  );
  const staleBinding = await run("/me @finfolk.com.au");
  assert.equal(
    staleBinding.owner_id,
    null,
    "Old comment evidence must not authorise a same-sender relink",
  );
  const freshChallenge = await act("instagramCommandVerify");
  const refreshedBinding = await run(freshChallenge.command);
  assert.equal(refreshedBinding.owner_id, uid);
  // Removing a connection invalidates the comment mapping, without handle fallback.
  await q(
    "UPDATE finfolk.instagram_connections SET status='disconnected' WHERE user_id=$1",
    [uid],
  );
  await q(
    "UPDATE finfolk.instagram_commands SET received_at=now()-interval '2 hours',send_started_at=CASE WHEN send_started_at IS NULL THEN NULL ELSE now()-interval '2 hours' END WHERE actor_id=$1",
    [actor],
  );
  const disconnected = await run("/me @finfolk.com.au");
  assert.equal(disconnected.owner_id, null);
  await reconcileCommentCommands(
    { ...env, INSTAGRAM_QUEUE: { send: async () => {} } },
    q,
  );
  // Signed webhook -> provider retrieval -> command interception -> correct public reply route.
  const originalFetch = globalThis.fetch,
    queued = [],
    paths = [],
    discoveryIds = [];
  const webEnv = {
    ...env,
    INSTAGRAM_APP_SECRET: "synthetic-secret",
    INSTAGRAM_DISCOVERY_ENABLED: "true",
    INSTAGRAM_COMMAND_PUBLICATION_ENABLED: "true",
    INSTAGRAM_PUBLICATION_ENABLED: "true",
    INSTAGRAM_QUEUE: { send: async (job) => queued.push(job) },
  };
  try {
    for (const context of ["mention", "owned"]) {
      const comment = make("/help @finfolk.com.au", actor + "4");
      comment.media.owner = { id: context === "owned" ? brand : "111" };
      globalThis.fetch = async (url, options = {}) => {
        if (options.method === "POST") {
          paths.push(new URL(url).pathname);
          return { ok: true, json: async () => ({ id: "998877" }) };
        }
        return {
          ok: true,
          json: async () =>
            context === "owned" ? comment : { mentioned_comment: comment },
        };
      };
      const value =
        context === "owned"
          ? { id: comment.id, media: { id: comment.media.id } }
          : { comment_id: comment.id, media_id: comment.media.id };
      const body = JSON.stringify({
        object: "instagram",
        entry: [
          {
            id: brand,
            changes: [
              { field: context === "owned" ? "comments" : "mentions", value },
            ],
          },
        ],
      });
      const signature =
        "sha256=" +
        createHmac("sha256", webEnv.INSTAGRAM_APP_SECRET)
          .update(body)
          .digest("hex");
      const response = await instagramWebhook(
        new Request("https://api.test/instagram/webhook", {
          method: "POST",
          headers: { "x-hub-signature-256": signature },
          body,
        }),
        webEnv,
        q,
      );
      assert.equal(response.status, 200);
      const job = queued.shift();
      assert.equal(job.id, comment.id);
      await processInstagramEvent(job.id, webEnv, q, db);
      assert.equal(
        (
          await q(
            "SELECT * FROM finfolk.instagram_discoveries WHERE media_id=$1",
            [comment.media.id],
          )
        ).length,
        0,
        "Help must not trigger discovery",
      );
      assert.equal(
        (
          await q(
            "SELECT * FROM finfolk.instagram_actions WHERE source_id=$1",
            [comment.id],
          )
        ).length,
        0,
        "Help must not trigger legacy action drafts",
      );
      assert.ok(
        paths
          .at(-1)
          .endsWith(
            context === "owned" ? comment.id + "/replies" : brand + "/mentions",
          ),
      );
    }
    const ordinary = make("stats Bondi Beach @finfolk.com.au", sender);
    discoveryIds.push(ordinary.media.id);
    globalThis.fetch = async (url, options = {}) => {
      if (options.method === "POST")
        throw Error("Ordinary mentions must not send automatically");
      return Response.json({ mentioned_comment: ordinary });
    };
    await q(
      "INSERT INTO finfolk.instagram_events(id,payload) VALUES($1,$2::jsonb)",
      [
        ordinary.id,
        JSON.stringify({
          context: "mention",
          commentId: ordinary.id,
          mediaId: ordinary.media.id,
        }),
      ],
    );
    await processInstagramEvent(ordinary.id, webEnv, q, db);
    const recommended = (
      await q(
        "SELECT owner_id,kind,data FROM finfolk.instagram_actions WHERE source_id=$1",
        [ordinary.id],
      )
    )[0];
    assert.equal(
      recommended.owner_id,
      null,
      "A matching numeric DM sender must not authorise a public comment",
    );
    assert.equal(recommended.kind, "reply");
    assert.equal(recommended.data.reply, "");
    // A verified commenter recommending another creator never makes that creator's post automatic.
    await q(
      "UPDATE finfolk.instagram_connections SET status='connected',share_posts=true,media_owner_id=$2 WHERE user_id=$1",
      [uid, actor + "33"],
    );
    await q(
      "UPDATE finfolk.instagram_commands SET received_at=now()-interval '2 hours',send_started_at=CASE WHEN send_started_at IS NULL THEN NULL ELSE now()-interval '2 hours' END WHERE actor_id=$1",
      [actor],
    );
    const publish = make("/publish Bondi Beach @finfolk.com.au");
    discoveryIds.push(publish.media.id);
    await processCommentCommand(publish, "mention", webEnv, db, { fetcher });
    const listing = (
      await q("SELECT * FROM finfolk.instagram_discoveries WHERE media_id=$1", [
        publish.media.id,
      ])
    )[0];
    assert.equal(listing.state, "pending");
    assert.equal(listing.automatic, false);
    assert.equal(listing.owner_id, null);
    assert.equal(listing.caption, publish.media.caption);
    // Private review status is visible only to the verified post owner.
    const statusComment = make("/status @finfolk.com.au");
    statusComment.media = publish.media;
    await q(
      "UPDATE finfolk.instagram_discoveries SET owner_id=$2 WHERE id=$1",
      [listing.id, other],
    );
    await processCommentCommand(statusComment, "mention", webEnv, db, {
      fetcher,
    });
    const statusRow = (
      await q("SELECT reply FROM finfolk.instagram_commands WHERE id=$1", [
        statusComment.id,
      ])
    )[0];
    assert.ok(!statusRow.reply.includes("awaiting review"));
  } finally {
    globalThis.fetch = originalFetch;
    await q(
      "DELETE FROM finfolk.instagram_actions WHERE source_id IN (SELECT jsonb_array_elements_text($1::jsonb))",
      [JSON.stringify(ids)],
    );
    await q(
      "DELETE FROM finfolk.instagram_events WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))",
      [JSON.stringify(ids)],
    );
    await q(
      "DELETE FROM finfolk.instagram_discoveries WHERE media_id IN (SELECT jsonb_array_elements_text($1::jsonb))",
      [JSON.stringify(discoveryIds)],
    );
  }
  console.log(
    "Comment integration passed: identity proof, privacy, dates, concurrent deduplication, confirmation ownership, gates, durable limits and uncertain-send reconciliation.",
  );
} finally {
  globalThis.fetch = nativeFetch;
  await fixture.restore();
  await q(
    "DELETE FROM finfolk.instagram_commands WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))",
    [JSON.stringify(ids)],
  );
  for (const id of [uid, other]) {
    await q("DELETE FROM finfolk.members WHERE user_id=$1", [id]);
    await q('DELETE FROM neon_auth."user" WHERE id=$1', [id]);
  }
  await db.pool.end();
}
