import assert from "node:assert/strict";
import {
  oauthSettings,
  oauthFlowKey,
  messagingConfig,
} from "../backend/messaging-config.mjs";
import {
  InstagramProvider,
  exchangeOAuth,
  refreshAuthorization,
} from "../backend/instagram-provider.mjs";
const env = {
  INSTAGRAM_MESSAGING_PROVIDER: "instagram-unified",
  INSTAGRAM_APP_ID: "111",
  INSTAGRAM_APP_SECRET: "meta-secret",
  INSTAGRAM_MESSAGING_LOGIN_CONFIG_ID: "222",
  INSTAGRAM_MESSAGING_GRAPH_VERSION: "v26.0",
};
const settings = oauthSettings(env);
assert.equal(settings.appId, "111");
assert.equal(settings.clientSecret, "meta-secret");
assert.equal(settings.graphHost, "https://graph.facebook.com");
assert.notEqual(
  oauthFlowKey(env),
  oauthFlowKey({ ...env, INSTAGRAM_MESSAGING_LOGIN_CONFIG_ID: "333" }),
);
assert.notEqual(
  oauthFlowKey(env),
  oauthFlowKey({ ...env, INSTAGRAM_MESSAGING_PROVIDER: "instagram-login" }),
);
assert.throws(
  () => oauthSettings({ ...env, INSTAGRAM_MESSAGING_PROVIDER: "unknown" }),
  /Unsupported/,
);
const calls = [];
let ambiguous = false,
  wrongType = false;
const fetcher = async (input, options = {}) => {
  const u = new URL(input);
  calls.push({ u, options });
  assert.equal(u.hostname, "graph.facebook.com");
  const data = u.pathname.endsWith("/oauth/access_token")
    ? { access_token: "business-token", expires_in: 0 }
    : u.pathname.endsWith("/me/assigned_instagram_accounts")
      ? {
          data: [
            { id: "444", username: "finfolk.com.au" },
            ...(ambiguous ? [{ id: "555", username: "other" }] : []),
          ],
        }
      : u.searchParams.get("fields") === "client_business_id"
        ? wrongType
          ? { id: "page-id" }
          : { id: "system-user", client_business_id: "666" }
        : { id: "444", username: "finfolk.com.au" };
  return { ok: true, json: async () => data };
};
const token = await exchangeOAuth("code", env, fetcher);
assert.equal(token.expiresAt, null);
assert.equal(token.tokenKind, "business-integration-system-user");
assert.equal(calls[0].u.searchParams.get("client_secret"), "meta-secret");
const c = {
  ...settings,
  token: token.token,
  graphVersion: "v26.0",
  accountId: "444",
};
const p = new InstagramProvider(c, fetcher);
assert.deepEqual(await p.authorizedAccount(), {
  id: "444",
  username: "finfolk.com.au",
  businessId: "666",
});
await p.validate();
assert.ok(calls.some((x) => x.u.pathname === "/v26.0/444"));
assert.ok(!calls.some((x) => x.u.hostname === "graph.instagram.com"));
ambiguous = true;
await assert.rejects(() => p.authorizedAccount(), /Share only/);
ambiguous = false;
wrongType = true;
await assert.rejects(() => p.authorizedAccount(), /system-user/);
wrongType = false;
const config = await messagingConfig(
  async () => [
    {
      account_id: "444",
      mode: "disabled",
      provider_scope: "instagram-login:111:444",
      checks: { authorization: true, subscription: true },
    },
  ],
  env,
);
assert.equal(config.scope, "instagram-unified:111:444");
assert.equal(config.checks.authorization, false);
let refreshCalls = 0;
await refreshAuthorization(
  async () => [
    {
      account_id: "444",
      mode: "disabled",
      provider_scope: config.scope,
      checks: {},
      token_expires_at: "2000-01-01",
    },
  ],
  env,
  async () => {
    refreshCalls++;
    throw Error("Wrong refresh host");
  },
);
assert.equal(refreshCalls, 0);
console.log(
  "Unified Login checks passed: Meta credentials/config binding, Facebook Graph host, business identity, assigned brand, least-privilege assets, separate scopes and no Instagram-user token refresh.",
);
