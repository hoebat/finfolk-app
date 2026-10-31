import { messagingConfig, messagingError } from "./messaging-config.mjs";
import { InstagramProvider } from "./instagram-provider.mjs";

// Deliberately project provider responses onto safe metadata. Never return raw errors,
// tokens, token subject IDs, secrets, or unrelated business asset IDs.
export async function authorizationDiagnostics(db, env, fetcher = fetch) {
  const config = await messagingConfig(db.query, env, { credentials: true });
  if (!["instagram-unified", "instagram-facebook"].includes(config.provider))
    throw messagingError(
      "provider_not_supported",
      "Token diagnostics require Meta authorization.",
      409,
    );
  if (!config.token || !config.clientSecret)
    throw messagingError(
      "authorization_unavailable",
      "A saved grant and Meta app credentials are required.",
      409,
    );
  const url = new URL(
    "https://graph.facebook.com/" + config.graphVersion + "/debug_token",
  );
  url.searchParams.set("input_token", config.token);
  let response, result;
  try {
    response = await fetcher(url, {
      headers: {
        Authorization: "Bearer " + config.appId + "|" + config.clientSecret,
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    result = await response.json();
  } catch {
    throw messagingError(
      "provider_diagnostics_failed",
      "Meta token inspection could not be completed.",
      503,
      true,
    );
  }
  if (!response.ok || !result.data || typeof result.data.is_valid !== "boolean")
    throw messagingError(
      "provider_diagnostics_failed",
      "Meta did not return valid token inspection metadata.",
      502,
    );
  const d = result.data;
  const expectedAccountId =
    env.INSTAGRAM_MESSAGING_ACCOUNT_ID ||
    env.INSTAGRAM_ACCOUNT_ID ||
    config.accountId;
  const scopeName = (value) =>
    typeof value === "string" && /^[a-z_]{1,80}$/.test(value);
  const grantedScopes = Array.isArray(d.scopes)
    ? d.scopes.filter(scopeName)
    : [];
  const granularScopes = (
    Array.isArray(d.granular_scopes) ? d.granular_scopes : []
  )
    .filter((item) => scopeName(item?.scope))
    .map((item) => ({
      permission: item.scope,
      targetsReported: Array.isArray(item.target_ids),
      targetCount: Array.isArray(item.target_ids)
        ? item.target_ids.length
        : null,
      includesExpectedAccount: Array.isArray(item.target_ids)
        ? item.target_ids.some((id) => String(id) === expectedAccountId)
        : null,
    }));
  const output = {
    appId: /^\d{1,40}$/.test(String(d.app_id)) ? String(d.app_id) : null,
    appMatches: String(d.app_id) === config.appId,
    tokenType: /^[A-Z_]{1,40}$/.test(d.type || "") ? d.type : null,
    valid: d.is_valid,
    expectedAccountId,
    storedAccountId: config.accountId,
    grantedScopes,
    granularScopes,
    expiresAt:
      Number.isSafeInteger(d.expires_at) &&
      d.expires_at > 0 &&
      d.expires_at <= 8640000000000
        ? new Date(d.expires_at * 1000).toISOString()
        : null,
    assignedAccounts: null,
    provider: config.provider,
  };
  if (config.provider === "instagram-facebook") {
    output.pageBinding = { pageId: config.pageId, expectedAccountFound: false };
    if (output.valid && output.appMatches) {
      try {
        const account = await new InstagramProvider(
          config,
          fetcher,
        ).authorizedAccount();
        output.pageBinding.expectedAccountFound =
          String(account.id) === expectedAccountId;
      } catch {
        output.pageBinding.errorCode = "page_binding_failed";
      }
    }
    return output;
  }
  if (output.valid && output.appMatches) {
    try {
      const data = await new InstagramProvider(config, fetcher).request(
        "/me/assigned_instagram_accounts?fields=id,username&limit=100",
      );
      output.assignedAccounts = {
        count: Array.isArray(data.data) ? data.data.length : 0,
        hasNext: !!data.paging?.next,
        expectedAccountFound:
          Array.isArray(data.data) &&
          data.data.some(
            (a) =>
              String(a.id) === expectedAccountId &&
              a.username?.toLowerCase() === "finfolk.com.au",
          ),
      };
    } catch {
      output.assignedAccounts = { errorCode: "account_lookup_failed" };
    }
  }
  return output;
}
