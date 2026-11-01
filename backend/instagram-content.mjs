import { messagingConfig, messagingError } from './messaging-config.mjs';
import { InstagramProvider } from './instagram-provider.mjs';

// These are conservative requirements for FinFolk's Facebook Page-token path.
// Granted permissions are authorization evidence, not live feature acceptance.
export const instagramContentPermissions = Object.freeze({
  media: ['instagram_basic', 'pages_read_engagement'],
  comments: ['instagram_basic', 'pages_read_engagement', 'instagram_manage_comments'],
  mentions: ['instagram_basic', 'pages_read_engagement', 'instagram_manage_comments'],
});
export function instagramContentCapabilities({ authorized, grantedScopes = [], subscribedFields = [] }) {
  return Object.fromEntries(Object.entries(instagramContentPermissions).map(([name, requiredPermissions]) => {
    const missingPermissions = requiredPermissions.filter(p => !grantedScopes.includes(p));
    const webhook = name === 'media' ? null : name === 'comments' ? 'comments' : 'mentions';
    return [name, {
      authorized: authorized && missingPermissions.length === 0,
      requiredPermissions, missingPermissions,
      webhookSubscribed: webhook ? subscribedFields.includes(webhook) : null,
      liveVerified: false,
    }];
  }));
}
const unavailable = (code, message) => { throw messagingError(code, message, 503); };

