import { seal } from '../../backend/messaging-config.mjs';

export function contentFixture() {
  const env = {
    MESSAGING_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
    INSTAGRAM_MESSAGING_PROVIDER: 'instagram-facebook', INSTAGRAM_MESSAGING_META_APP_ID: '111',
    INSTAGRAM_MESSAGING_META_APP_SECRET: 'fixture-app-secret', INSTAGRAM_MESSAGING_PAGE_ID: '222',
    INSTAGRAM_MESSAGING_ACCOUNT_ID: '333', INSTAGRAM_ACCOUNT_ID: '333', INSTAGRAM_APP_ID: '111',
    INSTAGRAM_MESSAGING_GRAPH_VERSION: 'v26.0', INSTAGRAM_GRAPH_VERSION: 'v26.0',
  };
  const scope = 'instagram-facebook:111:333';
  const row = {
    account_id: '333', provider_scope: scope, generation: 1, mode: 'pilot',
    checks: { authorization: true, subscription: true, liveDelivery: true },
    credential_ciphertext: seal({ accessToken: 'fixture-page-token' }, env, scope),
  };
  const fixture = {
    env, row, scope, current: true, calls: [],
    metadata: { is_valid: true, app_id: '111', type: 'PAGE', scopes: ['instagram_basic', 'pages_read_engagement', 'instagram_manage_comments'] },
    page: { id: '222', instagram_business_account: { id: '333', username: 'finfolk.com.au' } },
    fields: ['messages', 'comments', 'mentions'],
    // Return null for content requests so callers can supply their own response.
    authorizationResponse(input, options = {}) {
      const url = new URL(input);
      fixture.calls.push({ url, options });
      assertHost(url);
      if (url.pathname.endsWith('/debug_token'))
        return Response.json({ data: fixture.metadata });
      if (url.pathname.endsWith('/me')) return Response.json({ id: env.INSTAGRAM_MESSAGING_PAGE_ID });
      if (url.pathname.endsWith('/' + env.INSTAGRAM_MESSAGING_PAGE_ID)) return Response.json(fixture.page);
      if (url.pathname.endsWith('/subscribed_apps'))
        return Response.json({ data: [{ subscribed_fields: fixture.fields }] });
      return null;
    },
    async q(sql) {
      if (sql.startsWith('SELECT 1 FROM finfolk.messaging_accounts')) return fixture.current ? [{ ok: 1 }] : [];
      if (sql.includes('UPDATE finfolk.messaging_accounts SET backoff_until')) return [];
      if (sql.includes('finfolk.messaging_accounts')) return [row];
      return [];
    },
  };
  return fixture;
}
const assertHost = url => { if (url.hostname !== 'graph.facebook.com') throw Error('Unexpected fixture host'); };
