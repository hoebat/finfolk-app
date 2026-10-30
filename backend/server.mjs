import { serve } from '@hono/node-server';
import { createAPI, managedVerifier } from './api.mjs';
import { database } from './db.mjs';
const db = database(process.env.DATABASE_URL),
  app = createAPI({ db, verify: managedVerifier(process.env) });
serve(
  {
    fetch: (request) => app.fetch(request, process.env),
    port: Number(process.env.PORT || 8787),
    hostname: '127.0.0.1',
  },
  (info) =>
    console.log(`FinFolk Neon API listening on http://127.0.0.1:${info.port}`),
);
