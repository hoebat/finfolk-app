import { seal, unseal } from '../../backend/messaging-config.mjs';
import { instagramWebhook } from '../../backend/instagram-webhook.mjs';
export default {
  async fetch() {
    const env = { MESSAGING_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') };
    const original = { command: '/claim fixture', unicode: '波 🌊' };
    const encrypted = seal(original, env, 'fixture-member:key');
    let rejectsWrongScope = false;
    try { unseal(encrypted, env, 'other-member:key'); } catch { rejectsWrongScope = true; }
    const challenge = await instagramWebhook(new Request('https://fixture/instagram/webhook?hub.mode=subscribe&hub.verify_token=fixture&hub.challenge=challenge-123'), { INSTAGRAM_VERIFY_TOKEN: 'fixture' }, () => { throw Error('GET verification must not use the database'); });
    return Response.json({ result: unseal(encrypted, env, 'fixture-member:key'), rejectsWrongScope, challenge: await challenge.text() });
  },
};
