// Real SQL and real finfolk_api permissions; Meta transport is deliberately mocked.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { database } from "../backend/db.mjs";
import { createAPI } from "../backend/api.mjs";
import { instagramWebhook } from "../backend/instagram-webhook.mjs";
import {
  processInstagramDM,
  reconcileInstagramDM,
  sendOutbox,
} from "../backend/messaging-engine.mjs";
import { messagingConfig, digest } from "../backend/messaging-config.mjs";
const project = "odd-voice-85400108",
  branch = "finfolk-community-pilot-test";
const connection = (role) =>
  execFileSync(
    "neon",
    [
      "connection-string",
      branch,
      "--project-id",
      project,
      ...(role ? ["--role-name", role] : []),
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
const url = connection();
assert.ok(
  new URL(url).hostname.startsWith("ep-little-thunder-a7s1soji"),
  "Refusing non-test endpoint",
);
execFileSync(process.execPath, ["scripts/migrate_neon.mjs"], {
  env: { ...process.env, DATABASE_URL_UNPOOLED: url },
  stdio: ["ignore", "pipe", "pipe"],
});
const db = database(url),
  runtime = database(connection("finfolk_api")),
  q = db.query;
const original = (
  await q("SELECT * FROM finfolk.messaging_accounts WHERE id='instagram'")
)[0];
const owner = randomUUID(),
  other = randomUUID(),
  admin = randomUUID(),
  unverified = randomUUID(),
  users = [owner, other, admin, unverified];
const base = String(Date.now()),
  sender = base + "1",
  otherSender = base + "2",
  stranger = base + "3",
  brand = "99999999",
  queued = [],
  replies = [];
const env = {
  INSTAGRAM_ACCOUNT_ID: brand,
  INSTAGRAM_APP_ID: "778",
  INSTAGRAM_APP_SECRET: "fixture-signature",
  INSTAGRAM_VERIFY_TOKEN: "fixture-verify",
  INSTAGRAM_ADMIN_IDS: admin,
  MESSAGING_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  INSTAGRAM_MESSAGING_APP_ID: "777",
  INSTAGRAM_MESSAGING_CLIENT_SECRET: "fixture-client-secret",
  INSTAGRAM_MESSAGING_GRAPH_VERSION: "v26.0",
  INSTAGRAM_MESSAGING_ACCOUNT_ID: brand,
  INSTAGRAM_QUEUE: {
    send: async (job) => {
      if (queueError) throw Error("queue unavailable");
      queued.push(job);
    },
  },
};
let follows = true,
  profileError = false,
  sendFailure = null,
  queueError = false,
  serial = 0,
  profileCalls = 0;
const fetcher = async (input, options = {}) => {
  const url = new URL(input);
  assert.ok(
    ["graph.instagram.com", "api.instagram.com"].includes(url.hostname),
    "Messaging must not mix Graph API stacks",
  );
  const ok = (data) => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => data,
  });
  if (url.hostname === "api.instagram.com")
    return ok({ access_token: "fixture-short" });
  if (
    url.pathname === "/access_token" ||
    url.pathname === "/refresh_access_token"
  )
    return ok({ access_token: "fixture-long", expires_in: 5184000 });
  if (url.pathname.endsWith("/me"))
    return ok({ id: brand, username: "finfolk.com.au" });
  if (url.pathname.endsWith("/subscribed_apps"))
    return ok(
      options.method === "POST"
        ? { success: true }
        : { data: [{ id: "778", subscribed_fields: ["messages"] }] },
    );
  assert.equal(options.headers.Authorization, "Bearer fixture-long");
  assert.ok(!url.href.includes("fixture-long"));
  if (options.method === "POST") {
    const sent = JSON.parse(options.body);
    assert.ok([sender, otherSender, stranger].includes(sent.recipient.id));
    if (sendFailure === "timeout") throw Error("network disconnected");
    if (sendFailure === "rate")
      return {
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "1" }),
        json: async () => ({ error: { code: 4 } }),
      };
    if (sendFailure === "server")
      return {
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({
          error: { message: "private provider internals" },
        }),
      };
    replies.push(sent);
    return ok({ message_id: "provider-" + serial++ });
  }
  profileCalls++;
  if (profileError)
    return ok({
      id: url.pathname.split("/").pop(),
      username: "missing.follow",
    });
  return ok({
    id: url.pathname.split("/").pop(),
    username: url.pathname.endsWith("/" + sender)
      ? "chriszfree"
      : "other.diver",
    is_user_follow_business: follows,
  });
};
const app = createAPI({
  db: runtime,
  verify: async (token) => {
    if (!users.includes(token)) throw Error("unauthorized");
    return { sub: token };
  },
  messagingFetch: fetcher,
});
const spec = await SwaggerParser.dereference("docs/openapi/messaging.yaml");
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const contracts = [];
for (const [path, item] of Object.entries(spec.paths))
  for (const method of ["get", "post", "put", "delete"])
    if (item[method])
      contracts.push({
        pattern: new RegExp("^" + path.replaceAll("{id}", "[^/]+") + "$"),
        method,
        operation: item[method],
      });
