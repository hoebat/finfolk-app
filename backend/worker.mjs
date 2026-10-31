import { sendOutbox } from './messaging-engine.mjs';
import { sendCommandReply } from './instagram-commands.mjs';
import { processInstagramDM, reconcileInstagramDM } from './instagram-dm.mjs';
import {
  scheduleInstagramDiscovery,
  collectInstagramSource,
} from "./instagram-collector.mjs";
import {
  processInstagramEvent,
  reconcileInstagram,
} from "./instagram-webhook.mjs";
import { createAPI, managedVerifier } from "./api.mjs";
import { database } from "./db.mjs";
const verifiers = new Map();
export default {
  async queue(batch, env) {
    const db = database(env.HYPERDRIVE.connectionString);
    try {
      for (const message of batch.messages) {
        try {
          if (message.body.kind === "instagram-dm-reply")
            await sendOutbox(String(message.body.id),env,db);
          else if (message.body.kind === "instagram-comment-reply")
            await sendCommandReply(String(message.body.id), env, db);
          else if (message.body.kind === "instagram-dm")
            await processInstagramDM(String(message.body.id), env, db);
          else if (message.body.kind === "discovery-source")
            await collectInstagramSource(message.body.key, env, db.query);
          else
            await processInstagramEvent(String(message.body.id), env, db.query, db);
          message.ack();
        } catch {
          message.retry({ delaySeconds: 300 });
        }
      }
    } finally {
      await db.pool.end();
    }
  },
  async scheduled(event, env) {
    const db = database(env.HYPERDRIVE.connectionString);
    try {
      if(event.cron==='* * * * *')await reconcileInstagramDM(env,db.query);
      else {await reconcileInstagram(env,db.query);await scheduleInstagramDiscovery(env,db.query);}
    } finally {
      await db.pool.end();
    }
  },
  async fetch(request, env, ctx) {
    if(new URL(request.url).pathname==='/instagram/webhook' && request.method==='GET'){
      const {instagramWebhook}=await import('./instagram-webhook.mjs');return instagramWebhook(request,env,()=>{});
    }
    if (!env.HYPERDRIVE || !env.NEON_AUTH_BASE_URL || !env.NEON_AUTH_JWKS_URL)
      return Response.json(
        { error: "Account service is not configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
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
