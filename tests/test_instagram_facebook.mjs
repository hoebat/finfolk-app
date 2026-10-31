import assert from "node:assert/strict";
import { oauthSettings, oauthFlowKey } from "../backend/messaging-config.mjs";
import {
  InstagramProvider,
  exchangeOAuth,
  refreshAuthorization,
} from "../backend/instagram-provider.mjs";
const env = {
  INSTAGRAM_MESSAGING_PROVIDER: "instagram-facebook",
  INSTAGRAM_APP_ID: "111",
  INSTAGRAM_APP_SECRET: "fixture-secret",
  INSTAGRAM_MESSAGING_PAGE_ID: "222",
  INSTAGRAM_MESSAGING_ACCOUNT_ID: "333",
};
const settings = oauthSettings(env);
assert.equal(settings.appId, "111");
assert.equal(settings.graphHost, "https://graph.facebook.com");
assert.equal(settings.pageId, "222");
assert.notEqual(
  oauthFlowKey(env),
  oauthFlowKey({ ...env, INSTAGRAM_MESSAGING_PAGE_ID: "999" }),
);
let appId = "111",
  pageId = "222",
  username = "finfolk.com.au",
  type = "PAGE",
  sub = [{ subscribed_fields: ["messages"] }],
  pageSub = [{ id: "111", subscribed_fields: ["messages"] }];
const calls = [];
const fetcher = async (input, opts = {}) => {
  const u = new URL(input);
  calls.push(u);
  assert.equal(u.origin, "https://graph.facebook.com");
  let data;
  if (u.pathname.endsWith("/oauth/access_token"))
    data = {
      access_token: u.searchParams.has("code") ? "user-short" : "user-long",
      expires_in: 5000,
    };
  else if (u.pathname.endsWith("/debug_token")) {
    assert.equal(opts.headers.Authorization, "Bearer 111|fixture-secret");
    data = {
      data: {
        app_id: appId,
        is_valid: true,
        type,
        expires_at: 0,
        data_access_expires_at: 1900000000,
      },
    };
  } else if (u.pathname.endsWith("/me")) data = { id: pageId };
  else if (u.pathname.endsWith("/222"))
    data = {
      id: "222",
      instagram_business_account: { id: "333", username },
      ...(u.searchParams.get("fields").includes("access_token")
        ? { access_token: "page-secret" }
        : {}),
    };
  else if (u.pathname.endsWith("/subscribed_apps"))
    data =
      opts.method === "POST"
        ? { success: true }
        : { data: u.pathname.includes("/222/") ? pageSub : sub };
  else throw Error("Unexpected URL");
  return { ok: true, status: 200, json: async () => data };
};
const grant = await exchangeOAuth("code", env, fetcher);
assert.equal(grant.token, "page-secret");
assert.equal(grant.tokenKind, "facebook-page");
assert.equal(grant.expiresAt, new Date(1900000000000).toISOString());
assert.ok(
  calls.some((u) => u.searchParams.get("grant_type") === "fb_exchange_token"),
);
assert.ok(
  !calls.some(
    (u) =>
      u.pathname.includes("assigned_instagram") ||
      u.pathname.endsWith("/accounts"),
  ),
);
const p = new InstagramProvider(
  { ...settings, graphVersion: "v26.0", accountId: "333", token: grant.token },
  fetcher,
);
assert.deepEqual(await p.authorizedAccount(), {
  id: "333",
  username: "finfolk.com.au",
});
await p.validate();
assert.equal(await p.subscriptions(), true);
appId = "999";
await assert.rejects(() => p.subscriptions(), { code: "wrong_token_type" });
appId = "111";
pageId = "999";
await assert.rejects(() => p.authorizedAccount(), {
  code: "wrong_brand_account",
});
pageId = "222";
username = "wrong";
await assert.rejects(() => p.authorizedAccount(), {
  code: "wrong_brand_account",
});
username = "finfolk.com.au";
type = "USER";
await assert.rejects(() => p.authorizedAccount(), { code: "wrong_token_type" });
type = "PAGE";
sub = [{ id: "999", subscribed_fields: ["messages"] }];
assert.equal(await p.subscriptions(), false);
sub = [
  { subscribed_fields: ["messages"] },
  { subscribed_fields: ["messages"] },
];
assert.equal(await p.subscriptions(), false);
sub = [{ subscribed_fields: ["messages"] }];
pageSub = [];
assert.equal(
  await p.subscriptions(),
  false,
  "An Instagram subscription alone is insufficient",
);
pageSub = [{ id: "999", subscribed_fields: ["messages"] }];
assert.equal(await p.subscriptions(), false);
pageSub = [{ id: "111", subscribed_fields: ["feed"] }];
assert.equal(await p.subscriptions(), false);
pageSub = [{ id: "111", subscribed_fields: ["messages"] }];
await p.subscribe();
assert.ok(calls.some((u) => u.pathname === "/v26.0/222/subscribed_apps"));
assert.ok(calls.some((u) => u.pathname === "/v26.0/333/subscribed_apps"));
for (const [message, code] of [
  ["(#200) To subscribe to the messages field, one of these permissions is needed: pages_messaging", "page_messaging_permission_missing"],
  ["Requires pages_manage_metadata permission to manage the object", "page_webhook_permission_missing"],
]) {
  const rejected = new InstagramProvider(p.config, async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { code: 200, message } }),
  }));
  await assert.rejects(
    () => rejected.request('/222/subscribed_apps', { method: 'POST', body: { subscribed_fields: ['messages'] } }),
    { code, status: 503 },
  );
}
let refreshed = false;
await refreshAuthorization(
  async () => [
    { account_id: "333", checks: {}, token_expires_at: "2000-01-01" },
  ],
  env,
  async () => {
    refreshed = true;
  },
);
assert.equal(refreshed, false);
console.log(
  "Facebook Page provider: configured Page/brand identity, app-bound Page token, long-lived exchange, expiry, subscription readback and rejection boundaries passed.",
);
