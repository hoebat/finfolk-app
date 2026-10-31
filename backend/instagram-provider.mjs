import {
  messagingError,
  seal,
  unseal,
  messagingConfig,
  oauthSettings,
} from "./messaging-config.mjs";
export class InstagramProvider {
  constructor(config, fetcher = fetch) {
    this.config = config;
    // Workers requires native fetch to be called without a provider-instance receiver.
    this.fetcher = (input, init) => fetcher(input, init);
  }
  async request(
    path,
    {
      method = "GET",
      body,
      token = this.config.token,
      host = this.config.graphHost ||
        (["instagram-unified", "instagram-facebook"].includes(
          this.config.provider,
        )
          ? "https://graph.facebook.com"
          : "https://graph.instagram.com"),
      versioned = true,
    } = {},
  ) {
    if (!token)
      throw messagingError(
        "token_missing",
        "Instagram authorization is required.",
        503,
      );
    const url = new URL(
      (versioned ? "/" + this.config.graphVersion : "") + path,
      host,
    );
    let response;
    try {
      response = await this.fetcher(url, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw messagingError(
        "provider_transport_uncertain",
        "Instagram did not confirm the request.",
        503,
        true,
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw messagingError(
        "provider_response_uncertain",
        "Instagram returned an unreadable response.",
        503,
      );
    }
    if (!response.ok || data.error) {
      const providerCode = Number(data.error?.code);
      if (response.status === 401 || providerCode === 190)
        throw messagingError(
          "token_invalid",
          "Reconnect the FinFolk Instagram account.",
          503,
        );
      if (response.status === 429 || [4, 17, 32, 613].includes(providerCode)) {
        const error = messagingError(
          "provider_rate_limited",
          "Instagram temporarily limited requests.",
          429,
          true,
        );
        error.definiteRejection = true;
        const retry = Number(response.headers?.get("retry-after"));
        error.retryAfter =
          Number.isFinite(retry) && retry > 0 ? Math.min(retry, 3600) : 120;
        throw error;
      }
      if (response.status >= 500)
        throw messagingError(
          "provider_response_uncertain",
          "Instagram did not confirm acceptance.",
          503,
          true,
        );
      throw messagingError(
        "provider_rejected",
        "Instagram rejected the request. Check permissions and account subscription.",
        503,
      );
    }
    return data;
  }
  async profile(sender) {
    const data = await this.request(
      "/" + sender + "?fields=id,username,is_user_follow_business",
    );
    if (
      String(data.id) !== sender ||
      typeof data.username !== "string" ||
      !/^[a-z0-9._]{1,30}$/i.test(data.username) ||
      typeof data.is_user_follow_business !== "boolean"
    )
      throw messagingError(
        "follow_lookup_unverified",
        "Instagram could not confirm the sender and follow status.",
        503,
        true,
      );
    return {
      handle: data.username.toLowerCase(),
      follows: data.is_user_follow_business,
    };
  }
  async validate() {
    const data =
      this.config.provider === "instagram-facebook"
        ? await this.authorizedAccount()
        : await this.request(
            this.config.provider === "instagram-unified"
              ? "/" + this.config.accountId + "?fields=id,username"
              : "/me?fields=id,username",
          );
    if (
      String(data.id) !== this.config.accountId ||
      data.username?.toLowerCase() !== "finfolk.com.au"
    )
      throw messagingError(
        "wrong_brand_account",
        "Authorization must be for @finfolk.com.au.",
        409,
      );
    return data;
  }
  async validatePageToken() {
    const metadata = await this.request(
      "/debug_token?input_token=" + encodeURIComponent(this.config.token),
      {
        token: this.config.appId + "|" + this.config.clientSecret,
      },
    );
    const d = metadata.data;
    if (
      !d?.is_valid ||
      String(d.app_id) !== this.config.appId ||
      d.type !== "PAGE"
    )
      throw messagingError(
        "wrong_token_type",
        "Reconnect the FinFolk Facebook Page.",
        409,
      );
    const page = await this.request("/me?fields=id");
    if (String(page.id) !== this.config.pageId)
      throw messagingError(
        "wrong_brand_account",
        "Authorize the configured FinFolk Facebook Page only.",
        409,
      );
    return d;
  }
  async authorizedAccount() {
    if (this.config.provider === "instagram-facebook") {
      await this.validatePageToken();
      const page = await this.request(
        "/" +
          this.config.pageId +
          "?fields=id,instagram_business_account{id,username}",
      );
      if (
        String(page.id) !== this.config.pageId ||
        page.instagram_business_account?.username?.toLowerCase() !==
          "finfolk.com.au"
      )
        throw messagingError(
          "wrong_brand_account",
          "The Facebook Page must be linked to @finfolk.com.au.",
          409,
        );
      return page.instagram_business_account;
    }
    if (this.config.provider !== "instagram-unified")
      return this.request("/me?fields=id,username");
    const business = await this.request("/me?fields=client_business_id");
    if (!/^\d{1,40}$/.test(String(business.client_business_id || "")))
      throw messagingError(
        "wrong_token_type",
        "Unified Login requires a business integration system-user token.",
        409,
      );
    const accounts = await this.request(
      "/me/assigned_instagram_accounts?fields=id,username&limit=100",
    );
    if (
      !Array.isArray(accounts.data) ||
      accounts.data.length !== 1 ||
      accounts.paging?.next
    ) {
      const count = Array.isArray(accounts.data) ? accounts.data.length : 0;
      console.info(
        JSON.stringify({
          service: "instagram-authorization",
          stage: "assigned_account_validation",
          accountCount: count,
          hasNext: !!accounts.paging?.next,
        }),
      );
      throw messagingError(
        "wrong_brand_account",
        "Share only @finfolk.com.au with this integration. Meta returned " +
          count +
          " assigned accounts" +
          (accounts.paging?.next ? " and another page." : "."),
        409,
      );
    }
    return {
      ...accounts.data[0],
      businessId: String(business.client_business_id),
    };
  }
  async subscriptions() {
    const data = await this.request(
      "/" + this.config.accountId + "/subscribed_apps",
    );
    if (this.config.provider === "instagram-facebook") {
      await this.validatePageToken();
      const page = await this.request(
        "/" +
          this.config.pageId +
          "/subscribed_apps?fields=id,subscribed_fields",
      );
      const pageSubscribed =
        Array.isArray(page.data) &&
        page.data.some(
          (app) =>
            String(app.id) === this.config.appId &&
            app.subscribed_fields?.includes("messages"),
        );
      // Facebook Page-token responses can omit the app ID and expose only this
      // token's subscription. Bind the token to this app/Page before accepting it.
      return (
        pageSubscribed &&
        Array.isArray(data.data) &&
        data.data.length === 1 &&
        (data.data[0].id === undefined ||
          String(data.data[0].id) === this.config.appId) &&
        data.data[0].subscribed_fields?.includes("messages") === true
      );
    }
    return (
      Array.isArray(data.data) &&
      data.data.some(
        (row) =>
          String(row.id) === (this.config.metaAppId || this.config.appId) &&
          row.subscribed_fields?.includes("messages"),
      )
    );
  }
  async subscribe() {
    if (this.config.provider === "instagram-facebook") {
      await this.validatePageToken();
      await this.request("/" + this.config.pageId + "/subscribed_apps", {
        method: "POST",
        body: { subscribed_fields: ["messages"] },
      });
    }
    return this.request("/" + this.config.accountId + "/subscribed_apps", {
      method: "POST",
      body: { subscribed_fields: ["messages"] },
    });
  }
  async sendText(sender, text) {
    const data = await this.request("/" + this.config.accountId + "/messages", {
      method: "POST",
      body: { recipient: { id: sender }, message: { text } },
    });
    if (typeof data.message_id !== "string" || !data.message_id)
      throw messagingError(
        "provider_response_uncertain",
        "Instagram did not return a message ID.",
        503,
      );
    return data.message_id;
  }
}
export async function exchangeOAuth(code, env, fetcher = fetch) {
  const settings = oauthSettings(env);
  if (settings.provider !== "instagram-login") {
    const url = new URL(
      "https://graph.facebook.com/" +
        (env.INSTAGRAM_MESSAGING_GRAPH_VERSION || "v26.0") +
        "/oauth/access_token",
    );
    for (const [key, value] of Object.entries({
      client_id: settings.appId,
      client_secret: settings.clientSecret,
      code,
      redirect_uri: settings.redirectURI,
    }))
      url.searchParams.set(key, value);
    let response, data;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
      data = await response.json();
    } catch {
      throw messagingError(
        "oauth_exchange_failed",
        "Unified Login authorization could not be confirmed.",
        503,
      );
    }
    if (
      !response.ok ||
      typeof data.access_token !== "string" ||
      !data.access_token
    )
      throw messagingError(
        "oauth_exchange_failed",
        "Unified Login authorization could not be completed.",
        503,
      );
    if (
      data.expires_in !== undefined &&
      (!Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) < 0)
    )
      throw messagingError(
        "oauth_exchange_failed",
        "The authorization expiry could not be verified.",
        503,
      );
    if (settings.provider === "instagram-facebook")
      return facebookPageGrant(data.access_token, env, fetcher);
    return {
      token: data.access_token,
      expiresAt:
        Number(data.expires_in) > 0
          ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
          : null,
      tokenKind: "business-integration-system-user",
    };
  }
  const redirect =
    env.INSTAGRAM_MESSAGING_REDIRECT_URI ||
    "https://api.finfolk.com.au/v1/integrations/instagram/oauth/callback";
  const response = await fetcher(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: env.INSTAGRAM_MESSAGING_APP_ID,
        client_secret: env.INSTAGRAM_MESSAGING_CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: redirect,
        code,
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  let short;
  try {
    short = await response.json();
  } catch {
    throw messagingError(
      "oauth_exchange_failed",
      "Instagram authorization could not be completed.",
      503,
    );
  }
  if (!response.ok || !short.access_token)
    throw messagingError(
      "oauth_exchange_failed",
      "Instagram authorization could not be completed.",
      503,
    );
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", env.INSTAGRAM_MESSAGING_CLIENT_SECRET);
  url.searchParams.set("access_token", short.access_token);
  // Meta's token-exchange contract uses query parameters; URLs are never logged.
  const result = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  let long;
  try {
    long = await result.json();
  } catch {
    throw messagingError(
      "oauth_exchange_failed",
      "Long-lived authorization was not confirmed.",
      503,
    );
  }
  if (
    !result.ok ||
    !long.access_token ||
    !Number.isFinite(long.expires_in) ||
    long.expires_in <= 0
  )
    throw messagingError(
      "oauth_exchange_failed",
      "Long-lived authorization was not confirmed.",
      503,
    );
  return {
    token: long.access_token,
    expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(),
  };
}
export async function refreshAuthorization(q, env, fetcher = fetch) {
  let c;
  try {
    c = await messagingConfig(q, env, { credentials: true });
  } catch {
    return;
  }
  // Unified Login uses the business token lifecycle, never Instagram user-token refresh.
  if (c.provider !== "instagram-login") return;
  if (
    !c.token ||
    !c.token_expires_at ||
    new Date(c.token_expires_at) > new Date(Date.now() + 7 * 86400000)
  )
    return;
  // Provider-issued long-lived tokens can only be refreshed after their minimum age.
  const secret = unseal(c.credential_ciphertext, env, c.scope);
  if (Date.now() - Date.parse(secret.issuedAt) < 86400000) return;
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", c.token);
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (
      !response.ok ||
      !data.access_token ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0
    )
      throw Error();
    await q(
      "UPDATE finfolk.messaging_accounts SET credential_ciphertext=$1,token_expires_at=$2,checks=checks || '{\"tokenRefresh\":true}'::jsonb,updated_at=now() WHERE id='instagram' AND credential_ciphertext=$3",
      [
        seal(
          {
            accessToken: data.access_token,
            issuedAt: new Date().toISOString(),
          },
          env,
          c.scope,
        ),
        new Date(Date.now() + data.expires_in * 1000),
        c.credential_ciphertext,
      ],
    );
  } catch {
    await q(
      "UPDATE finfolk.messaging_accounts SET checks=checks || '{\"tokenRefresh\":false}'::jsonb,updated_at=now() WHERE id='instagram'",
    );
  }
}