async function request(
  uid,
  method,
  path,
  input,
  expected = 200,
  key = randomUUID(),
) {
  const headers = {
    ...(uid ? { Authorization: "Bearer " + uid } : {}),
    ...(key ? { "Idempotency-Key": key } : {}),
  };
  if (method !== "GET" && method !== "DELETE")
    headers["Content-Type"] = "application/json";
  const response = await app.request(
    "https://api.test" + path,
    {
      method,
      headers,
      ...(method !== "GET" && method !== "DELETE"
        ? { body: JSON.stringify(input || {}) }
        : {}),
    },
    env,
  );
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  const contract = contracts.find(
    (c) =>
      c.method === method.toLowerCase() && c.pattern.test(path.split("?")[0]),
  );
  const schema =
    contract?.operation.responses[String(expected)]?.content?.[
      "application/json"
    ]?.schema;
  if (schema) {
    const validate = ajv.compile(schema);
    assert.ok(validate(result), JSON.stringify(validate.errors));
  }
  assert.match(result.requestId, /^[a-f0-9-]{36}$/);
  return { data: result.data, error: result.error, response };
}
async function legacy(uid, action, input = {}, expected = 200) {
  const response = await app.request(
    "https://api.test/api",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + uid,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...input }),
    },
    env,
  );
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result.data;
}
async function drain() {
  let loops = 0;
  while (queued.length) {
    assert.ok(loops++ < 100);
    const job = queued.shift();
    if (job.kind === "instagram-dm")
      await processInstagramDM(job.id, env, runtime, { fetcher });
    else if (job.kind === "instagram-dm-reply")
      await sendOutbox(job.id, env, runtime, { fetcher });
  }
}
async function incoming(
  who,
  text,
  {
    mid = "fixture-" + base + "-" + serial++,
    at = Date.now(),
    deliver = true,
  } = {},
) {
  const payload = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: brand,
        messaging: [
          {
            sender: { id: who },
            recipient: { id: brand },
            timestamp: at,
            message: { mid, text },
          },
        ],
      },
    ],
  });
  const response = await instagramWebhook(
    new Request("https://api.test/instagram/webhook", {
      method: "POST",
      headers: {
        "X-Hub-Signature-256":
          "sha256=" +
          createHmac("sha256", env.INSTAGRAM_APP_SECRET)
            .update(payload)
            .digest("hex"),
      },
      body: payload,
    }),
    env,
    runtime.query,
  );
  assert.equal(response.status, 200);
  if (deliver) await drain();
  const config = await messagingConfig(q, env);
  return (
    await q("SELECT * FROM finfolk.instagram_dm_events WHERE id=$1", [
      "dm:" + config.scope + ":" + mid,
    ])
  )[0];
}
const event = async (id) =>
  (await q("SELECT * FROM finfolk.instagram_dm_events WHERE id=$1", [id]))[0];
const outbox = async (id) =>
  (
    await q("SELECT * FROM finfolk.messaging_outbox WHERE event_id=$1", [id])
  )[0];
