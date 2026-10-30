import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import { database } from "../backend/db.mjs";
import {
  instagramAction,
  parseActionRequest,
} from "../backend/instagram-actions.mjs";
import {
  instagramWebhook,
  validSignature,
  processInstagramEvent,
} from "../backend/instagram-webhook.mjs";
import { invitationAction } from "../backend/invitations.mjs";
if (process.env.NEON_BRANCH !== "finfolk-regulars-dev")
  throw Error("Isolated branch required");
const db = database(process.env.DATABASE_URL),
  q = db.query,
  tag = randomBytes(6).toString("hex"),
  owner = "igtest_" + tag,
  other = "igother_" + tag,
  admin = "igadmin_" + tag,
  source = String(Date.now()) + String(Math.floor(Math.random() * 10000));
const env = { INSTAGRAM_ADMIN_IDS: admin };
const act = (action, v = {}, uid = owner) =>
  instagramAction({ action, v, uid, env, q, verified: () => {} });
const ids = [];
try {
  for (const uid of [owner, other, admin])
    await q(
      "INSERT INTO finfolk.members(user_id,profile,invite_eligible) VALUES($1,$2::jsonb,true)",
      [uid, JSON.stringify({ displayName: "Test", open: false, sharing: {} })],
    );
  assert.deepEqual(
    parseActionRequest(
      "@finfolk.com.au log Bondi Beach depth 8m duration 30min points stats",
    ).kinds,
    ["reply", "stats", "dive", "points"],
  );
  assert.equal(parseActionRequest("log depth 8 duration 30").depth, 8);
  const connect = await act("instagramConnect", { handle: "@test_" + tag });
  assert.ok(connect.code);
  await assert.rejects(
    act(
      "instagramVerify",
      { userId: owner, code: connect.code, senderId: source, confirmed: true },
      other,
    ),
    /Administrator/,
  );
  await assert.rejects(
    act(
      "instagramVerify",
      { userId: owner, code: "wrong", senderId: source, confirmed: true },
      admin,
    ),
    /incorrect/,
  );
  await act(
    "instagramVerify",
    { userId: owner, code: connect.code, senderId: source, confirmed: true },
    admin,
  );
  assert.equal((await act("instagramStatus")).connection.status, "connected");
  const invite = await invitationAction({
    action: "invitationStatus",
    v: {},
    uid: other,
    q,
    verified: () => {},
  });
  await invitationAction({
    action: "invitationClaim",
    v: { code: new URL(invite.url).searchParams.get("invite") },
    uid: owner,
    q,
    verified: () => {},
  });
  assert.equal(
    (
      await invitationAction({
        action: "invitationStatus",
        v: {},
        uid: other,
        q,
        verified: () => {},
      })
    ).points,
    1,
  );
  const beach = (await q("SELECT id,name FROM finfolk.beaches LIMIT 1"))[0];
  assert.ok(beach);
  async function row(kind, offset = "") {
    const r = (
      await q(
        "INSERT INTO finfolk.instagram_actions(source_id,owner_id,sender_id,kind,data) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id",
        [
          source + offset,
          owner,
          source,
          kind,
          JSON.stringify({ reply: "Example stats reply" }),
        ],
      )
    )[0];
    ids.push(r.id);
    return r.id;
  }
  const dive = await row("dive");
  await assert.rejects(
    act("instagramReview", { id: dive, mode: "approve" }, admin),
    /confirm/,
  );
  await assert.rejects(
    act(
      "instagramConfirm",
      {
        id: dive,
        ownDive: true,
        beachId: beach.id,
        values: { date: "2026-10-31", locationName: beach.name },
      },
      other,
    ),
    /unavailable/,
  );
  await act("instagramConfirm", {
    id: dive,
    ownDive: true,
    beachId: beach.id,
    values: { date: "2026-10-31", locationName: beach.name, maxDepthMetres: 8 },
  });
  await act("instagramReview", { id: dive, mode: "approve" }, admin);
  await assert.rejects(
    act("instagramReview", { id: dive, mode: "approve" }, admin),
    /processed/,
  );
  assert.equal(
    (
      await q(
        "SELECT count(*)::integer AS n FROM finfolk.sessions WHERE owner_id=$1",
        [owner],
      )
    )[0].n,
    1,
  );
  const stats = await row("stats");
  await assert.rejects(
    act("instagramConfirm", { id: stats, reply: "changed" }),
    /exact/,
  );
  await act("instagramConfirm", { id: stats, reply: "Example stats reply" });
  await assert.rejects(
    act("instagramReview", { id: stats, mode: "approve" }, admin),
    /disabled/,
  );
  for (const suffix of ["1", "2"]) {
    const id = await row("points", suffix);
    await act("instagramReview", { id, mode: "approve" }, admin);
  }
  assert.equal(
    (await act("instagramStatus")).total,
    1,
    "Participation limited to once per day",
  );
  const raw = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "123",
          changes: [{ field: "mentions", value: { comment_id: source } }],
        },
      ],
    }),
    secret = "test-secret",
    signature =
      "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.ok(validSignature(raw, signature, secret));
  assert.equal(validSignature(raw + "x", signature, secret), false);
  let queued = 0;
  const webenv = {
    INSTAGRAM_APP_SECRET: secret,
    INSTAGRAM_ACCOUNT_ID: "123",
    INSTAGRAM_QUEUE: { send: async () => queued++ },
  };
  for (let i = 0; i < 2; i++) {
    const response = await instagramWebhook(
      new Request("https://test/instagram/webhook", {
        method: "POST",
        headers: { "x-hub-signature-256": signature },
        body: raw,
      }),
      webenv,
      q,
    );
    assert.equal(response.status, 200);
  }
  assert.equal(
    (
      await q(
        "SELECT count(*)::integer AS n FROM finfolk.instagram_events WHERE id=$1",
        [source],
      )
    )[0].n,
    1,
  );
  assert.equal(queued, 2);
  const otherCode = await act(
    "instagramConnect",
    { handle: "inviter_" + tag },
    other,
  );
  const dmRaw = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "123",
        messaging: [
          {
            sender: { id: source + "9" },
            message: { mid: "test_" + tag, text: "FINFOLK " + otherCode.code },
          },
        ],
      },
    ],
  });
  const dmSignature =
    "sha256=" + createHmac("sha256", secret).update(dmRaw).digest("hex");
  assert.equal(
    (
      await instagramWebhook(
        new Request("https://test/instagram/webhook", {
          method: "POST",
          headers: { "x-hub-signature-256": dmSignature },
          body: dmRaw,
        }),
        webenv,
        q,
      )
    ).status,
    200,
  );
  assert.equal(
    (await act("instagramAdminInbox", {}, admin)).connections.find(
      (c) => c.user_id === other,
    ).message_sender_id,
    source + "9",
  );
  await act(
    "instagramVerify",
    { userId: other, senderId: source + "9", confirmed: true },
    admin,
  );
  assert.equal(
    (await act("instagramStatus", {}, other)).connection.status,
    "connected",
  );
  await processInstagramEvent(source, {}, q);
  assert.equal(
    (
      await q("SELECT status FROM finfolk.instagram_events WHERE id=$1", [
        source,
      ])
    )[0].status,
    "queued",
  );
  await act("instagramDisconnect");
  await assert.rejects(
    act("instagramConfirm", { id: stats, reply: "Example stats reply" }),
    /no longer active/,
  );
  console.log(
    "INSTAGRAM_ACTIONS_PASS: ownership, admin permissions, private dive confirmation, idempotency, disabled delivery, points limit, invites, signed webhooks and disconnect.",
  );
} finally {
  await q("DELETE FROM finfolk.points_ledger WHERE user_id=$1", [owner]);
  await q("DELETE FROM finfolk.instagram_actions WHERE owner_id=$1", [owner]);
  await q("DELETE FROM finfolk.instagram_events WHERE id=$1 OR id=$2", [
    source,
    "dm:test_" + tag,
  ]);
  await q("DELETE FROM finfolk.sessions WHERE owner_id=$1", [owner]);
  await q("DELETE FROM finfolk.invitation_joins WHERE invitee_id=$1", [owner]);
  for (const uid of [owner, other, admin])
    await q("DELETE FROM finfolk.members WHERE user_id=$1", [uid]);
  await db.pool.end();
}
