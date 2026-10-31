import assert from "node:assert/strict";
import { messagingHealth } from "../backend/messaging-health.mjs";
let stalled = 0,
  uncertain = 0,
  failed = 0;
const q = async (sql) =>
  sql.includes("messaging_outbox")
    ? [{ pending: 0, uncertain, failed }]
    : [{ stalled }];
const config = {
  mode: "disabled",
  scope: "instagram-login:1:2",
  generation: 1,
  checks: {},
};
let h = await messagingHealth(q, config);
assert.equal(h.status, "paused");
assert.deepEqual(h.issues, []);
config.mode = "pilot";
h = await messagingHealth(q, config);
assert.equal(
  h.status,
  "healthy",
  "No traffic alone must not indicate an outage",
);
stalled = 1;
uncertain = 2;
failed = 1;
config.checks = {
  tokenRefresh: false,
  authorization: true,
  subscription: false,
};
config.token_expires_at = "2000-01-01T00:00:00Z";
h = await messagingHealth(q, config);
assert.equal(h.status, "attention");
assert.equal(h.uncertainReplies, 2);
assert.equal(h.issues.length, 6);
assert.ok(!JSON.stringify(h).includes("sender_id"));
console.log(
  "Messaging health passed: paused/no-traffic semantics, expired authorization, refresh/subscription failures, delayed work and private operational counts.",
);