async function rollout(enabledCommands, acceptance, mode = "pilot") {
  return (
    await request(admin, "PUT", "/v1/admin/messaging/instagram", {
      mode,
      enabledCommands,
      pilotSenderIds: [sender, otherSender],
      ...(acceptance ? { acceptance } : {}),
    })
  ).data;
}
try {
  await q(
    "UPDATE finfolk.messaging_accounts SET account_id=null,username=null,credential_ciphertext=null,token_expires_at=null,mode='disabled',enabled_commands='[\"ping\",\"help\"]',pilot_sender_ids='[]',checks='{}',generation=generation+1,provider_scope=null,backoff_until=null WHERE id='instagram'",
  );
  for (const uid of users) {
    await q(
      'INSERT INTO neon_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,$4,now(),now())',
      [uid, "Messaging fixture", uid + "@example.com", uid !== unverified],
    );
    await legacy(uid, "me");
  }
  await request(null, "GET", "/v1/me/instagram", null, 401);
  await request(owner, "GET", "/v1/admin/messaging/instagram", null, 403);
  const missingKey = await request(
    owner,
    "PUT",
    "/v1/me/instagram/profile",
    { handle: "@chriszfree" },
    400,
    null,
  );
  assert.equal(missingKey.error.code, "idempotency_key_required");
  await request(
    owner,
    "PUT",
    "/v1/me/instagram/profile",
    { handle: "https://example.com/user" },
    400,
  );
  await request(owner, "PUT", "/v1/me/instagram/profile", {
    handle: "@chriszfree",
  });
  assert.equal(
    (await request(owner, "GET", "/v1/me/instagram")).data.profileUrl,
    "https://www.instagram.com/chriszfree/",
  );
  assert.equal((await legacy(owner, "me")).profile.open, false);
  assert.equal(
    (await request(admin, "GET", "/v1/admin/messaging/instagram")).data.ready,
    false,
  );
  const paused = await incoming(sender, "/ping");
  assert.equal(paused.processing_state, "paused");
  assert.equal(replies.length, 0);
  await incoming(otherSender, "/help");
  const auth = (
    await request(
      admin,
      "POST",
      "/v1/admin/messaging/instagram/authorization",
      {},
    )
  ).data;
  const state = new URL(auth.authorizationUrl).searchParams.get("state");
  const callback = await app.request(
    "https://api.test/v1/integrations/instagram/oauth/callback?state=" +
      state +
      "&code=fixture-code",
    {},
    env,
  );
  assert.equal(callback.status, 303, await callback.text());
  const replay = await app.request(
    "https://api.test/v1/integrations/instagram/oauth/callback?state=" +
      state +
      "&code=fixture-code",
    {},
    env,
  );
  assert.equal(replay.status, 400);
  assert.ok(
    !(
      await q(
        "SELECT credential_ciphertext FROM finfolk.messaging_accounts WHERE id='instagram'",
      )
    )[0].credential_ciphertext.includes("fixture-long"),
  );
  await rollout(["ping", "help"]);
  await drain();
  assert.equal(replies.length, 0, "Paused receipts must never be replayed");
  const beforePing = profileCalls,
    ping = await incoming(sender, "/ping");
  assert.equal((await event(ping.id)).processing_state, "completed");
  assert.match(replies.at(-1).message.text, /^Pong\. Reference:/);
  assert.equal((await outbox(ping.id)).state, "provider_accepted");
  assert.equal(
    profileCalls - beforePing,
    2,
    "Follow checked before effects and before sending",
  );
  const help = await incoming(sender, "/help");
  assert.match(replies.at(-1).message.text, /\/ping/);
  assert.ok(
    !replies.at(-1).message.text.includes("/checkin"),
    "Help lists only enabled commands",
  );
  const count = replies.length;
  await incoming(sender, "/ping", { mid: ping.id.split(":").at(-1) });
  assert.equal(replies.length, count, "Duplicate webhook must not reply twice");
  const strangerEvent = await incoming(stranger, "/ping");
  assert.equal((await event(strangerEvent.id)).error, "rollout_restricted");
  follows = false;
  const unfollowed = await incoming(sender, "/ping");
  assert.equal((await event(unfollowed.id)).processing_state, "blocked");
  assert.equal(replies.length, count);
  follows = true;
  const acceptance = {
    pingEventId: ping.event_id,
    helpEventId: help.event_id,
    visibleRepliesConfirmed: true,
    productionAccessConfirmed: false,
    nonFollowerTestConfirmed: false,
  };
  const all = ["ping", "help", "claim", "status", "checkin", "points"];
  await rollout(all, acceptance);
  await request(
    admin,
    "PUT",
    "/v1/admin/messaging/instagram",
    { mode: "live", enabledCommands: all, pilotSenderIds: [] },
    409,
  );
  await request(unverified, "POST", "/v1/me/instagram/claims", {}, 403);
  const claimKey = randomUUID(),
    concurrent = await Promise.all([
      request(owner, "POST", "/v1/me/instagram/claims", {}, 201, claimKey),
      request(owner, "POST", "/v1/me/instagram/claims", {}, 201, claimKey),
    ]),
    created = concurrent[0];
  assert.deepEqual(concurrent[0].data, concurrent[1].data);
  assert.equal(
    concurrent.filter(
      (result) =>
        result.response.headers.get("Idempotency-Replayed") === "true",
    ).length,
    1,
  );
  const repeated = await request(
    owner,
    "POST",
    "/v1/me/instagram/claims",
    {},
    201,
    claimKey,
  );
  assert.deepEqual(repeated.data, created.data);
  assert.equal(repeated.response.headers.get("Idempotency-Replayed"), "true");
  await request(
    owner,
    "POST",
    "/v1/me/instagram/claims",
    { unexpected: true },
    409,
    claimKey,
  );
  await request(
    other,
    "GET",
    "/v1/me/instagram/claims/" + created.data.id,
    null,
    404,
  );
  const secret = (
    await q(
      "SELECT response_ciphertext FROM finfolk.messaging_idempotency WHERE user_id=$1 AND key_hash=$2",
      [owner, digest(claimKey)],
    )
  )[0];
  assert.ok(!secret.response_ciphertext.includes(created.data.command));
  follows = false;
  const followClaim = await incoming(sender, created.data.command);
  assert.equal(
    (await request(owner, "GET", "/v1/me/instagram/claims/" + created.data.id))
      .data.state,
    "follow_required",
  );
  assert.equal(await outbox(followClaim.id), undefined);
  follows = true;
  await q(
    "INSERT INTO finfolk.invitation_joins(invitee_id,inviter_id) VALUES($1,$2)",
    [owner, admin],
  );
  await incoming(sender, created.data.command);
  assert.equal(
    (await request(owner, "GET", "/v1/me/instagram")).data.verification,
    "verified",
  );
  assert.equal((await legacy(owner, "me")).profile.open, false);
  await request(
    owner,
    "PUT",
    "/v1/me/instagram/profile",
    { handle: "@someone.else" },
    409,
  );
  await incoming(sender, "/status");
  assert.match(replies.at(-1).message.text, /chriszfree.*claimed/);
  await incoming(sender, "/points");
  assert.match(replies.at(-1).message.text, /total/);
  follows = false;
  const pointCount = replies.length;
  await incoming(sender, "/points");
  assert.equal(replies.length, pointCount);
  follows = true;
  await incoming(sender, "/checkin Bondi Beach");
  assert.match(replies.at(-1).message.text, /Checked in/);
  await incoming(sender, "/checkin Bondi Beach");
  assert.match(replies.at(-1).message.text, /already checked in/);
  assert.equal((await legacy(owner, "myCheckins")).length, 1);
  const otherClaim = (
    await request(other, "POST", "/v1/me/instagram/claims", {}, 201)
  ).data;
  profileError = true;
  const failed = await incoming(otherSender, otherClaim.command);
  profileError = false;
  assert.equal((await event(failed.id)).processing_state, "failed");
  assert.equal(
    (await request(other, "GET", "/v1/me/instagram/claims/" + otherClaim.id))
      .data.state,
    "failed",
  );
  await request(
    other,
    "POST",
    "/v1/me/instagram/claims/" + otherClaim.id + "/review-request",
    {},
  );
  const review = (
    await request(admin, "GET", "/v1/admin/messaging/claim-reviews")
  ).data.find((row) => row.user_id === other);
  assert.ok(review);
  await request(
    owner,
    "POST",
    "/v1/admin/messaging/claim-reviews/" + otherClaim.id + "/decision",
    { decision: "approve" },
    403,
  );
  await request(
    admin,
    "POST",
    "/v1/admin/messaging/claim-reviews/" + otherClaim.id + "/decision",
    { decision: "approve", handle: "other.diver", senderChecked: true },
    400,
  );
  await request(
    admin,
    "POST",
    "/v1/admin/messaging/claim-reviews/" + otherClaim.id + "/decision",
    {
      decision: "approve",
      handle: "other.diver",
      senderChecked: true,
      followChecked: true,
    },
  );
  sendFailure = "timeout";
  const uncertain = await incoming(sender, "/points");
  sendFailure = null;
  assert.equal((await outbox(uncertain.id)).state, "uncertain");
  const sentBefore = replies.length;
  await processInstagramDM(uncertain.id, env, runtime, { fetcher });
  assert.equal(replies.length, sentBefore);
  await request(
    admin,
    "POST",
    "/v1/admin/messaging/events/" + uncertain.event_id + "/retry",
    {},
    409,
  );
  sendFailure = "rate";
  const limited = await incoming(sender, "/ping");
  sendFailure = null;
  assert.equal((await outbox(limited.id)).state, "pending");
  const backedOffCalls = profileCalls,
    backedOff = await incoming(sender, "/help");
  assert.equal((await event(backedOff.id)).error, "provider_backoff");
  assert.equal(
    profileCalls,
    backedOffCalls,
    "Account backoff prevents further provider calls",
  );
  await q(
    "UPDATE finfolk.messaging_accounts SET backoff_until=null WHERE id='instagram'",
  );
  await q(
    "UPDATE finfolk.messaging_outbox SET next_attempt_at=now()-interval '1 second' WHERE event_id=$1",
    [limited.id],
  );
  await sendOutbox((await outbox(limited.id)).id, env, runtime, { fetcher });
  assert.equal((await outbox(limited.id)).state, "provider_accepted");
  sendFailure = "server";
  const ambiguous = await incoming(sender, "/ping");
  sendFailure = null;
  assert.equal((await outbox(ambiguous.id)).state, "uncertain");
  const past = await incoming(sender, "/ping", { at: Date.now() - 90000000 });
  assert.equal((await event(past.id)).error, "message_expired");
  const future = await incoming(sender, "/help", { at: Date.now() + 600000 });
  assert.equal((await event(future.id)).error, "message_expired");
  queueError = true;
  const stranded = await incoming(sender, "/ping");
  queueError = false;
  assert.equal(stranded.processing_state, "received");
  await reconcileInstagramDM(env, runtime.query);
  await drain();
  assert.equal((await outbox(stranded.id)).state, "provider_accepted");
  const interrupted = await incoming(sender, "/ping", { deliver: false });
  await q(
    "UPDATE finfolk.instagram_dm_events SET processing_state='processing',lease=$2,updated_at=now()-interval '3 minutes' WHERE id=$1",
    [interrupted.id, randomUUID()],
  );
  await reconcileInstagramDM(env, runtime.query);
  await drain();
  assert.equal(
    (await outbox(interrupted.id)).state,
    "provider_accepted",
    "Interrupted command lease is recovered once",
  );
  const interruptedCount = replies.length;
  await q(
    "UPDATE finfolk.messaging_outbox SET state='sending',lease=$2,updated_at=now()-interval '3 minutes' WHERE event_id=$1",
    [interrupted.id, randomUUID()],
  );
  await reconcileInstagramDM(env, runtime.query);
  await drain();
  assert.equal((await outbox(interrupted.id)).state, "uncertain");
  assert.equal(
    replies.length,
    interruptedCount,
    "Interrupted delivery must never be resent",
  );
  const diagnostic = (
    await request(admin, "GET", "/v1/admin/messaging/events/" + ping.event_id)
  ).data;
  assert.equal(diagnostic.reply.state, "provider_accepted");
  assert.ok(!JSON.stringify(diagnostic).includes("challenge_hash"));
  assert.ok(!Object.hasOwn(diagnostic, "args"));
  const page = (
    await request(admin, "GET", "/v1/admin/messaging/events?limit=1")
  ).data;
  assert.equal(page.events.length, 1);
  assert.ok(page.nextCursor);
  await request(
    admin,
    "GET",
    "/v1/admin/messaging/events?limit=1&cursor=" + page.nextCursor,
  );
  await request(
    admin,
    "GET",
    "/v1/admin/messaging/events?cursor=broken",
    null,
    400,
  );
  const notSigned = await instagramWebhook(
    new Request("https://api.test/instagram/webhook", {
      method: "POST",
      body: "{}",
    }),
    env,
    runtime.query,
  );
  assert.equal(notSigned.status, 403);
  const promptBefore = replies.length;
  await incoming(sender, "hello");
  await incoming(sender, "another arbitrary private message");
  assert.equal(replies.length, promptBefore + 1);
  const rateKey = digest((await messagingConfig(q, env)).scope + ":" + sender);
  await q(
    "UPDATE finfolk.instagram_dm_limits SET minute=date_trunc('minute',now()),count=30 WHERE sender_id=$1",
    [rateKey],
  );
  const rate = await incoming(sender, "/ping");
  assert.equal((await event(rate.id)).error, "sender_rate_limit");
  await q("DELETE FROM finfolk.instagram_dm_limits WHERE sender_id=$1", [
    rateKey,
  ]);
  const pending = await incoming(sender, "/points", { deliver: false });
  await request(owner, "DELETE", "/v1/me/instagram");
  await drain();
  assert.equal((await event(pending.id)).processing_state, "blocked");
  assert.equal(
    (await request(owner, "GET", "/v1/me/instagram")).data.profileUrl,
    "",
  );
  const oldCount = replies.length;
  await incoming(sender, created.data.command);
  assert.match(replies.at(-1).message.text, /invalid|replaced/);
  assert.equal(replies.length, oldCount + 1);
  const fresh = (
    await request(owner, "POST", "/v1/me/instagram/claims", {}, 201)
  ).data;
  await incoming(sender, fresh.command);
  assert.equal(
    (await request(owner, "GET", "/v1/me/instagram")).data.verification,
    "verified",
  );
  assert.equal(
    (
      await q(
        "SELECT count(*)::int AS n FROM finfolk.invitation_joins WHERE invitee_id=$1 AND rewarded_at IS NOT NULL",
        [owner],
      )
    )[0].n,
    1,
    "Reclaim cannot duplicate referral rewards",
  );
  await legacy(owner, "deleteAccount");
  assert.equal(
    (
      await q(
        "SELECT count(*)::int AS n FROM finfolk.instagram_dm_events WHERE owner_id=$1",
        [owner],
      )
    )[0].n,
    0,
  );
  assert.equal(
    (
      await q(
        "SELECT count(*)::int AS n FROM finfolk.messaging_idempotency WHERE user_id=$1",
        [owner],
      )
    )[0].n,
    0,
  );
  await request(admin, "PUT", "/v1/admin/messaging/instagram", {
    mode: "disabled",
    enabledCommands: ["ping", "help"],
    pilotSenderIds: [],
  });
  console.log(
    "MESSAGING_SQL_API_PASS: isolated migration, actual Worker role, OpenAPI response validation, OAuth, encrypted idempotency, owner/admin boundaries, durable receipts, follower gates, claims/reviews, commands, queue recovery, outbox uncertainty, rollout cancellation and account-deletion cleanup.",
  );
} finally {
  for (const uid of users) {
    await q("DELETE FROM finfolk.instagram_dm_events WHERE owner_id=$1", [uid]);
    await q("DELETE FROM finfolk.messaging_audit WHERE actor=$1", [uid]);
    await q("DELETE FROM finfolk.members WHERE user_id=$1", [uid]);
    await q('DELETE FROM neon_auth."user" WHERE id=$1', [uid]);
  }
  for (const who of [sender, otherSender, stranger]) {
    await q("DELETE FROM finfolk.instagram_dm_events WHERE sender_id=$1", [
      who,
    ]);
    await q("DELETE FROM finfolk.instagram_dm_limits WHERE sender_id=$1", [
      digest("instagram-login:777:" + brand + ":" + who),
    ]);
  }
  await q(
    `UPDATE finfolk.messaging_accounts SET account_id=$1,username=$2,credential_ciphertext=$3,token_expires_at=$4,mode=$5,enabled_commands=$6::jsonb,pilot_sender_ids=$7::jsonb,generation=$8,checks=$9::jsonb,last_webhook_at=$10,last_command_at=$11,last_reply_at=$12,provider_scope=$13,backoff_until=$14 WHERE id='instagram'`,
    [
      original.account_id,
      original.username,
      original.credential_ciphertext,
      original.token_expires_at,
      original.mode,
      JSON.stringify(original.enabled_commands),
      JSON.stringify(original.pilot_sender_ids),
      original.generation,
      JSON.stringify(original.checks),
      original.last_webhook_at,
      original.last_command_at,
      original.last_reply_at,
      original.provider_scope,
      original.backoff_until,
    ],
  );
  await db.pool.end();
  await runtime.pool.end();
}
