import { connectEnabled, prepareConnect, redeemConnect } from './instagram-connect.mjs';
import {
  stageMessagingAuthorization,
  completeMessagingAuthorization,
} from "./messaging-authorization.mjs";
import { authorizationDiagnostics } from "./messaging-diagnostics.mjs";
import { readLimited } from "./messaging-http.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import { preferences } from "./community-core.mjs";
import { instagramAction, isInstagramAdmin } from "./instagram-actions.mjs";
import {
  messagingConfig,
  runtimeEnv,
  readiness,
  commands,
  messagingError,
  digest,
  seal,
  idempotent,
  encryptionKey,
  oauthSettings,
  oauthFlowKey,
  hasPersonalCommands,
} from "./messaging-config.mjs";
import { exchangeOAuth } from "./instagram-provider.mjs";
const fail = (code, message, status = 400) => {
  throw messagingError(code, message, status);
};
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function messagingProblem(error, requestId) {
  return {
    error: {
      code:
        typeof error.code === "string" && /^[a-z_]+$/.test(error.code)
          ? error.code
          : error.status
            ? "request_rejected"
            : "service_unavailable",
      message: error.status
        ? error.message
        : "Messaging is temporarily unavailable.",
      retryable: error.retryable === true || !error.status,
    },
    requestId,
  };
}
export async function messagingMemberAction({
  action,
  v = {},
  uid,
  env,
  db,
  verified,
}) {
  let config, data;
  if (
    action === "instagramClaimStatus" ||
    action === "instagramClaimReviewInbox"
  ) {
    config = await messagingConfig(db.query, env);
    data = await instagramAction({
      action,
      v,
      uid,
      env: runtimeEnv(config, env),
      q: db.query,
      db,
      verified,
    });
  } else
    data = await db.transaction(async (q) => {
      await q(
        "SELECT id FROM finfolk.messaging_accounts WHERE id='instagram' FOR SHARE",
      );
      config = await messagingConfig(q, env);
      return instagramAction({
        action,
        v,
        uid,
        env: runtimeEnv(config, env),
        q,
        db: { query: q, transaction: (fn) => fn(q) },
        verified,
      });
    });
  const effective = runtimeEnv(config, env);
  if (action === "instagramClaimStatus") {
    const connection = (
      await db.query(
        "SELECT provider_scope,status FROM finfolk.instagram_connections WHERE user_id=$1",
        [uid],
      )
    )[0];
    const claim = (
      await db.query(
        "SELECT claim_id,provider_scope FROM finfolk.instagram_claims WHERE user_id=$1",
        [uid],
      )
    )[0];
    return {
      ...data,
      state:
        data.state === "claimed" && connection?.provider_scope !== config.scope
          ? "ready"
          : data.state,
      verification:
        connection?.status === "connected"
          ? connection.provider_scope === config.scope
            ? "verified"
            : "legacy_verified"
          : "unverified",
      claimId: claim?.claim_id || null,
      capabilities: {
        profileLink: true,
        claims: false,
        connect: connectEnabled(config, env),
        messaging: effective.INSTAGRAM_DM_ENABLED === "true",
      },
    };
  }
  return data;
}
const memberActions = new Set([
  "instagramClaimStatus",
  "instagramClaimStart",
  "instagramClaimRequestReview",
  "instagramClaimReviewInbox",
  "instagramClaimReview",
  "instagramProfileLink",
  "instagramDisconnect",
]);
export const isMessagingMemberAction = (action) => memberActions.has(action);
async function bodyJSON(c) {
  if (c.req.method === "GET" || c.req.method === "DELETE") return {};
  if (!/^application\/json(?:;|$)/i.test(c.req.header("Content-Type") || ""))
    fail("unsupported_media_type", "Use application/json.", 415);
  const bytes = await readLimited(c.req.raw, 8192);
  let raw;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("invalid_json", "Use valid UTF-8 JSON.");
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("invalid_json", "Request body must be valid JSON.");
  }
  if (!value || Array.isArray(value) || typeof value !== "object")
    fail("invalid_body", "Request body must be an object.");
  return value;
}
function only(body, allowed) {
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    fail("invalid_field", "Request contains an unsupported field.");
}
function eventView(row) {
  return {
    id: row.event_id,
    requestId: row.correlation_id,
    command: row.command,
    state: row.processing_state,
    errorCode: row.error || null,
    senderId: row.sender_id,
    handle: row.sender_handle || null,
    receivedAt: row.created_at,
    messageAt: row.message_at,
    followCheckedAt: row.follow_checked_at,
    attempts: row.attempts,
    reply: row.reply_state
      ? {
          state: row.reply_state,
          errorCode: row.reply_error || null,
          providerMessageId: row.provider_message_id || null,
        }
      : null,
  };
}
export function registerMessagingAPI(app, { db, verify, fetcher = fetch }) {
  app.use("/v1/*", async (c, next) => {
    const requestId = c.get("requestId") || randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    c.header("Cache-Control", "private, no-store");
    if (c.req.path === "/v1/integrations/instagram/oauth/callback")
      return next();
    const authorization = c.req.header("Authorization") || "";
    if (!authorization.startsWith("Bearer "))
      fail("unauthenticated", "Sign in first.", 401);
    let claims;
    try {
      claims = await verify(authorization.slice(7));
    } catch {
      fail("unauthenticated", "Your sign-in expired.", 401);
    }
    if (
      typeof claims.sub !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub)
    )
      fail("unauthenticated", "Account unavailable.", 401);
    const identity = (
      await db.query(
        'SELECT id::text,name,"emailVerified" AS verified FROM neon_auth."user" WHERE id::text=$1 AND NOT coalesce(banned,false)',
        [claims.sub],
      )
    )[0];
    if (!identity) fail("unauthenticated", "Account unavailable.", 401);
    const member = (
      await db.query(
        "INSERT INTO finfolk.members(user_id,profile) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET user_id=excluded.user_id RETURNING deleted",
        [
          claims.sub,
          JSON.stringify(preferences({ displayName: identity.name })),
        ],
      )
    )[0];
    if (member?.deleted) fail("account_deleted", "Account unavailable.", 403);
    const rate = (
      await db.query(
        "INSERT INTO finfolk.request_limits(user_id,minute,count) VALUES($1,date_trunc('minute',now()),1) ON CONFLICT(user_id) DO UPDATE SET minute=excluded.minute,count=CASE WHEN request_limits.minute=excluded.minute THEN request_limits.count+1 ELSE 1 END RETURNING count",
        [claims.sub],
      )
    )[0];
    if (rate.count > 120) {
      c.header("Retry-After", "60");
      fail("rate_limited", "Too many requests. Try again in a minute.", 429);
    }
    c.set("messagingIdentity", {
      uid: claims.sub,
      verified: identity.verified,
    });
    if (
      c.req.path.startsWith("/v1/admin/") &&
      (!identity.verified || !isInstagramAdmin(claims.sub, c.env || {}))
    )
      fail("admin_required", "Verified administrator access required.", 403);
    await next();
  });
  const context = (c) => {
    const identity = c.get("messagingIdentity");
    return {
      ...identity,
      env: c.env || {},
      db,
      verified: () => {
        if (!identity.verified)
          fail(
            "email_verification_required",
            "Verify your FinFolk email first.",
            403,
          );
      },
    };
  };
  const respond = (c, data, status = 200) =>
    c.json({ data, requestId: c.get("requestId") }, status);
  const mutation = async (c, operation) => {
    const input = await bodyJSON(c),
      ctx = context(c);
    const result = await idempotent(
      {
        db,
        uid: ctx.uid,
        key: c.req.header("Idempotency-Key"),
        method: c.req.method,
        path: c.req.path,
        body: input,
        env: ctx.env,
      },
      async (tx) => operation(input, { ...ctx, db: tx }),
    );
    if (result.replayed) c.header("Idempotency-Replayed", "true");
    return respond(c, result.data, result.status || 200);
  };
  const act = (ctx, action, v) => messagingMemberAction({ ...ctx, action, v });
  app.get("/v1/me/instagram", async (c) =>
    respond(c, await act(context(c), "instagramClaimStatus")),
  );
  app.post("/v1/me/instagram/connect", async c => {
    const input=await bodyJSON(c), ctx=context(c);
    only(input,["code"]);
    // The Cloudflare runtime supplies this header; never trust X-Forwarded-For.
    const clientIP=c.env?.HYPERDRIVE ? c.req.header("CF-Connecting-IP") : undefined;
    const proof=await prepareConnect({...ctx,code:input.code,clientIP,fetcher});
    const result=await idempotent({db,uid:ctx.uid,key:c.req.header("Idempotency-Key"),method:"POST",path:c.req.path,body:input,env:ctx.env},
      async tx => ({data:await redeemConnect(tx.query,{uid:ctx.uid,env:ctx.env,proof})}));
    if(result.replayed)c.header("Idempotency-Replayed","true");
    return respond(c,result.data);
  });
  app.put("/v1/me/instagram/profile", (c) =>
    mutation(c, async (input, ctx) => {
      only(input, ["handle"]);
      return { data: await act(ctx, "instagramProfileLink", input) };
    }),
  );
  app.delete("/v1/me/instagram", (c) =>
    mutation(c, async (_input, ctx) => ({
      data: await act(ctx, "instagramDisconnect"),
    })),
  );
  app.post("/v1/me/instagram/claims", c => {
    context(c);
    fail("claim_retired", "Send /connect in Instagram, then enter the code on FinFolk.", 410);
  });
  async function ownedClaim(c, ctx) {
    const id = c.req.param("id");
    if (!uuid(id)) fail("invalid_id", "Invalid claim ID.");
    const claim = (
      await ctx.db.query(
        "SELECT claim_id,state,handle,error,expires_at FROM finfolk.instagram_claims WHERE claim_id=$1 AND user_id=$2",
        [id, ctx.uid],
      )
    )[0];
    if (!claim) fail("claim_not_found", "Claim unavailable.", 404);
    return {
      id: claim.claim_id,
      state:
        !["claimed", "cancelled"].includes(claim.state) &&
        new Date(claim.expires_at) <= new Date()
          ? "expired"
          : claim.state,
      handle: claim.handle,
      error: claim.error,
      expiresAt: claim.expires_at,
    };
  }
  app.get("/v1/me/instagram/claims/:id", async (c) =>
    respond(c, await ownedClaim(c, context(c))),
  );
  app.post("/v1/me/instagram/claims/:id/review-request", c => {
    context(c);
    fail("claim_retired", "Legacy claim review has been retired. Use /connect.", 410);
  });
  app.get("/v1/admin/messaging/instagram", async (c) =>
    respond(c, await readiness(db.query, c.env || {})),
  );
  app.get(
    "/v1/admin/messaging/instagram/authorization/diagnostics",
    async (c) =>
      respond(c, await authorizationDiagnostics(db, c.env || {}, fetcher)),
  );
  app.put("/v1/admin/messaging/instagram", (c) =>
    mutation(c, async (input, ctx) => {
      only(input, ["mode", "enabledCommands", "pilotSenderIds", "acceptance"]);
      if (
        !["disabled", "pilot", "live"].includes(input.mode) ||
        !Array.isArray(input.enabledCommands) ||
        input.enabledCommands.length > 6 ||
        input.enabledCommands.some((name) => !Object.hasOwn(commands, name)) ||
        new Set(input.enabledCommands).size !== input.enabledCommands.length
      )
        fail(
          "invalid_rollout",
          "Choose a rollout mode and supported commands.",
        );
      if (
        !Array.isArray(input.pilotSenderIds) ||
        input.pilotSenderIds.length > 20 ||
        input.pilotSenderIds.some(
          (id) => typeof id !== "string" || !/^\d{1,40}$/.test(id),
        )
      )
        fail(
          "invalid_pilot",
          "Pilot sender IDs must come from signed message receipts.",
        );
      await ctx.db.query(
        "SELECT id FROM finfolk.messaging_accounts WHERE id='instagram' FOR UPDATE",
      );
      const config = await messagingConfig(ctx.db.query, ctx.env);
      if (input.acceptance) {
        only(input.acceptance, [
          "pingEventId",
          "helpEventId",
          "visibleRepliesConfirmed",
          "productionAccessConfirmed",
          "nonFollowerTestConfirmed",
          "nonFollowerHelpEventId",
        ]);
        if (
          !uuid(input.acceptance.pingEventId) ||
          !uuid(input.acceptance.helpEventId) ||
          input.acceptance.visibleRepliesConfirmed !== true
        )
          fail(
            "acceptance_required",
            "Confirm visible replies for a real /ping and /help test.",
          );
        const evidence = await ctx.db.query(
          `SELECT e.command,e.sender_id FROM finfolk.instagram_dm_events e JOIN finfolk.messaging_outbox o ON o.event_id=e.id
    WHERE e.event_id IN ($1::uuid,$2::uuid) AND e.provider_scope=$3 AND e.processing_state='completed' AND coalesce(e.error,'')='' AND o.state='provider_accepted' AND e.created_at>now()-interval '24 hours'`,
          [
            input.acceptance.pingEventId,
            input.acceptance.helpEventId,
            config.scope,
          ],
        );
        if (
          evidence.length !== 2 ||
          !evidence.some((e) => e.command === "ping") ||
          !evidence.some((e) => e.command === "help") ||
          evidence[0].sender_id !== evidence[1].sender_id
        )
          fail(
            "acceptance_missing",
            "Signed real-account test evidence is incomplete.",
            409,
          );
        if (input.acceptance.nonFollowerHelpEventId !== undefined) {
          if (
            !uuid(input.acceptance.nonFollowerHelpEventId) ||
            input.acceptance.nonFollowerTestConfirmed !== true
          )
            fail(
              "acceptance_required",
              "Confirm the visible /help reply from an unregistered nonfollower.",
            );
          const publicEvidence = await ctx.db.query(
            `SELECT 1 FROM finfolk.instagram_dm_events e JOIN finfolk.messaging_outbox o ON o.event_id=e.id
             WHERE e.event_id=$1::uuid AND e.provider_scope=$2 AND e.command='help' AND e.owner_id IS NULL
             AND e.sender_id<>$3 AND e.processing_state='completed' AND coalesce(e.error,'')='' AND o.state='provider_accepted'
             AND e.created_at>now()-interval '24 hours'`,
            [
              input.acceptance.nonFollowerHelpEventId,
              config.scope,
              evidence[0].sender_id,
            ],
          );
          if (!publicEvidence.length)
            fail(
              "acceptance_missing",
              "A separate unregistered sender’s successful /help event is required.",
              409,
            );
        }
        await ctx.db.query(
          "UPDATE finfolk.messaging_accounts SET checks=checks || $1::jsonb WHERE id='instagram'",
          [
            JSON.stringify({
              liveDelivery: true,
              productionAccess:
                input.acceptance.productionAccessConfirmed === true,
              ...(input.acceptance.nonFollowerHelpEventId
                ? { publicHelp: true }
                : {
                    nonFollowerTest:
                      input.acceptance.nonFollowerTestConfirmed === true,
                  }),
            }),
          ],
        );
      }
      if (input.mode !== "disabled") {
        const state = await readiness(ctx.db.query, ctx.env, {
          enabledCommands: input.enabledCommands,
        });
        const blocking = state.blockers.filter(
          (code) =>
            !["follow_lookup_unverified", "live_delivery_unverified"].includes(
              code,
            ),
        );
        if (blocking.length)
          fail(
            "setup_incomplete",
            "Complete messaging authorization and account subscription before enabling.",
            409,
          );
        if (input.mode === "pilot" && !input.pilotSenderIds.length)
          fail("pilot_required", "Choose at least one pilot sender.");
        for (const sender of input.pilotSenderIds)
          if (
            !(
              await ctx.db.query(
                "SELECT 1 FROM finfolk.instagram_dm_events WHERE sender_id=$1 AND provider_scope=$2 LIMIT 1",
                [sender, config.scope],
              )
            ).length
          )
            fail(
              "pilot_evidence_missing",
              "Pilot senders must appear in signed webhook receipts.",
              409,
            );
        if (
          input.mode === "live" &&
          (!state.ready ||
            !state.checks.productionAccess ||
            (hasPersonalCommands(input.enabledCommands)
              ? !state.checks.nonFollowerTest
              : !state.checks.publicHelp))
        )
          fail(
            "acceptance_required",
            "Complete live-account, production-access and non-follower acceptance first.",
            409,
          );
      }
      await ctx.db.query(
        "UPDATE finfolk.messaging_accounts SET mode=$1,enabled_commands=$2::jsonb,pilot_sender_ids=$3::jsonb,generation=generation+1,updated_at=now() WHERE id='instagram'",
        [
          input.mode,
          JSON.stringify(input.enabledCommands),
          JSON.stringify([...new Set(input.pilotSenderIds)]),
        ],
      );
      await ctx.db.query(
        "UPDATE finfolk.messaging_outbox SET state='cancelled',error_code='rollout_changed',updated_at=now() WHERE state='pending'",
      );
      await ctx.db.query(
        "UPDATE finfolk.instagram_dm_events SET processing_state='blocked',error='rollout_changed' WHERE processing_state IN ('received','queued','failed')",
      );
      await ctx.db.query(
        "INSERT INTO finfolk.messaging_audit(actor,event,correlation_id) VALUES($1,$2,$3)",
        [ctx.uid, "rollout:" + input.mode, c.get("requestId")],
      );
      return { data: await readiness(ctx.db.query, ctx.env) };
    }),
  );
  app.get("/v1/admin/messaging/events", async (c) => {
    const size = c.req.query("limit") || "25";
    if (!/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 100)
      fail("invalid_limit", "Limit must be between 1 and 100.");
    const cursor = c.req.query("cursor");
    let before = null;
    if (cursor) {
      try {
        const v = JSON.parse(Buffer.from(cursor, "base64url").toString());
        if (!uuid(v.id) || !Number.isFinite(Date.parse(v.at))) throw Error();
        before = v;
      } catch {
        fail("invalid_cursor", "Invalid cursor.");
      }
    }
    const state = c.req.query("state") || null,
      command = c.req.query("command") || null,
      requestId = c.req.query("requestId") || null;
    if (
      state &&
      ![
        "received",
        "queued",
        "processing",
        "completed",
        "ignored",
        "blocked",
        "paused",
        "failed",
      ].includes(state)
    )
      fail("invalid_state", "Invalid event state.");
    if (
      command &&
      ![
        ...Object.keys(commands),
        "unknown",
        "prompt",
        "claim_usage",
        "connect",
        "claim_retired",
        "unsupported",
      ].includes(command)
    )
      fail("invalid_command", "Invalid command filter.");
    if (requestId && !uuid(requestId))
      fail("invalid_request_id", "Invalid request ID.");
    const rows = await db.query(
      `SELECT e.*,o.state AS reply_state,o.error_code AS reply_error,o.provider_message_id FROM finfolk.instagram_dm_events e LEFT JOIN finfolk.messaging_outbox o ON o.event_id=e.id
   WHERE ($1::text IS NULL OR e.processing_state=$1) AND ($2::text IS NULL OR e.command=$2) AND ($3::uuid IS NULL OR e.correlation_id=$3)
   AND ($4::timestamptz IS NULL OR (e.created_at,e.event_id)<($4::timestamptz,$5::uuid)) ORDER BY e.created_at DESC,e.event_id DESC LIMIT $6`,
      [
        state,
        command,
        requestId,
        before?.at || null,
        before?.id || null,
        Number(size) + 1,
      ],
    );
    const more = rows.length > Number(size),
      page = rows.slice(0, Number(size)),
      last = page.at(-1);
    return respond(c, {
      events: page.map(eventView),
      nextCursor: more
        ? Buffer.from(
            JSON.stringify({
              id: last.event_id,
              at: new Date(last.created_at).toISOString(),
            }),
          ).toString("base64url")
        : null,
    });
  });
  app.get("/v1/admin/messaging/events/:id", async (c) => {
    if (!uuid(c.req.param("id"))) fail("invalid_id", "Invalid event ID.");
    const row = (
      await db.query(
        "SELECT e.*,o.state AS reply_state,o.error_code AS reply_error,o.provider_message_id FROM finfolk.instagram_dm_events e LEFT JOIN finfolk.messaging_outbox o ON o.event_id=e.id WHERE e.event_id=$1",
        [c.req.param("id")],
      )
    )[0];
    if (!row) fail("event_not_found", "Event unavailable.", 404);
    return respond(c, eventView(row));
  });
  app.post("/v1/admin/messaging/events/:id/retry", (c) =>
    mutation(c, async (input, ctx) => {
      only(input, []);
      if (!uuid(c.req.param("id"))) fail("invalid_id", "Invalid event ID.");
      await ctx.db.query(
        "SELECT id FROM finfolk.messaging_accounts WHERE id='instagram' FOR SHARE",
      );
      const event = (
        await ctx.db.query(
          "SELECT * FROM finfolk.instagram_dm_events WHERE event_id=$1 FOR UPDATE",
          [c.req.param("id")],
        )
      )[0];
      if (!event) fail("event_not_found", "Event unavailable.", 404);
      const reply = (
        await ctx.db.query(
          "SELECT state,error_code FROM finfolk.messaging_outbox WHERE event_id=$1 FOR UPDATE",
          [event.id],
        )
      )[0];
      const config = await messagingConfig(ctx.db.query, ctx.env);
      if (
        event.generation !== config.generation ||
        config.mode === "disabled" ||
        Date.parse(event.message_at) < Date.now() - 86400000
      )
        fail(
          "retry_not_allowed",
          "This event is paused, cancelled or outside its reply window.",
          409,
        );
      if (reply) {
        if (
          reply.state !== "failed" ||
          ![
            "provider_rejected",
            "provider_rate_limited",
            "token_invalid",
            "authorization_unavailable",
            "follow_lookup_unverified",
          ].includes(reply.error_code)
        )
          fail(
            "retry_not_allowed",
            "Accepted, pending or uncertain sends cannot be retried.",
            409,
          );
        await ctx.db.query(
          "UPDATE finfolk.messaging_outbox SET state='pending',attempts=0,next_attempt_at=now(),updated_at=now() WHERE event_id=$1",
          [event.id],
        );
      } else {
        if (event.processing_state !== "failed")
          fail(
            "retry_not_allowed",
            "Only safely failed events may be retried.",
            409,
          );
        await ctx.db.query(
          "UPDATE finfolk.instagram_dm_events SET processing_state='queued',attempts=0,next_attempt_at=now(),updated_at=now() WHERE id=$1",
          [event.id],
        );
      }
      await ctx.db.query(
        "INSERT INTO finfolk.messaging_audit(actor,event,correlation_id) VALUES($1,$2,$3)",
        [ctx.uid, "retry:" + event.event_id, c.get("requestId")],
      );
      return {
        status: 202,
        data: { id: event.event_id, retryScheduled: true },
      };
    }),
  );
  app.get("/v1/admin/messaging/claim-reviews", async (c) => {
    const claims = await act(context(c), "instagramClaimReviewInbox");
    return respond(c, claims);
  });
  app.post("/v1/admin/messaging/claim-reviews/:id/decision", c => {
    context(c);
    fail("claim_retired", "Legacy claim approval has been retired. Use /connect.", 410);
  });
  app.post("/v1/admin/messaging/instagram/authorization", (c) =>
    mutation(c, async (input, ctx) => {
      only(input, []);
      encryptionKey(ctx.env);
      const settings = oauthSettings(ctx.env);
      if (
        !/^\d{1,40}$/.test(settings.appId) ||
        !settings.clientSecret ||
        (settings.provider === "instagram-unified" &&
          !/^\d{1,40}$/.test(settings.loginConfigId))
      )
        fail(
          "oauth_not_configured",
          "Configure the selected messaging authorization credentials and login configuration first.",
          503,
        );
      const state = randomBytes(32).toString("base64url");
      await ctx.db.query(
        "INSERT INTO finfolk.messaging_oauth_states(state_hash,user_id,expires_at,flow_key) VALUES($1,$2,now()+interval '10 minutes',$3)",
        [digest(state), ctx.uid, oauthFlowKey(ctx.env)],
      );
      const url = new URL(
        settings.provider !== "instagram-login"
          ? "https://www.facebook.com/dialog/oauth"
          : "https://www.instagram.com/oauth/authorize",
      );
      url.searchParams.set("client_id", settings.appId);
      url.searchParams.set("redirect_uri", settings.redirectURI);
      url.searchParams.set("response_type", "code");
      if (settings.provider === "instagram-unified") {
        url.searchParams.set("config_id", settings.loginConfigId);
        url.searchParams.set("override_default_response_type", "true");
        url.searchParams.set("display", "popup");
        url.searchParams.set("prompt", "login");
      } else if (settings.provider === "instagram-facebook") {
        if (!/^\d{1,40}$/.test(settings.pageId))
          fail(
            "oauth_not_configured",
            "Configure the FinFolk Facebook Page first.",
            503,
          );
        url.searchParams.set(
          "scope",
          "instagram_basic,instagram_manage_messages,pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging",
        );
        url.searchParams.set("auth_type", "rerequest");
      } else
        url.searchParams.set(
          "scope",
          "instagram_business_basic,instagram_business_manage_messages",
        );
      url.searchParams.set("state", state);
      return {
        data: {
          authorizationUrl: url.href,
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
      };
    }),
  );
  app.get("/v1/integrations/instagram/oauth/callback", async (c) => {
    const env = c.env || {},
      state = c.req.query("state"),
      code = c.req.query("code");
    if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state))
      fail("invalid_oauth_state", "Authorization state is invalid or expired.");
    const intent = (
      await db.query(
        "UPDATE finfolk.messaging_oauth_states SET consumed_at=now() WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING user_id,flow_key",
        [digest(state)],
      )
    )[0];
    if (
      !intent ||
      intent.flow_key !== oauthFlowKey(env) ||
      !isInstagramAdmin(intent.user_id, env)
    )
      fail("invalid_oauth_state", "Authorization state is invalid or expired.");
    const active = (
      await db.query(
        'SELECT 1 FROM neon_auth."user" u JOIN finfolk.members m ON m.user_id=u.id::text WHERE m.user_id=$1 AND u."emailVerified" AND NOT coalesce(u.banned,false) AND NOT m.deleted',
        [intent.user_id],
      )
    ).length;
    if (!active)
      fail(
        "admin_required",
        "Administrator access is no longer available.",
        403,
      );
    if (c.req.query("error") || !code || code.length > 4096)
      fail("oauth_declined", "Instagram authorization was not granted.");
    const token = await exchangeOAuth(code, env, fetcher);
    const expectedCredential = await stageMessagingAuthorization(
      db,
      env,
      token,
      intent.user_id,
      c.get("requestId"),
    );
    await completeMessagingAuthorization(
      db,
      env,
      token,
      intent.user_id,
      c.get("requestId"),
      { fetcher, expectedCredential },
    );
    c.header("Referrer-Policy", "no-referrer");
    return c.redirect(
      "https://finfolk.com.au/?view=account&tab=settings&messaging=connected",
      303,
    );
  });
  app.all("/v1/*", (c) => {
    fail("route_not_found", "Messaging endpoint unavailable.", 404);
  });
}
