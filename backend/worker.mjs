import { createAPI, managedVerifier } from './api.mjs';
import { database } from './db.mjs';
const verifiers = new Map();
export default {
  async fetch(request, env, ctx) {
    if (!env.HYPERDRIVE || !env.NEON_AUTH_BASE_URL || !env.NEON_AUTH_JWKS_URL)
      return Response.json(
        { error: 'Account service is not configured.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    // Workers cannot reuse a connection across request contexts. Hyperdrive pools the origin connections.
    const db = database(env.HYPERDRIVE.connectionString);
    let verify = verifiers.get(env.NEON_AUTH_BASE_URL);
    if (!verify) {
      verify = managedVerifier(env);
      verifiers.set(env.NEON_AUTH_BASE_URL, verify);
    }
    try {
      return await createAPI({ db, verify }).fetch(request, env, ctx);
    } finally {
      ctx.waitUntil(db.pool.end());
    }
  },
};
