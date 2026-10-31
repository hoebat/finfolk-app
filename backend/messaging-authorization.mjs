import { InstagramProvider } from "./instagram-provider.mjs";
import {
  messagingConfig,
  messagingError,
  seal,
  oauthFlowKey,
} from "./messaging-config.mjs";
const fail = (code, message, status) => {
  throw messagingError(code, message, status);
};

// Keep an approved initial grant disabled until the assigned brand and subscription
// are verified. A failed reconnect never replaces an already verified credential.
export async function stageMessagingAuthorization(
  db,
  env,
  token,
  actor,
  requestId,
) {
  return db.transaction(async (q) => {
    await q(
      "SELECT id FROM finfolk.messaging_accounts WHERE id='instagram' FOR UPDATE",
    );
    const config = await messagingConfig(q, env);
    if (config.credential_ciphertext && !config.checks?.pendingVerification)
      return config.credential_ciphertext;
    const payload = {
      accessToken: token.token,
      issuedAt: new Date().toISOString(),
      provider: config.provider,
      tokenKind: token.tokenKind || "instagram-user",
      expiresAt: token.expiresAt,
      flowKey: oauthFlowKey(env),
      authorizedBy: actor,
    };
    const ciphertext = seal(payload, env, config.scope);
    await q(
      "UPDATE finfolk.messaging_accounts SET account_id=$1,username=null,credential_ciphertext=$2,token_expires_at=$3,mode='disabled',generation=generation+1,checks=$4::jsonb,provider_scope=$5,updated_at=now() WHERE id='instagram'",
      [
        config.accountId,
        ciphertext,
        token.expiresAt,
        JSON.stringify({
          pendingVerification: true,
          authorization: false,
          subscription: false,
          followLookup: false,
          liveDelivery: false,
        }),
        config.scope,
      ],
    );
    await q(
      "UPDATE finfolk.messaging_outbox SET state='cancelled',error_code='authorization_pending' WHERE state='pending'",
    );
    await q(
      "INSERT INTO finfolk.messaging_audit(actor,event,correlation_id) VALUES($1,'instagram_authorization_pending',$2)",
      [actor, requestId],
    );
    return ciphertext;
  });
}

// All provider requests run outside the final database transaction. This is shared
// by the OAuth callback and the privileged operator verification script.
export async function completeMessagingAuthorization(
  db,
  env,
  token,
  actor,
  requestId,
  { fetcher = fetch, expectedCredential } = {},
) {
  const config = await messagingConfig(db.query, env);
  const provider = new InstagramProvider(
    { ...config, token: token.token },
    fetcher,
  );
  const account = await provider.authorizedAccount();
  if (
    !/^\d{1,40}$/.test(String(account.id)) ||
    account.username?.toLowerCase() !== "finfolk.com.au" ||
    (env.INSTAGRAM_MESSAGING_ACCOUNT_ID &&
      String(account.id) !== env.INSTAGRAM_MESSAGING_ACCOUNT_ID)
  )
    fail("wrong_brand_account", "Authorize @finfolk.com.au only.", 409);
  provider.config.accountId = String(account.id);
  await provider.subscribe();
  if (!(await provider.subscriptions()))
    fail(
      "subscription_missing",
      "The Instagram account subscription was not confirmed.",
      503,
    );
  await db.transaction(async (q) => {
    const current = (
      await q(
        "SELECT credential_ciphertext FROM finfolk.messaging_accounts WHERE id='instagram' FOR UPDATE",
      )
    )[0];
    const active = (
      await q(
        'SELECT 1 FROM neon_auth."user" u JOIN finfolk.members m ON m.user_id=u.id::text WHERE m.user_id=$1 AND u."emailVerified" AND NOT coalesce(u.banned,false) AND NOT m.deleted FOR SHARE OF m',
        [actor],
      )
    ).length;
    if (!active)
      throw messagingError(
        "admin_required",
        "The authorizing administrator is no longer active and verified.",
        403,
      );
    if (current.credential_ciphertext !== expectedCredential)
      throw messagingError(
        "authorization_replaced",
        "A newer authorization replaced this request. Retry the current connection.",
        409,
      );
    await q(
      "UPDATE finfolk.messaging_accounts SET account_id=$1,username=$2,credential_ciphertext=$3,token_expires_at=$4,mode='disabled',generation=generation+1,checks=$5::jsonb,provider_scope=$6,updated_at=now() WHERE id='instagram'",
      [
        String(account.id),
        account.username,
        seal(
          {
            accessToken: token.token,
            issuedAt: new Date().toISOString(),
            provider: config.provider,
            tokenKind: token.tokenKind || "instagram-user",
            businessId: account.businessId || null,
            configId: config.loginConfigId || null,
          },
          env,
          config.provider + ":" + config.appId + ":" + account.id,
        ),
        token.expiresAt,
        JSON.stringify({
          authorization: true,
          subscription: true,
          followLookup: false,
          liveDelivery: false,
        }),
        config.provider + ":" + config.appId + ":" + account.id,
      ],
    );
    await q(
      "UPDATE finfolk.messaging_outbox SET state='cancelled',error_code='authorization_changed' WHERE state='pending'",
    );
    await q(
      "INSERT INTO finfolk.messaging_audit(actor,event,correlation_id) VALUES($1,$2,$3)",
      [actor, "instagram_authorized", requestId],
    );
  });

  return {
    username: account.username,
    accountId: String(account.id),
    authorization: true,
    subscription: true,
  };
}
