import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { instagramService } from "../functions/instagram-service.js";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app"),
  { getFirestore } = require("firebase-admin/firestore");
initializeApp({ projectId: "demo-finfolk" });
const db = getFirestore();
let now = new Date("2026-10-30T00:00:00Z");
const service = instagramService(
  db,
  [
    { id: "bondi", name: "Bondi Beach" },
    { id: "coogee", name: "Coogee Beach" },
  ],
  () => new Date(now),
);
const uid = "ig-service-a",
  other = "ig-service-b";
const request = await service.request(uid, "@Diver.Test", true);
await assert.rejects(service.request(uid, "diver.test", true), /Wait a minute/);
await assert.rejects(
  service.approve("admin", {
    uid,
    code: request.code,
    ownershipChecked: false,
    followChecked: true,
  }),
);
await assert.rejects(
  service.approve("admin", {
    uid,
    code: "wrong",
    ownershipChecked: true,
    followChecked: true,
  }),
  /incorrect/,
);
now = new Date(+now + 31 * 60000);
await assert.rejects(
  service.approve("admin", {
    uid,
    code: request.code,
    ownershipChecked: true,
    followChecked: true,
  }),
  /expired/,
);
const valid = await service.request(uid, "diver.test", true);
assert.equal(
  await service.receiveCode("1234", valid.code, { username: "diver.test" }),
  uid,
);
assert.equal(
  await service.receiveCode("1234", valid.code, { username: "diver.test" }),
  false,
);
await service.approve("admin", {
  uid,
  ownershipChecked: true,
  followChecked: true,
});
const connection = (await db.doc(`instagramConnections/${uid}`).get()).data();
assert.equal(connection.status, "verified");
assert.equal(connection.importsEnabled, true);
const rival = await service.request(other, "diver.test", true);
await assert.rejects(
  service.approve("admin", {
    uid: other,
    code: rival.code,
    ownershipChecked: true,
    followChecked: true,
  }),
  /already linked/,
);
now = new Date(+now + 60000);
const post = {
  id: "99001",
  username: "diver.test",
  caption: "At Bondi Beach",
  permalink: "https://www.instagram.com/p/abc/",
  media_type: "IMAGE",
  timestamp: now.toISOString(),
};
assert.equal(await service.ingest(post), "published");
assert.equal(await service.ingest(post), "published");
assert.equal(
  (await db.doc("instagramPosts/99001").get()).data().beachId,
  "bondi",
);
await assert.rejects(
  service.editPost(other, post.id, "remove"),
  /another diver/,
);
await service.editPost(uid, post.id, "location", "coogee");
await service.ingest(post);
assert.equal(
  (await db.doc("instagramPosts/99001").get()).data().beachId,
  "coogee",
);
await service.control(uid, "pause");
assert.equal(await service.ingest({ ...post, id: "99002" }), "unmatched");
assert.equal((await db.doc("instagramPosts/99001").get()).exists, true);
await service.control(uid, "resume");
assert.equal(
  await service.ingest({ ...post, id: "99003", timestamp: "2020-01-01" }),
  "unmatched",
);
assert.equal(
  await service.ingest({ ...post, id: "99004", username: undefined }),
  "unmatched",
);
await service.editPost(uid, post.id, "remove");
assert.equal(await service.ingest(post), "suppressed");
assert.equal((await db.doc("instagramPosts/99001").get()).exists, false);
// Pending connections must be held rather than throwing on missing importSince.
await service.request("pending-diver", "pending.test", true);
assert.equal(
  await service.ingest({ ...post, id: "99005", username: "pending.test" }),
  "unmatched",
);
await service.control(uid, "disconnect");
assert.equal((await db.doc(`instagramHandles/diver.test`).get()).exists, false);
assert.equal(await service.ingest({ ...post, id: "99006" }), "unmatched");
now = new Date(+now + 60000);
const relink = await service.request(uid, "diver.test", true);
await service.approve("admin", {
  uid,
  code: relink.code,
  ownershipChecked: true,
  followChecked: true,
});
now = new Date(+now + 60000);
assert.equal(
  await service.ingest({ ...post, id: "99007", timestamp: now.toISOString() }),
  "published",
);
await db.doc(`deletingAccounts/${uid}`).set({ startedAt: now });
await service.cleanup(uid);
assert.equal((await db.doc(`instagramConnections/${uid}`).get()).exists, false);
assert.equal((await db.doc("instagramPosts/99007").get()).exists, false);
assert.equal(await service.ingest({ ...post, id: "99007" }), "suppressed");
await assert.rejects(service.request(uid, "diver.test", true), /being deleted/);
console.log(
  "Instagram service checks passed: expiry, replay, unique ownership, import deduplication, pause, reconnect, location, removal suppression and account cleanup.",
);
// Exercise the actual HTTP handler with local-only test secrets; no Meta requests.
process.env.INSTAGRAM_APP_SECRET = "emulator-test-secret";
process.env.INSTAGRAM_VERIFY_TOKEN = "emulator-verify-token";
process.env.INSTAGRAM_ACCOUNT_ID = "12345";
process.env.INSTAGRAM_GRAPH_VERSION = "v25.0";
const { createHmac } = await import("node:crypto");
const { instagramWebhook } = await import("../functions/instagram.js");
await db
  .doc("system/instagram")
  .set({ enabled: true, pilotOnly: true, pilotUids: [] });
async function webhook(body, signature) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const request = {
    method: "POST",
    rawBody,
    body,
    get: () =>
      signature ||
      "sha256=" +
        createHmac("sha256", process.env.INSTAGRAM_APP_SECRET)
          .update(rawBody)
          .digest("hex"),
  };
  const response = {
    code: null,
    sendStatus(code) {
      this.code = code;
      return this;
    },
    status(code) {
      this.code = code;
      return this;
    },
    send() {
      return this;
    },
  };
  await instagramWebhook(request, response);
  return response.code;
}
assert.equal(await webhook({ entry: [] }, "sha256=bad"), 403);
const event = {
  entry: [
    {
      id: "12345",
      changes: [{ field: "mentions", value: { media_id: "88888" } }],
    },
  ],
};
assert.equal(await webhook(event), 200);
assert.equal(await webhook(event), 200);
const queued = await db
  .collection("instagramJobs")
  .where("mediaId", "==", "88888")
  .get();
assert.equal(queued.size, 1);
assert.equal(queued.docs[0].data().status, "pending");
assert.equal(
  await webhook({
    entry: [
      {
        id: "99999",
        changes: [{ field: "mentions", value: { media_id: "99999" } }],
      },
    ],
  }),
  200,
);
assert.equal(
  (await db.collection("instagramJobs").where("mediaId", "==", "99999").get())
    .size,
  0,
);
assert.equal(
  await webhook({
    entry: [
      {
        id: "12345",
        changes: [
          {
            field: "mentions",
            value: { media_id: "77777", comment_id: "222" },
          },
        ],
      },
    ],
  }),
  200,
);
assert.equal(
  (await db.collection("instagramJobs").where("mediaId", "==", "77777").get())
    .size,
  0,
);
console.log(
  "Instagram HTTP checks passed: signature rejection, durable deduplicated jobs, brand filtering and exclusion of comment mentions.",
);
await db.terminate();