// Each operation resolves the current encrypted grant. An explicitly configured
// legacy raw token is never a fallback for a missing/replaced managed grant.
export async function instagramContentClient(env, q, { capability = 'media', fetcher = fetch } = {}) {
  if (!q || !Object.hasOwn(instagramContentPermissions, capability))
    unavailable('content_configuration_required', 'Instagram content configuration is unavailable.');
  const config = await messagingConfig(q, env, { credentials: true });
  if (config.provider !== 'instagram-facebook')
    unavailable('content_provider_unsupported', 'Comments and media collection require the managed FinFolk Facebook Page connection.');
  if (!config.clientSecret || !/^\d{1,40}$/.test(config.appId) || !/^\d{1,40}$/.test(config.pageId))
    unavailable('content_configuration_required', 'Configure the managed Meta app and Facebook Page first.');
  if (!config.token || config.mode === 'disabled' || !config.checks?.authorization || config.checks?.pendingVerification)
    unavailable('content_authorization_required', 'Verify the managed FinFolk Instagram authorization first.');
  if (config.token_expires_at && new Date(config.token_expires_at) <= new Date())
    unavailable('token_expired', 'Reconnect the FinFolk Instagram account.');
  if (config.backoff_until && new Date(config.backoff_until) > new Date()) {
    const error = messagingError('provider_rate_limited', 'Instagram temporarily limited requests.', 429, true);
    error.providerCode = 4;
    error.retryAfter = Math.min(3600, Math.max(1, Math.ceil((new Date(config.backoff_until) - Date.now()) / 1000)));
    throw error;
  }
  if (!/^v\d+\.0$/.test(config.graphVersion) || !/^\d{1,40}$/.test(config.accountId) ||
      (env.INSTAGRAM_ACCOUNT_ID && env.INSTAGRAM_ACCOUNT_ID !== config.accountId) ||
      (env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_ID !== config.appId) ||
      (env.INSTAGRAM_MESSAGING_ACCOUNT_ID && env.INSTAGRAM_MESSAGING_ACCOUNT_ID !== config.accountId))
    unavailable('content_account_mismatch', 'The content and messaging Instagram accounts must match.');

  const provider = new InstagramProvider(config, fetcher);
  let metadata;
  try {
  metadata = await provider.validatePageToken();
    if ((metadata.expires_at > 0 && metadata.expires_at * 1000 <= Date.now()) ||
        (metadata.data_access_expires_at > 0 && metadata.data_access_expires_at * 1000 <= Date.now()))
      unavailable('token_expired', 'Reconnect the FinFolk Instagram account.');
    const scopes = Array.isArray(metadata.scopes) ? metadata.scopes : [];
    const missing = instagramContentPermissions[capability].filter(p => !scopes.includes(p));
    if (missing.length)
      unavailable('content_permission_missing', 'The managed Instagram connection is missing permissions for ' + capability + ': ' + missing.join(', ') + '.');
    const page = await provider.request('/' + config.pageId + '?fields=id,instagram_business_account{id,username}');
    if (String(page.id) !== config.pageId || String(page.instagram_business_account?.id) !== config.accountId ||
        page.instagram_business_account?.username?.toLowerCase() !== 'finfolk.com.au')
      unavailable('content_account_mismatch', 'The Facebook Page must be linked to the configured @finfolk.com.au account.');
  } catch (error) {
    if (error.code === 'provider_rate_limited') {
      error.providerCode = 4;
      await q(`UPDATE finfolk.messaging_accounts SET backoff_until=GREATEST(coalesce(backoff_until,now()),now()+($1::integer*interval '1 second'))
        WHERE id='instagram' AND credential_ciphertext=$2 AND generation=$3`, [error.retryAfter || 120, config.credential_ciphertext, config.generation]);
    }
    throw error;
  }

  const current = async query => (await query(`SELECT 1 FROM finfolk.messaging_accounts WHERE id='instagram'
    AND credential_ciphertext=$1 AND provider_scope=$2 AND generation=$3 AND mode<>'disabled'
    AND checks->>'authorization'='true' AND (token_expires_at IS NULL OR token_expires_at>now())
    AND (backoff_until IS NULL OR backoff_until<=now()) FOR SHARE`,
  [config.credential_ciphertext, config.scope, config.generation])).length === 1;

  const request = async (path, params = {}, { method = 'GET', body } = {}) => {
    if (!/^[A-Za-z0-9_/-]+$/.test(path) || !['GET', 'POST'].includes(method))
      throw messagingError('content_path_invalid', 'Invalid Instagram content request.');
    if (Object.keys(params).some(k => /access_token|input_token|appsecret_proof/i.test(k)))
      throw messagingError('content_parameter_invalid', 'Credentials cannot be passed as content parameters.');
    if (method === 'POST' && (capability === 'media' || !(/^[0-9]{1,40}\/replies$/.test(path) || path === config.accountId + '/mentions')))
      throw messagingError('content_path_invalid', 'Invalid Instagram comment reply request.');
    if (!(await current(q)))
      unavailable('content_authorization_changed', 'Instagram authorization changed. Retry using the current connection.');
    const url = new URL('https://graph.facebook.com/' + config.graphVersion + '/' + path);
    for (const [key, value] of Object.entries(params))
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    let response, data;
    try {
      response = await fetcher(url, {
        method, headers: { Authorization: 'Bearer ' + config.token },
        ...(body && { body }), redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      data = await response.json();
    } catch {
      throw messagingError('content_response_unconfirmed', 'Instagram did not confirm the content request.', 503, method === 'GET');
    }
    if (!response.ok || data?.error) {
      const error = messagingError('content_provider_rejected', 'Instagram content access could not be confirmed.', 503, method === 'GET');
      error.providerCode = Number(data?.error?.code) || 0;
      error.providerSubcode = Number(data?.error?.error_subcode) || 0;
      error.retryAfter = Math.min(3600, Math.max(0, Number(response.headers?.get('retry-after')) || 0));
      error.transient = data?.error?.is_transient === true;
      if ([4, 17, 32, 613].includes(error.providerCode) || response.status === 429) {
        error.retryAfter ||= 120;
        error.providerCode ||= 4;
        await q(`UPDATE finfolk.messaging_accounts SET backoff_until=GREATEST(coalesce(backoff_until,now()),now()+($1::integer*interval '1 second'))
          WHERE id='instagram' AND credential_ciphertext=$2 AND generation=$3`, [error.retryAfter, config.credential_ciphertext, config.generation]);
      }
      throw error;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      unavailable('content_response_invalid', 'Instagram returned an invalid content response.');
    return data;
  };
  return { accountId: config.accountId, appId: config.appId, current, request };
}

export async function instagramGraph(path, env, params = {}, fetcher = fetch, q, capability = 'media') {
  return (await instagramContentClient(env, q, { capability, fetcher })).request(path, params);
}
