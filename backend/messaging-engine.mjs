import { randomUUID } from "node:crypto";
import {
  messagingConfig,
  modeAllows,
  runtimeEnv,
  digest,
  requiresFollower,
} from "./messaging-config.mjs";
import {
  InstagramProvider,
  refreshAuthorization,
} from "./instagram-provider.mjs";
import {
  parseInstagramCommand,
  commandResult,
  followRequiredReply,
} from "./instagram-dm-commands.mjs";
const terminal = ["completed", "ignored", "blocked", "paused"];
const retryDelay = (attempt) =>
  [30, 120, 600, 1800, 3600][Math.min(attempt - 1, 4)];
const expired = (event) =>
  Date.parse(event.message_at) < Date.now() - 86400000 ||
  Date.parse(event.message_at) > Date.now() + 300000;
const commandName = (event) =>
  ["unknown", "prompt", "claim_usage"].includes(event.command)
    ? event.command === "claim_usage"
      ? "claim"
      : "help"
    : event.command;
const canRun = (config, event) =>
  config.generation === event.generation &&
  modeAllows(config, event.sender_id, commandName(event));
function log(stage, event, extra = {}) {
  console.log(
    JSON.stringify({
      service: "instagram-messaging",
      stage,
      eventId: event.event_id,
      requestId: event.correlation_id,
      ...extra,
    }),
  );
}
export async function collectInstagramDM(
  event,
  env,
  q,
  { requestId = randomUUID() } = {},
) {
  const config = await messagingConfig(q, env);
  const brand = config.accountId || env.INSTAGRAM_ACCOUNT_ID;
  const sender = String(event.sender?.id || ""),
    recipient = String(event.recipient?.id || ""),
    mid = String(event.message?.mid || "");
  if (
    event.message?.is_echo ||
    !/^\d{1,40}$/.test(sender) ||
    recipient !== brand ||
    sender === recipient ||
    !mid ||
    mid.length > 500
  )
    return;
  const parsed =
    typeof event.message?.text === "string"
      ? parseInstagramCommand(event.message.text)
      : { command: "unsupported", args: "" };
  const timestamp = Number(event.timestamp);
  // Malformed or missing provider timestamps are not replaced with current time.
  const validTime =
    Number.isFinite(timestamp) &&
    timestamp > 0 &&
    Number.isFinite(new Date(timestamp).getTime());
  const when = validTime ? new Date(timestamp) : new Date(0);
  const id = "dm:" + config.scope + ":" + mid;
  const paused = config.mode === "disabled";
  const ignored = !validTime || parsed.command === "unsupported";
  const rows = await q(
    `INSERT INTO finfolk.instagram_dm_events(id,sender_id,recipient_id,command,args,challenge_hash,message_at,owner_id,
  provider_scope,correlation_id,processing_state,generation,rate_limit_key,error)
  VALUES($1,$2,$3,$4,$5,$6,$7,coalesce((SELECT user_id FROM finfolk.instagram_claims WHERE code_hash=$6 AND provider_scope=$8),
  (SELECT user_id FROM finfolk.instagram_connections WHERE sender_id=$2 AND provider_scope=$8 AND status='connected')),$8,$9,$10,$11,$12,$13)
  ON CONFLICT(id) DO NOTHING RETURNING event_id,correlation_id`,
    [
      id,
      sender,
      recipient,
      parsed.command,
      parsed.args,
      parsed.challengeHash || null,
      when,
      config.scope,
      requestId,
      ignored ? "ignored" : paused ? "paused" : "received",
      config.generation,
      digest(config.scope + ":" + sender),
      ignored ? "unsupported_event" : paused ? "processing_disabled" : "",
    ],
  );
  if (!rows.length) return;
  await q(
    "UPDATE finfolk.messaging_accounts SET last_webhook_at=now() WHERE id='instagram'",
  );
  log("received", rows[0], {
    state: ignored ? "ignored" : paused ? "paused" : "received",
  });
  if (!ignored && !paused) {
    try {
      await env.INSTAGRAM_QUEUE.send({ kind: "instagram-dm", id });
      await q(
        "UPDATE finfolk.instagram_dm_events SET processing_state='queued' WHERE id=$1 AND processing_state='received'",
        [id],
      );
    } catch {
      // The persisted receipt is recovered independently of queue publication.
      log("queue_deferred", rows[0]);
    }
  }
}
async function markBlocked(q, event, code, identity) {
  await q(
    "UPDATE finfolk.instagram_dm_events SET processing_state='blocked',status='done',error=$3,follow_checked_at=CASE WHEN $4::boolean THEN now() ELSE follow_checked_at END,updated_at=now() WHERE id=$1 AND lease=$2",
    [event.id, event.lease, code, !!identity],
  );
  if (event.challenge_hash)
    await q(
      `UPDATE finfolk.instagram_claims SET state=$3,sender_id=coalesce(sender_id,$2),handle=coalesce($4,handle),error=$5,updated_at=now()
  WHERE code_hash=$1 AND provider_scope=$6 AND state NOT IN ('claimed','cancelled') AND (sender_id IS NULL OR sender_id=$2)`,
      [
        event.challenge_hash,
        event.sender_id,
        code === "not_following" ? "follow_required" : "failed",
        identity?.handle || null,
        code === "not_following"
          ? "Follow @finfolk.com.au, then resend the command."
          : "Verification could not finish. Retry or request manual review.",
        event.provider_scope,
      ],
    );
  log("blocked", event, { code });
}
async function blockWithFollowReply(db, env, event, identity) {
  await db.transaction(async (q) => {
    await q(
      "SELECT id FROM finfolk.messaging_accounts WHERE id='instagram' FOR SHARE",
    );
    const locked = (
      await q(
        "SELECT id FROM finfolk.instagram_dm_events WHERE id=$1 AND lease=$2 AND processing_state='processing' FOR UPDATE",
        [event.id, event.lease],
      )
    )[0];
    if (!locked) return;
    if (!canRun(await messagingConfig(q, env), event))
      return markBlocked(q, event, "rollout_restricted");
    if (expired(event)) return markBlocked(q, event, "message_expired");
    await markBlocked(q, event, "not_following", identity);
    await q(
      "INSERT INTO finfolk.messaging_outbox(event_id,body,correlation_id,deadline) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING",
      [
        event.id,
        followRequiredReply,
        event.correlation_id,
        new Date(Date.parse(event.message_at) + 86400000),
      ],
    );
  });
}
export async function processInstagramDM(
  id,
  env,
  db,
  { fetcher = fetch } = {},
) {
  const lease = randomUUID();
  const event = (
    await db.query(
      `UPDATE finfolk.instagram_dm_events SET processing_state='processing',status='processing',lease=$2,attempts=attempts+1,updated_at=now()
  WHERE id=$1 AND processing_state IN ('received','queued','failed') AND attempts<5 AND next_attempt_at<=now() RETURNING *`,
      [id, lease],
    )
  )[0];
  if (!event) {
    await sendOutboxForEvent(id, env, db, { fetcher });
    return;
  }
  try {
    const config = await messagingConfig(db.query, env, { credentials: true });
    if (
      event.provider_scope !== config.scope ||
      event.recipient_id !== config.accountId ||
      !canRun(config, event)
    )
      return await markBlocked(db.query, event, "rollout_restricted");
    if (expired(event))
      return await markBlocked(db.query, event, "message_expired");
    if (
      !config.checks?.authorization ||
      !config.checks?.subscription ||
      !config.token ||
      (config.token_expires_at &&
        Date.parse(config.token_expires_at) <= Date.now())
    )
      return await markBlocked(db.query, event, "authorization_unavailable");
    if (config.backoff_until && new Date(config.backoff_until) > new Date()) {
      await db.query(
        "UPDATE finfolk.instagram_dm_events SET processing_state='failed',attempts=attempts-1,error='provider_backoff',next_attempt_at=$3 WHERE id=$1 AND lease=$2",
        [id, lease, config.backoff_until],
      );
      return;
    }
    const rate = (
      await db.query(
        `INSERT INTO finfolk.instagram_dm_limits(sender_id,count) VALUES($1,1) ON CONFLICT(sender_id) DO UPDATE
   SET minute=date_trunc('minute',now()),count=CASE WHEN instagram_dm_limits.minute=date_trunc('minute',now()) THEN instagram_dm_limits.count+1 ELSE 1 END RETURNING count`,
        [event.rate_limit_key],
      )
    )[0];
    if (rate.count > 30)
      return await markBlocked(db.query, event, "sender_rate_limit");
    if (event.challenge_hash)
      await db.query(
        "UPDATE finfolk.instagram_claims SET state='checking',sender_id=coalesce(sender_id,$2),updated_at=now() WHERE code_hash=$1 AND provider_scope=$3 AND expires_at>now() AND state IN ('waiting','failed','follow_required') AND (sender_id IS NULL OR sender_id=$2)",
        [event.challenge_hash, event.sender_id, event.provider_scope],
      );
    let identity = null;
    if (requiresFollower(event.command)) {
      identity = await new InstagramProvider(config, fetcher).profile(
        event.sender_id,
      );
      await db.query(
        "UPDATE finfolk.messaging_accounts SET checks=checks || '{\"followLookup\":true}'::jsonb WHERE id='instagram'",
      );
      if (!identity.follows) {
        await blockWithFollowReply(db, env, event, identity);
        await sendOutboxForEvent(id, env, db, { fetcher });
        return;
      }
    }
    await db.transaction(async (q) => {
      await q(
        "SELECT id FROM finfolk.messaging_accounts WHERE id='instagram' FOR SHARE",
      );
      const locked = (
        await q(
          "SELECT * FROM finfolk.instagram_dm_events WHERE id=$1 AND lease=$2 AND processing_state='processing' FOR UPDATE",
          [id, lease],
        )
      )[0];
      if (!locked) return;
      const current = await messagingConfig(q, env);
      if (!canRun(current, event))
        return markBlocked(q, event, "rollout_restricted");
      if (expired(event)) return markBlocked(q, event, "message_expired");
      if (event.command === "claim")
        await q(
          "UPDATE finfolk.instagram_claims SET state='checking',sender_id=coalesce(sender_id,$2),updated_at=now() WHERE code_hash=$1 AND provider_scope=$3 AND state IN ('waiting','failed','follow_required') AND (sender_id IS NULL OR sender_id=$2)",
          [event.challenge_hash, event.sender_id, event.provider_scope],
        );
      const effective = {
        ...runtimeEnv(current, env),
        MESSAGING_ENABLED_COMMANDS: current.enabled_commands,
      };
      const reply = await commandResult(
        q,
        { ...event, sender_id: event.sender_id },
        effective,
        identity,
      );
      if (reply) {
        await q(
          `INSERT INTO finfolk.messaging_outbox(event_id,body,correlation_id,deadline)
    VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING`,
          [
            id,
            reply.slice(0, 2000),
            event.correlation_id,
            new Date(Date.parse(event.message_at) + 86400000),
          ],
        );
      }
      await q(
        "UPDATE finfolk.instagram_dm_events SET processing_state='completed',status='done',follow_checked_at=CASE WHEN $3::boolean THEN now() ELSE NULL END,sender_handle=$2,error='',updated_at=now() WHERE id=$1",
        [id, identity?.handle || null, !!identity],
      );
      await q(
        "UPDATE finfolk.messaging_accounts SET last_command_at=now() WHERE id='instagram'",
      );
    });
    log("completed", event);
  } catch (error) {
    if (error.status && error.status < 500 && !error.retryable) {
      // Domain validation errors become an explanatory reply only for the follower
      // already checked above. Provider/follow failures never reach this branch.
      if (
        !String(error.code || "").startsWith("provider_") &&
        !["token_missing", "token_invalid"].includes(error.code)
      ) {
        await db.transaction(async (q) => {
          await q(
            "SELECT id FROM finfolk.messaging_accounts WHERE id='instagram' FOR SHARE",
          );
          const row = (
            await q(
              "SELECT id FROM finfolk.instagram_dm_events WHERE id=$1 AND lease=$2 AND processing_state='processing' FOR UPDATE",
              [id, lease],
            )
          )[0];
          if (!row) return;
          await q(
            "INSERT INTO finfolk.messaging_outbox(event_id,body,correlation_id,deadline) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [
              id,
              error.message.slice(0, 2000),
              event.correlation_id,
              new Date(Date.parse(event.message_at) + 86400000),
            ],
          );
          await q(
            "UPDATE finfolk.instagram_dm_events SET processing_state='completed',status='done',error=$2 WHERE id=$1",
            [id, error.code || "command_rejected"],
          );
        });
      } else
        await markBlocked(db.query, event, error.code || "provider_rejected");
    } else {
      const code =
        error.code && /^[a-z_]+$/.test(error.code)
          ? error.code
          : "processing_failed";
      if (event.challenge_hash)
        await db.query(
          "UPDATE finfolk.instagram_claims SET state='failed',error='Verification could not finish. Retry or request manual review.',updated_at=now() WHERE code_hash=$1 AND provider_scope=$2 AND state='checking'",
          [event.challenge_hash, event.provider_scope],
        );
      if (code === "provider_rate_limited")
        await db.query(
          "UPDATE finfolk.messaging_accounts SET backoff_until=now()+$1::integer*interval '1 second' WHERE id='instagram'",
          [error.retryAfter || 120],
        );
      if (code === "token_invalid")
        await db.query(
          "UPDATE finfolk.messaging_accounts SET checks=checks || '{\"authorization\":false}'::jsonb WHERE id='instagram'",
        );
      await db.query(
        "UPDATE finfolk.instagram_dm_events SET processing_state='failed',status='error',error=$3,next_attempt_at=now()+$4::integer*interval '1 second',updated_at=now() WHERE id=$1 AND lease=$2 AND processing_state='processing'",
        [id, lease, code, retryDelay(event.attempts)],
      );
      if (event.attempts >= 5 && event.challenge_hash)
        await markBlocked(db.query, event, code);
      log("failed", event, { code });
      return;
    }
  }
  await sendOutboxForEvent(id, env, db, { fetcher });
}
export async function sendOutboxForEvent(
  eventId,
  env,
  db,
  { fetcher = fetch } = {},
) {
  const rows = await db.query(
    "SELECT id FROM finfolk.messaging_outbox WHERE event_id=$1 AND state='pending' AND next_attempt_at<=now()",
    [eventId],
  );
  for (const row of rows) await sendOutbox(row.id, env, db, { fetcher });
}
export async function sendOutbox(id, env, db, { fetcher = fetch } = {}) {
  const lease = randomUUID();
  // Reservation excludes every concurrent sender, even during provider preflight.
  const row = (
    await db.query(
      `UPDATE finfolk.messaging_outbox SET state='sending',lease=$2,attempts=attempts+1,updated_at=now()
 WHERE id=$1 AND state='pending' AND attempts<5 AND next_attempt_at<=now() RETURNING *`,
      [id, lease],
    )
  )[0];
  if (!row) return;
  let beganSend = false;
  const set = async (state, code) =>
    db.query(
      "UPDATE finfolk.messaging_outbox SET state=$3,error_code=$4,updated_at=now() WHERE id=$1 AND lease=$2 AND state='sending'",
      [id, lease, state, code],
    );
  try {
    const event = (
      await db.query("SELECT * FROM finfolk.instagram_dm_events WHERE id=$1", [
        row.event_id,
      ])
    )[0];
    if (!event) return set("cancelled", "event_removed");
    const config = await messagingConfig(db.query, env, { credentials: true });
    // A denied feature may send only this fixed public instruction. Private
    // results and every other blocked event retain the usual follower gate.
    const followGuidance =
      event.processing_state === "blocked" &&
      event.error === "not_following" &&
      requiresFollower(event.command) &&
      row.body === followRequiredReply;
    if (new Date(row.deadline) <= new Date())
      return set("expired", "reply_window_expired");
    if (
      !canRun(config, event) ||
      (event.processing_state !== "completed" && !followGuidance)
    )
      return set("cancelled", "rollout_changed");
    if (event.owner_id && requiresFollower(event.command) && !followGuidance) {
      const member = (
        await db.query("SELECT deleted FROM finfolk.members WHERE user_id=$1", [
          event.owner_id,
        ])
      )[0];
      if (!member || member.deleted)
        return set("cancelled", "member_unavailable");
    }
    if (config.backoff_until && new Date(config.backoff_until) > new Date()) {
      await db.query(
        "UPDATE finfolk.messaging_outbox SET state='pending',attempts=attempts-1,error_code='provider_backoff',next_attempt_at=$3 WHERE id=$1 AND lease=$2",
        [id, lease, config.backoff_until],
      );
      return;
    }
    const provider = new InstagramProvider(config, fetcher);
    if (
      !config.checks?.authorization ||
      !config.checks?.subscription ||
      (config.token_expires_at &&
        new Date(config.token_expires_at) <= new Date())
    )
      return set("failed", "authorization_unavailable");
    if (requiresFollower(event.command) && !followGuidance) {
      const identity = await provider.profile(event.sender_id);
      if (!identity.follows) return set("cancelled", "not_following");
    }
    // Recheck generation and cancellation after network preflight.
    const current = await messagingConfig(db.query, env);
    const active = (
      await db.query(
        "SELECT 1 FROM finfolk.messaging_outbox o JOIN finfolk.instagram_dm_events e ON e.id=o.event_id WHERE o.id=$1 AND o.lease=$2 AND o.state='sending' AND (e.processing_state='completed' OR ($3::boolean AND e.processing_state='blocked' AND e.error='not_following'))",
        [id, lease, followGuidance],
      )
    ).length;
    if (!active) return;
    if (!canRun(current, event)) return set("cancelled", "rollout_changed");
    if (new Date(row.deadline) <= new Date())
      return set("expired", "reply_window_expired");
    beganSend = true;
    const messageId = await provider.sendText(event.sender_id, row.body);
    await db.query(
      "UPDATE finfolk.messaging_outbox SET state='provider_accepted',provider_message_id=$3,error_code=null,updated_at=now() WHERE id=$1 AND lease=$2 AND state='sending'",
      [id, lease, messageId],
    );
    await db.query(
      "UPDATE finfolk.messaging_accounts SET last_reply_at=now(),checks=checks || '{\"providerDelivery\":true}'::jsonb WHERE id='instagram'",
    );
    log("provider_accepted", event);
  } catch (error) {
    const code =
      error.code && /^[a-z_]+$/.test(error.code)
        ? error.code
        : "provider_failed";
    if (code === "token_invalid")
      await db.query(
        "UPDATE finfolk.messaging_accounts SET checks=checks || '{\"authorization\":false}'::jsonb WHERE id='instagram'",
      );
    if (code === "provider_rate_limited")
      await db.query(
        "UPDATE finfolk.messaging_accounts SET backoff_until=now()+$1::integer*interval '1 second' WHERE id='instagram'",
        [error.retryAfter || 120],
      );
    if (
      ((!beganSend && error.retryable) || error.definiteRejection) &&
      row.attempts < 5
    ) {
      await db.query(
        "UPDATE finfolk.messaging_outbox SET state='pending',error_code=$3,next_attempt_at=now()+$4::integer*interval '1 second',updated_at=now() WHERE id=$1 AND lease=$2 AND state='sending'",
        [id, lease, code, error.retryAfter || retryDelay(row.attempts)],
      );
    } else
      await set(
        beganSend &&
          !error.definiteRejection &&
          code !== "provider_rejected" &&
          code !== "token_invalid"
          ? "uncertain"
          : "failed",
        code,
      );
  }
}
export async function reconcileInstagramDM(env, q) {
  await q(
    "UPDATE finfolk.instagram_dm_events SET processing_state='failed',status='error',error='processing_interrupted',updated_at=now() WHERE processing_state='processing' AND updated_at<now()-interval '2 minutes'",
  );
  await q(
    "UPDATE finfolk.messaging_outbox SET state='uncertain',error_code='delivery_interrupted',updated_at=now() WHERE state='sending' AND updated_at<now()-interval '2 minutes'",
  );
  await q(
    "UPDATE finfolk.messaging_outbox SET state='expired',error_code='reply_window_expired' WHERE state='pending' AND deadline<=now()",
  );
  const config = await messagingConfig(q, env);
  if (config.mode !== "disabled") {
    for (const row of await q(
      "SELECT id FROM finfolk.instagram_dm_events WHERE processing_state IN ('received','queued','failed') AND attempts<5 AND next_attempt_at<=now() AND created_at>now()-interval '24 hours' ORDER BY created_at LIMIT 50",
    ))
      await env.INSTAGRAM_QUEUE.send({ kind: "instagram-dm", id: row.id });
    for (const row of await q(
      "SELECT id FROM finfolk.messaging_outbox WHERE state='pending' AND attempts<5 AND next_attempt_at<=now() AND deadline>now() ORDER BY created_at LIMIT 50",
    ))
      await env.INSTAGRAM_QUEUE.send({
        kind: "instagram-dm-reply",
        id: row.id,
      });
  }
  await q(
    "UPDATE finfolk.messaging_idempotency SET response_ciphertext=null WHERE expires_at<now() AND response_ciphertext IS NOT NULL",
  );
  await q(
    "DELETE FROM finfolk.messaging_idempotency WHERE created_at<now()-interval '30 days'",
  );
  await q(
    "DELETE FROM finfolk.messaging_oauth_states WHERE expires_at<now()-interval '1 day'",
  );
  await q(
    "DELETE FROM finfolk.instagram_dm_events WHERE created_at<now()-interval '30 days'",
  );
  await q(
    "DELETE FROM finfolk.messaging_audit WHERE created_at<now()-interval '30 days'",
  );
  await q(
    "DELETE FROM finfolk.instagram_dm_limits WHERE minute<now()-interval '30 days'",
  );
  await refreshAuthorization(q, env);
}
