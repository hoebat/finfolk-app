import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  instagramFollowerProof,
  proofMatches,
} from "../backend/instagram-eligibility.mjs";
import { seal } from "../backend/messaging-config.mjs";
const env = {
  MESSAGING_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  INSTAGRAM_MESSAGING_APP_ID: "123",
  INSTAGRAM_MESSAGING_ACCOUNT_ID: "456",
};
const scope = "instagram-login:123:456";
const connection = {
  user_id: "owner",
  sender_id: "789",
  provider_scope: scope,
  identity_version: "version-a",
  handle: "diver",
};
const config = {
  account_id: "456",
  mode: "pilot",
  pilot_sender_ids: ["789"],
  enabled_commands: ["ping", "help"],
  checks: { authorization: true, subscription: true, liveDelivery: true },
  provider_scope: scope,
  credential_ciphertext: seal(
    { accessToken: "private-test-token" },
    env,
    scope,
  ),
};
let calls = 0,
  follows = true,
  missingFollow = false,
  fail = false,
  username = "diver";
const q = async (sql) =>
  sql.includes("messaging_accounts") ? [config] : [connection];
const fetcher = async (url, options) => {
  calls++;
  assert.ok(String(url).startsWith("https://graph.instagram.com/"));
  assert.equal(options.headers.Authorization, "Bearer private-test-token");
  if (fail) throw Error("Provider unavailable");
  return {
    ok: true,
    json: async () => ({
      id: "789",
      username,
      ...(missingFollow ? {} : { is_user_follow_business: follows }),
    }),
  };
};
let proof = await instagramFollowerProof("owner", env, q, { fetcher });
assert.ok(proofMatches(proof, connection));
for (const key of [
  "user_id",
  "sender_id",
  "provider_scope",
  "identity_version",
])
  assert.equal(
    proofMatches(proof, { ...connection, [key]: "different" }),
    false,
    key,
  );
assert.equal(
  proofMatches({ ...proof, checkedAt: Date.now() - 31000 }, connection),
  false,
);
follows = false;
assert.equal(
  (await instagramFollowerProof("owner", env, q, { fetcher })).reason,
  "not_following",
);
follows = true;
missingFollow = true;
assert.equal(
  (await instagramFollowerProof("owner", env, q, { fetcher })).eligible,
  false,
);
missingFollow = false;
username = "renamed";
assert.equal(
  (await instagramFollowerProof("owner", env, q, { fetcher })).reason,
  "identity_changed",
);
username = "diver";
fail = true;
assert.equal(
  (await instagramFollowerProof("owner", env, q, { fetcher })).reason,
  "follow_unverified",
);
fail = false;
const before = calls;
connection.provider_scope = "facebook-login:legacy";
assert.equal(
  (await instagramFollowerProof("owner", env, q, { fetcher })).eligible,
  false,
);
assert.equal(calls, before);
connection.provider_scope = scope;
config.mode = "disabled";
assert.equal(
  (await instagramFollowerProof("owner", env, q, { fetcher })).eligible,
  false,
);
config.mode = "pilot";
config.pilot_sender_ids = [];
assert.equal(
  (await instagramFollowerProof("owner", env, q, { fetcher })).eligible,
  false,
);
assert.equal(
  (await instagramFollowerProof("owner", env, async () => [], { fetcher }))
    .eligible,
  false,
);
console.log(
  "Follower proof checks passed: separate provider scopes, exact connection generation, pilot controls, current follower, stale proof and provider failures.",
);
