import { messagingConfig } from './messaging-config.mjs';
import { InstagramProvider } from './instagram-provider.mjs';

export const processingTimeoutReply = 'That took longer than expected. Please try sending your message again.';

// Ephemeral UI feedback is best effort. It never creates a message/outbox item,
// retries an uncertain send, or blocks delivery when the action is unsupported.
export function instagramFeedback(env, db, fetcher, eligible) {
  let active = null;
  let typedAt = 0;
  const signal = async action => {
    if (!active || env.INSTAGRAM_DM_FEEDBACK_ENABLED !== 'true') return;
    try {
      const { event } = active;
      const config = await messagingConfig(db.query, env, { credentials: true });
      if (!eligible(config, event) || !config.token || !config.checks?.authorization || !config.checks?.subscription ||
          (config.token_expires_at && new Date(config.token_expires_at) <= new Date()) ||
          (config.backoff_until && new Date(config.backoff_until) > new Date())) return;
      const current = (await db.query('SELECT 1 FROM finfolk.instagram_dm_events WHERE id=$1 AND lease=$2 AND provider_scope=$3 AND generation=$4',
        [event.id, event.lease, config.scope, config.generation])).length;
      if (!current) return;
      await new InstagramProvider(config, fetcher).senderAction(event.sender_id, action);
      if (action === 'typing_on') typedAt = Date.now();
    } catch (error) {
      console.log(JSON.stringify({ service: 'instagram-messaging', stage: 'sender_action_unavailable', eventId: active.event.event_id,
        action, code: /^[a-z_]+$/.test(error.code || '') ? error.code : 'sender_action_failed' }));
    }
  };
  return {
    async start(event) {
      active = { event };
      // The persisted attempt counter prevents duplicate receipts/retries from
      // repeatedly marking the same message as seen.
      if (event.attempts === 1) await signal('mark_seen');
      await signal('typing_on');
    },
    async responding(event) {
      active = { event };
      if (Date.now()-typedAt>=4000) await signal('typing_on');
    },
    async stop() { await signal('typing_off'); },
  };
}
