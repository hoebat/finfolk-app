import { getFirestore } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { readFileSync } from "node:fs";
import { instagramService } from "./instagram-service.js";
import { validSignature, hash, handle, fail } from "./instagram-core.js";
const appSecret = defineSecret("INSTAGRAM_APP_SECRET");
const verifyToken = defineSecret("INSTAGRAM_VERIFY_TOKEN");
const accessToken = defineSecret("INSTAGRAM_ACCESS_TOKEN");
const options = {
  region: "australia-southeast1",
  maxInstances: 3,
  timeoutSeconds: 60,
};
const beaches = JSON.parse(
  readFileSync(new URL("./instagram-beaches.json", import.meta.url), "utf8"),
);
const db = () => getFirestore();
const service = () => instagramService(db(), beaches);
const stamp = (value) => (value?.toDate ? value.toDate().toISOString() : value);
const serial = (row) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, stamp(v)]));
async function config() {
  return (await db().doc("system/instagram").get()).data() || {};
}
async function enabled(uid) {
  const c = await config();
  if (
    c.enabled !== true ||
    (uid && c.pilotOnly !== false && !(c.pilotUids || []).includes(uid))
  )
    fail("Instagram importing is being prepared.");
  return c;
}
function identity(r, admin = false) {
  if (!r.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (admin && r.auth.token.instagramAdmin !== true)
    throw new HttpsError("permission-denied", "Administrator access required.");
  if (!admin && r.auth.token.email_verified !== true)
    throw new HttpsError("failed-precondition", "Verify your email first.");
  return r.auth.uid;
}
const callable = (fn) =>
  onCall(options, async (r) => {
    try {
      return await fn(r);
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      const codes = [
        "invalid-argument",
        "permission-denied",
        "resource-exhausted",
        "failed-precondition",
      ];
      throw new HttpsError(
        codes.includes(e.code) ? e.code : "internal",
        codes.includes(e.code)
          ? e.message
          : "Instagram operation failed. Please retry.",
      );
    }
  });
export const requestInstagramVerification = callable(async (r) => {
  const uid = identity(r);
  await enabled(uid);
  return service().request(uid, r.data?.handle, r.data?.consent);
});
export const manageInstagram = callable(async (r) => {
  const uid = identity(r);
  if (r.data?.action === "resume") await enabled(uid);
  await service().control(uid, r.data?.action);
  return { updated: true };
});
export const editInstagramPost = callable(async (r) => {
  const uid = identity(r);
  await service().editPost(uid, r.data?.id, r.data?.action, r.data?.beachId);
  return { updated: true };
});
export const instagramAdminQueue = callable(async (r) => {
  identity(r, true);
  const [connections, media] = await Promise.all([
    db()
      .collection("instagramConnections")
      .where("status", "==", "pending")
      .limit(50)
      .get(),
    db()
      .collection("instagramMedia")
      .where("status", "==", "unmatched")
      .limit(50)
      .get(),
  ]);
  return {
    connections: connections.docs.map((d) => ({
      uid: d.id,
      ...serial(d.data()),
    })),
    media: media.docs.map((d) => ({ id: d.id, ...serial(d.data()) })),
  };
});
export const approveInstagram = callable(async (r) => {
  const adminUid = identity(r, true),
    uid = r.data?.uid;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid || ""))
    fail("Invalid member.", "invalid-argument");
  await enabled(uid);
  await service().approve(adminUid, r.data);
  return { verified: true };
});
export const resolveInstagramMedia = callable(async (r) => {
  identity(r, true);
  const { id, username, authorshipChecked } = r.data || {};
  if (!/^\d{1,40}$/.test(id || "") || authorshipChecked !== true)
    fail("Check the original post and its author first.");
  const media = (await db().doc(`instagramMedia/${id}`).get()).data();
  if (!media || media.status !== "unmatched") fail("Post is unavailable.");
  const name = handle(username);
  if (media.username && media.username !== name)
    fail("The provider identified a different author.");
  const claim = (await db().doc(`instagramHandles/${name}`).get()).data();
  if (!claim) fail("Verify the member first.");
  await enabled(claim.uid);
  return {
    status: await service().ingest({
      ...media,
      username: name,
      permalink: media.url,
      timestamp: media.postedAt.toDate().toISOString(),
      media_type: media.mediaType,
    }),
  };
});
function settings() {
  const id = process.env.INSTAGRAM_ACCOUNT_ID,
    version = process.env.INSTAGRAM_GRAPH_VERSION;
  if (!/^\d{1,40}$/.test(id || "") || !/^v\d+\.0$/.test(version || ""))
    fail("Instagram provider configuration is incomplete.");
  return { id, version };
}
async function graph(path, params = {}) {
  const { version } = settings(),
    url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const token = accessToken.value();
  // Token stays in the Authorization header; provider errors/URLs are never logged.
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw Error("Instagram provider request failed.");
  return data;
}
const fields = "id,caption,media_type,permalink,timestamp,username";
async function fetchMention(id) {
  const { id: account } = settings();
  const result = await graph(account, {
    fields: `mentioned_media.media_id(${id}){${fields}}`,
  });
  if (!result.mentioned_media) throw Error("Mention unavailable.");
  return result.mentioned_media;
}
async function importMedia(media) {
  if (media.username) {
    const claim = (
      await db()
        .doc(`instagramHandles/${handle(media.username)}`)
        .get()
    ).data();
    if (claim) {
      try {
        await enabled(claim.uid);
      } catch {
        return "skipped";
      }
    }
  }
  return service().ingest(media);
}
async function processJob(ref) {
  const job = (await ref.get()).data();
  if (!job || job.status === "complete") return;
  try {
    const result = await importMedia(await fetchMention(job.mediaId));
    await ref.update({ status: "complete", result, updatedAt: new Date() });
  } catch {
    await ref.update({
      status: "pending",
      attempts: (job.attempts || 0) + 1,
      updatedAt: new Date(),
    });
  }
}
export const instagramWebhook = onRequest(
  { ...options, secrets: [appSecret, verifyToken, accessToken] },
  async (req, res) => {
    if (req.method === "GET") {
      if (
        req.query["hub.mode"] === "subscribe" &&
        req.query["hub.verify_token"] === verifyToken.value() &&
        typeof req.query["hub.challenge"] === "string"
      )
        return res.status(200).send(req.query["hub.challenge"]);
      return res.sendStatus(403);
    }
    if (req.method !== "POST") return res.sendStatus(405);
    if (!req.rawBody || req.rawBody.length > 256 * 1024)
      return res.sendStatus(413);
    if (
      !validSignature(
        req.rawBody,
        req.get("x-hub-signature-256"),
        appSecret.value(),
      )
    )
      return res.sendStatus(403);
    try {
      const c = await config();
      if (c.enabled !== true) return res.sendStatus(200);
      const { id } = settings(),
        expected = [id, process.env.INSTAGRAM_PAGE_ID].filter(Boolean);
      for (const entry of (req.body?.entry || []).slice(0, 50)) {
        if (!expected.includes(String(entry.id))) continue;
        for (const event of (entry.messaging || []).slice(0, 50)) {
          if (
            !expected.includes(String(event.recipient?.id)) ||
            event.message?.is_echo
          )
            continue;
          const sender = String(event.sender?.id || "");
          if (
            !/^\d{1,40}$/.test(sender) ||
            !/^FINFOLK\s+[A-F0-9]{24}$/i.test(
              String(event.message?.text || "").trim(),
            )
          )
            continue;
          let profile = {};
          try {
            profile = await graph(sender, {
              fields: "username,is_user_follow_business",
            });
          } catch {
            /* Manual review remains available. */
          }
          const uid = await service().receiveCode(
            sender,
            event.message.text,
            profile,
          );
          if (
            uid &&
            c.autoVerification === true &&
            profile.username &&
            profile.is_user_follow_business === true
          ) {
            const state = (
              await db().doc(`instagramConnections/${uid}`).get()
            ).data();
            if (state?.ownershipMatched) {
              await enabled(uid);
              await service().approve("meta-api", {
                uid,
                ownershipChecked: true,
                followChecked: true,
              });
            }
          }
        }
        for (const change of (entry.changes || []).slice(0, 50)) {
          const mediaId = String(change.value?.media_id || "");
          // Comment mentions are deliberately excluded: they are not author opt-in tags.
          if (
            change.field !== "mentions" ||
            change.value?.comment_id ||
            !/^\d{1,40}$/.test(mediaId)
          )
            continue;
          const ref = db().doc(`instagramJobs/${hash(mediaId)}`);
          await db().runTransaction(async (t) => {
            if (!(await t.get(ref)).exists)
              t.set(ref, {
                mediaId,
                status: "pending",
                attempts: 0,
                createdAt: new Date(),
              });
          });
        }
      }
      return res.sendStatus(200);
    } catch {
      return res.sendStatus(503);
    }
  },
);
async function pruneInstagram() {
  for (const [collection, field, days, status] of [
    ["instagramChallenges", "expiresAt", 1, null],
    ["instagramMedia", "updatedAt", 30, "unmatched"],
    ["instagramJobs", "updatedAt", 30, "complete"],
  ]) {
    let query = db()
      .collection(collection)
      .where(field, "<", new Date(Date.now() - days * 86400000));
    if (status) query = query.where("status", "==", status);
    const rows = await query.limit(100).get(),
      batch = db().batch();
    for (const row of rows.docs) batch.delete(row.ref);
    if (!rows.empty) await batch.commit();
  }
}
export const syncInstagram = onSchedule(
  {
    ...options,
    timeoutSeconds: 300,
    schedule: "every 15 minutes",
    secrets: [accessToken],
  },
  async () => {
    await pruneInstagram();
    const c = await config();
    if (c.enabled !== true) return;
    const jobs = await db()
      .collection("instagramJobs")
      .where("status", "==", "pending")
      .limit(25)
      .get();
    for (const row of jobs.docs) {
      if (row.data().attempts >= 8) {
        await row.ref.update({ status: "needs-review" });
        continue;
      }
      await processJob(row.ref);
    }
    const { id } = settings();
    let after;
    // Bounded reconciliation; cursor is carried between runs so busy accounts do not starve old pages.
    const checkpoint = db().doc("system/instagramSync"),
      saved = (await checkpoint.get()).data();
    after = saved?.after || undefined;
    for (let page = 0; page < 3; page++) {
      const result = await graph(`${id}/tags`, {
        fields,
        limit: "50",
        ...(after ? { after } : {}),
      });
      for (const media of result.data || []) await importMedia(media);
      after = result.paging?.next ? result.paging?.cursors?.after : undefined;
      await checkpoint.set({ after: after || null, updatedAt: new Date() });
      if (!after) break;
    }
  },
);
