import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export const commands = Object.freeze({
  ping: {
    syntax: "/ping",
    description: "Check that FinFolk is responding.",
    claimed: false,
  },
  help: {
    syntax: "/help",
    description: "See available commands.",
    claimed: false,
  },
  claim: {
    syntax: "/claim <CODE>",
    description: "Verify your Instagram account.",
    claimed: false,
  },
  status: {
    syntax: "/status",
    description: "Check your connection.",
    claimed: false,
  },
  checkin: {
    syntax: "/checkin <beach>",
    description: "Record today’s beach visit.",
    claimed: true,
  },
  points: {
    syntax: "/points",
    description: "See your participation and referral points.",
    claimed: true,
  },
});
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const messagingError = (
  code,
  message,
  status = 400,
  retryable = false,
) => Object.assign(Error(message), { code, status, retryable });
export function encryptionKey(env) {
  const key = Buffer.from(env.MESSAGING_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32)
    throw messagingError(
      "encryption_key_missing",
      "Messaging encryption is not configured.",
      503,
    );
  return key;
}
export function seal(value, env, aad) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  cipher.setAAD(Buffer.from(aad));
  return [
    "v1",
    iv.toString("base64url"),
    Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
      cipher.final(),
    ]).toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}
export function unseal(value, env, aad) {
  try {
    const [version, iv, body, tag] = value.split(".");
    if (version !== "v1") throw Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(env),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final(),
      ]).toString(),
    );
  } catch {
    throw messagingError(
      "credential_unavailable",
      "Messaging credentials could not be opened.",
      503,
    );
  }
}
export async function messagingConfig(q, env, { credentials = false } = {}) {
  const account = (
    await q("SELECT * FROM finfolk.messaging_accounts WHERE id='instagram'")
  )[0] || {
    mode: "disabled",
    generation: 0,
    enabled_commands: [],
    pilot_sender_ids: [],
    checks: {},
  };
  const accountId =
    account.account_id ||
    env.INSTAGRAM_MESSAGING_ACCOUNT_ID ||
    env.INSTAGRAM_ACCOUNT_ID ||
    "";
  const appId = env.INSTAGRAM_MESSAGING_APP_ID || "";
  const config = {
    ...account,
    accountId,
    appId,
    metaAppId:
      env.INSTAGRAM_MESSAGING_META_APP_ID || env.INSTAGRAM_APP_ID || appId,
    graphVersion: env.INSTAGRAM_MESSAGING_GRAPH_VERSION || "v26.0",
    scope: "instagram-login:" + appId + ":" + accountId,
  };
  if (account.provider_scope && account.provider_scope !== config.scope)
    config.checks = {
      ...config.checks,
      authorization: false,
      subscription: false,
    };
  if (credentials && account.credential_ciphertext)
    config.token = unseal(
      account.credential_ciphertext,
      env,
      config.scope,
    ).accessToken;
  return config;
}
export function modeAllows(config, sender, command) {
  return (
    config.mode !== "disabled" &&
    (config.mode !== "pilot" || config.pilot_sender_ids.includes(sender)) &&
    config.enabled_commands.includes(command)
  );
}
export function runtimeEnv(config, env) {
  const enabled =
    config.mode !== "disabled" &&
    !!config.credential_ciphertext &&
    config.checks?.authorization === true &&
    config.checks?.subscription === true &&
    config.checks?.followLookup === true &&
    (!config.token_expires_at ||
      new Date(config.token_expires_at) > new Date());
  return {
    ...env,
    INSTAGRAM_DM_ENABLED: enabled ? "true" : "false",
    INSTAGRAM_AUTO_CLAIM_ENABLED:
      enabled && config.enabled_commands.includes("claim") ? "true" : "false",
    INSTAGRAM_ACCOUNT_ID: config.accountId,
    INSTAGRAM_GRAPH_VERSION: config.graphVersion,
    INSTAGRAM_ACCESS_TOKEN: enabled ? "managed-credential" : "",
    MESSAGING_PROVIDER_SCOPE: config.scope,
  };
}
export async function readiness(q, env) {
  const c = await messagingConfig(q, env);
  const blockers = [];
  if (!env.MESSAGING_ENCRYPTION_KEY) blockers.push("encryption_key_missing");
  if (!c.appId || !env.INSTAGRAM_MESSAGING_CLIENT_SECRET)
    blockers.push("oauth_not_configured");
  if (!c.credential_ciphertext) blockers.push("token_missing");
  else
    try {
      unseal(c.credential_ciphertext, env, c.scope);
    } catch {
      blockers.push("credential_unavailable");
    }
  if (c.checks?.tokenRefresh === false) blockers.push("token_refresh_failed");
  if (c.token_expires_at && new Date(c.token_expires_at) <= new Date())
    blockers.push("token_expired");
  for (const [key, code] of [
    ["authorization", "authorization_unverified"],
    ["subscription", "subscription_missing"],
    ["followLookup", "follow_lookup_unverified"],
    ["liveDelivery", "live_delivery_unverified"],
  ])
    if (!c.checks?.[key]) blockers.push(code);
  return {
    mode: c.mode,
    accountId: c.accountId || null,
    username: c.username || null,
    enabledCommands: c.enabled_commands,
    pilotSenderIds: c.pilot_sender_ids,
    ready: blockers.length === 0,
    blockers,
    checks: c.checks,
    lastWebhookAt: c.last_webhook_at,
    lastCommandAt: c.last_command_at,
    lastProviderAcceptedAt: c.last_reply_at,
    tokenExpiresAt: c.token_expires_at,
  };
}
export async function idempotent(
  { db, uid, key, method, path, body, env },
  operation,
) {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(key))
    throw messagingError(
      "idempotency_key_required",
      "Supply an Idempotency-Key of 8–128 letters, numbers, underscores or hyphens.",
    );
  const keyHash = digest(key),
    fingerprint = digest(JSON.stringify([method, path, canonical(body)]));
  return db.transaction(async (q) => {
    await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      uid + ":" + keyHash,
    ]);
    const row = (
      await q(
        "SELECT * FROM finfolk.messaging_idempotency WHERE user_id=$1 AND key_hash=$2",
        [uid, keyHash],
      )
    )[0];
    const aad = uid + ":" + keyHash;
    if (row) {
      if (row.request_hash !== fingerprint)
        throw messagingError(
          "idempotency_conflict",
          "This key was used for a different request.",
          409,
        );
      if (new Date(row.expires_at) <= new Date() || !row.response_ciphertext)
        throw messagingError(
          "idempotency_expired",
          "Use a new idempotency key.",
          409,
        );
      return { ...unseal(row.response_ciphertext, env, aad), replayed: true };
    }
    // Fail before mutation if replay responses cannot be encrypted.
    encryptionKey(env);
    const result = await operation({ query: q, transaction: (fn) => fn(q) });
    await q(
      "INSERT INTO finfolk.messaging_idempotency(user_id,key_hash,request_hash,response_ciphertext,response_status,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '24 hours')",
      [uid, keyHash, fingerprint, seal(result, env, aad), result.status || 200],
    );
    return result;
  });
}
