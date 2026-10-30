import { randomBytes } from "node:crypto";
import {
  hash,
  handle,
  fail,
  mediaInput,
  matchBeach,
  eligible,
} from "./instagram-core.js";
export function instagramService(db, beaches = [], clock = () => new Date()) {
  const connection = (uid) => db.doc(`instagramConnections/${uid}`);
  const active = async (t, uid) => {
    if ((await t.get(db.doc(`deletingAccounts/${uid}`))).exists)
      fail("Account is being deleted.");
  };
  async function request(uid, username, consent) {
    if (consent !== true)
      fail("Agree to automatic public indexing first.", "invalid-argument");
    const name = handle(username),
      now = clock(),
      code = randomBytes(12).toString("hex").toUpperCase();
    const expiresAt = new Date(+now + 30 * 60 * 1000);
    await db.runTransaction(async (t) => {
      await active(t, uid);
      const old = (await t.get(connection(uid))).data();
      if (old?.status === "verified")
        fail("Disconnect before linking a different Instagram account.");
      if (old?.requestedAt && +now - +old.requestedAt.toDate() < 60000)
        fail(
          "Wait a minute before requesting another code.",
          "resource-exhausted",
        );
      t.set(db.doc(`instagramChallenges/${hash(code)}`), {
        uid,
        handle: name,
        createdAt: now,
        expiresAt,
        consumed: false,
      });
      t.set(connection(uid), {
        handle: name,
        status: "pending",
        importsEnabled: false,
        consentVersion: 1,
        consentAt: now,
        requestedAt: now,
        challengeHash: hash(code),
        expiresAt,
        updatedAt: now,
      });
    });
    return { code: `FINFOLK ${code}`, expiresAt: expiresAt.toISOString() };
  }
  async function receiveCode(senderId, text, profile = {}) {
    const code = String(text)
      .trim()
      .match(/^FINFOLK\s+([A-F0-9]{24})$/i)?.[1]
      ?.toUpperCase();
    if (!code || !/^\d{1,40}$/.test(String(senderId))) return false;
    return db.runTransaction(async (t) => {
      const ref = db.doc(`instagramChallenges/${hash(code)}`),
        snap = await t.get(ref);
      if (!snap.exists) return false;
      const c = snap.data(),
        state = (await t.get(connection(c.uid))).data(),
        now = clock();
      await active(t, c.uid);
      if (
        c.consumed ||
        +c.expiresAt.toDate() < +now ||
        state?.challengeHash !== ref.id ||
        state.status !== "pending"
      )
        return false;
      // Receiving a code alone does not establish that the claimed username owns the sender ID.
      const matched = profile.username && handle(profile.username) === c.handle;
      t.update(ref, { consumed: true, consumedAt: now });
      t.update(connection(c.uid), {
        senderId: String(senderId),
        messageReceivedAt: now,
        ownershipMatched: !!matched,
        updatedAt: now,
      });
      return c.uid;
    });
  }
  async function approve(
    adminUid,
    { uid, code, ownershipChecked, followChecked },
  ) {
    if (ownershipChecked !== true || followChecked !== true)
      fail("Confirm the sender username and follow status in Instagram.");
    const now = clock();
    await db.runTransaction(async (t) => {
      const ref = connection(uid),
        snap = await t.get(ref),
        c = snap.data();
      if (!c || c.status !== "pending") fail("No pending verification.");
      await active(t, uid);
      const challengeRef = db.doc(`instagramChallenges/${c.challengeHash}`),
        ch = (await t.get(challengeRef)).data();
      if (!ch || ch.uid !== uid) fail("Verification request is unavailable.");
      if (
        !ch.consumed &&
        (hash(
          String(code || "")
            .trim()
            .replace(/^FINFOLK\s+/i, "")
            .toUpperCase(),
        ) !== c.challengeHash ||
          +ch.expiresAt.toDate() < +now)
      )
        fail("The code is incorrect or expired.");
      const claimRef = db.doc(`instagramHandles/${c.handle}`),
        claim = (await t.get(claimRef)).data();
      if (claim && claim.uid !== uid)
        fail("This Instagram account is already linked.");
      t.set(claimRef, { uid });
      t.update(challengeRef, {
        consumed: true,
        consumedAt: ch.consumedAt || now,
      });
      t.update(ref, {
        status: "verified",
        importsEnabled: true,
        verifiedAt: now,
        importSince: now,
        verifiedBy: adminUid,
        followCheckedAt: now,
        ownershipCheckedAt: now,
        updatedAt: now,
      });
    });
  }
  async function control(uid, action) {
    if (!["pause", "resume", "disconnect"].includes(action))
      fail("Unknown action.", "invalid-argument");
    await db.runTransaction(async (t) => {
      await active(t, uid);
      const ref = connection(uid),
        c = (await t.get(ref)).data();
      if (!c) return;
      if (action !== "disconnect" && c.status !== "verified")
        fail("Verify Instagram first.");
      let claimRef, claim;
      if (action === "disconnect") {
        claimRef = db.doc(`instagramHandles/${c.handle}`);
        claim = (await t.get(claimRef)).data();
      }
      t.update(ref, {
        importsEnabled: action === "resume",
        status: action === "disconnect" ? "disconnected" : c.status,
        updatedAt: clock(),
        ...(action === "resume" ? { importSince: clock() } : {}),
      });
      if (claim?.uid === uid) t.delete(claimRef);
    });
  }
  async function ingest(input) {
    const m = mediaInput(input),
      now = clock(),
      rawRef = db.doc(`instagramMedia/${m.id}`),
      pubRef = db.doc(`instagramPosts/${m.id}`);
    const beach = matchBeach(m.caption, beaches);
    return db.runTransaction(async (t) => {
      const suppression = await t.get(db.doc(`instagramSuppressions/${m.id}`));
      if (suppression.exists) return "suppressed";
      const prior = (await t.get(rawRef)).data();
      const claim = m.username
        ? (await t.get(db.doc(`instagramHandles/${m.username}`))).data()
        : null;
      const c = claim ? (await t.get(connection(claim.uid))).data() : null;
      const deleting = claim
        ? (await t.get(db.doc(`deletingAccounts/${claim.uid}`))).exists
        : false;
      const approved =
        !deleting &&
        c?.handle === m.username &&
        eligible(
          c?.importSince && { ...c, importSince: c.importSince.toDate() },
          m.postedAt,
          now,
        );
      if (!approved && prior?.ownerId) return "skipped"; // Pausing preserves previously published posts.
      if (!approved) {
        t.set(rawRef, {
          ...m,
          firstSeenAt: prior?.firstSeenAt || now,
          status: "unmatched",
          ...(claim ? { candidateOwnerId: claim.uid } : {}),
          updatedAt: now,
        });
        return "unmatched";
      }
      // A provider ID cannot silently move between member accounts.
      if (prior?.ownerId && prior.ownerId !== claim.uid) return "skipped";
      const beachId = prior?.locationChosen ? prior.beachId : beach?.id || "";
      const beachName = beaches.find((b) => b.id === beachId)?.name || "";
      t.set(rawRef, {
        ...m,
        firstSeenAt: prior?.firstSeenAt || now,
        status: "published",
        ownerId: claim.uid,
        beachId,
        locationChosen: !!prior?.locationChosen,
        updatedAt: now,
      });
      t.set(pubRef, {
        ownerId: claim.uid,
        author: m.username,
        url: m.url,
        title: `@${m.username} · Instagram`,
        caption: m.caption,
        beachId,
        beachName,
        location_context: beachId
          ? `Location: ${beachName}${prior?.locationChosen ? " · selected by the diver" : " · matched from the caption"}`
          : "Location not assigned",
        postedAt: m.postedAt,
        indexedAt: prior?.firstSeenAt || now,
        visibility: "public",
        updatedAt: now,
      });
      return "published";
    });
  }
  async function editPost(uid, id, action, beachId = "") {
    if (!/^\d{1,40}$/.test(String(id)))
      fail("Invalid post.", "invalid-argument");
    if (
      !["remove", "location"].includes(action) ||
      (action === "location" && !beaches.some((b) => b.id === beachId))
    )
      fail("Choose a listed beach.", "invalid-argument");
    await db.runTransaction(async (t) => {
      await active(t, uid);
      const ref = db.doc(`instagramPosts/${id}`),
        p = (await t.get(ref)).data();
      if (!p || p.ownerId !== uid)
        fail("This post belongs to another diver.", "permission-denied");
      const raw = db.doc(`instagramMedia/${id}`);
      if (action === "remove") {
        t.set(db.doc(`instagramSuppressions/${id}`), { removedAt: clock() });
        t.delete(ref);
        t.delete(raw);
      } else {
        const b = beaches.find((b) => b.id === beachId);
        t.update(ref, {
          beachId,
          beachName: b.name,
          location_context: `Location: ${b.name} · selected by the diver`,
          updatedAt: clock(),
        });
        t.update(raw, { beachId, locationChosen: true });
      }
    });
  }
  async function cleanup(uid) {
    await control(uid, "disconnect").catch((e) => {
      if (e.message !== "Account is being deleted.") throw e;
    });
    const c = (await connection(uid).get()).data();
    if (c) {
      const claim = db.doc(`instagramHandles/${c.handle}`);
      await db.runTransaction(async (t) => {
        if ((await t.get(claim)).data()?.uid === uid) t.delete(claim);
      });
    }
    for (const collection of [
      "instagramPosts",
      "instagramMedia",
      "instagramChallenges",
      "instagramMediaCandidates",
    ]) {
      const field =
        collection === "instagramChallenges"
          ? "uid"
          : collection === "instagramMediaCandidates"
            ? "candidateOwnerId"
            : "ownerId";
      const target =
        collection === "instagramMediaCandidates"
          ? "instagramMedia"
          : collection;
      while (true) {
        const rows = await db
          .collection(target)
          .where(field, "==", uid)
          .limit(100)
          .get();
        if (rows.empty) break;
        const batch = db.batch();
        for (const row of rows.docs) {
          if (collection !== "instagramChallenges")
            batch.set(db.doc(`instagramSuppressions/${row.id}`), {
              removedAt: clock(),
            });
          batch.delete(row.ref);
        }
        await batch.commit();
      }
    }
    await connection(uid).delete();
  }
  return { request, receiveCode, approve, control, ingest, editPost, cleanup };
}