// Resolve a configured, verified Page directly. /me/accounts can be empty even
// when Meta allows this exact Page and its linked Instagram account.
export async function facebookPageGrant(userToken, env, fetcher = fetch) {
  const settings = oauthSettings(env);
  if (
    !/^\d{1,40}$/.test(settings.pageId) ||
    !/^\d{1,40}$/.test(env.INSTAGRAM_MESSAGING_ACCOUNT_ID || "")
  )
    throw messagingError(
      "oauth_not_configured",
      "Configure the FinFolk Facebook Page and Instagram account.",
      503,
    );
  const p = new InstagramProvider(
    {
      ...settings,
      token: userToken,
      graphVersion: env.INSTAGRAM_MESSAGING_GRAPH_VERSION || "v26.0",
    },
    fetcher,
  );
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: settings.appId,
    client_secret: settings.clientSecret,
    fb_exchange_token: userToken,
  });
  const long = await p.request("/oauth/access_token?" + params);
  if (!long.access_token)
    throw messagingError(
      "oauth_exchange_failed",
      "Facebook token exchange failed.",
      503,
    );
  const page = await p.request(
    "/" +
      settings.pageId +
      "?fields=id,instagram_business_account{id,username},access_token",
    { token: long.access_token },
  );
  if (
    String(page.id) !== settings.pageId ||
    page.instagram_business_account?.username?.toLowerCase() !==
      "finfolk.com.au" ||
    String(page.instagram_business_account?.id) !==
      env.INSTAGRAM_MESSAGING_ACCOUNT_ID ||
    !page.access_token
  )
    throw messagingError(
      "wrong_brand_account",
      "Authorize the Facebook Page linked to @finfolk.com.au only.",
      409,
    );
  p.config.token = page.access_token;
  const d = await p.validatePageToken();
  const expiries = [d.expires_at, d.data_access_expires_at].filter(
    (x) => Number.isSafeInteger(x) && x > 0 && x <= 8640000000000,
  );
  return {
    token: page.access_token,
    tokenKind: "facebook-page",
    expiresAt: expiries.length
      ? new Date(Math.min(...expiries) * 1000).toISOString()
      : null,
  };
}
