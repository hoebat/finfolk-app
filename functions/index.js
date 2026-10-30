import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";
initializeApp();
const db = getFirestore(),
  options = {
    region: "australia-southeast1",
    maxInstances: 3,
    timeoutSeconds: 540,
  };
function identity(request, recent = false) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (recent && Date.now() / 1000 - request.auth.token.auth_time > 300)
    throw new HttpsError(
      "failed-precondition",
      "Sign in again before deleting your account.",
    );
  return request.auth.uid;
}
async function removeSession(uid, id) {
  const ref = db.doc(`sessions/${id}`);
  const exists = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return false;
    if (snap.data().ownerId !== uid)
      throw new HttpsError(
        "permission-denied",
        "This session belongs to another account.",
      );
    transaction.update(ref, { visibility: "private", deleting: true });
    return true;
  });
  if (!exists) return;
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `sessions/${uid}/${id}/` });
  await ref.delete();
}
export const deleteSession = onCall(options, async (request) => {
  const uid = identity(request),
    id = request.data?.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
    throw new HttpsError("invalid-argument", "Invalid session.");
  await removeSession(uid, id);
  return { deleted: true };
});
export const deleteAccount = onCall(options, async (request) => {
  const uid = identity(request, true);
  await db.doc(`deletingAccounts/${uid}`).set({ startedAt: new Date() });
  while (true) {
    const sessions = await db
      .collection("sessions")
      .where("ownerId", "==", uid)
      .limit(50)
      .get();
    if (sessions.empty) break;
    for (const session of sessions.docs) await removeSession(uid, session.id);
  }
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `sessions/${uid}/` });
  await db.doc(`profiles/${uid}`).delete();
  await getAuth().deleteUser(uid);
  // Keep the tombstone: it denies writes from an already-issued token.
  return { deleted: true };
});
function photoInput(request) {
  const uid = identity(request),
    { id, slot } = request.data || {};
  if (
    typeof id !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
    !["0", "1", "2", "3", "4", "5"].includes(slot)
  )
    throw new HttpsError("invalid-argument", "Invalid photo slot.");
  return { uid, id, slot };
}
async function writableSession(uid, id) {
  const [session, tombstone] = await Promise.all([
    db.doc(`sessions/${id}`).get(),
    db.doc(`deletingAccounts/${uid}`).get(),
  ]);
  if (
    tombstone.exists ||
    !session.exists ||
    session.data().ownerId !== uid ||
    session.data().visibility !== "private" ||
    session.data().deleting
  )
    throw new HttpsError(
      "permission-denied",
      "Open a private session you own before changing photos.",
    );
  return session;
}
export const uploadSessionPhoto = onCall(
  { ...options, memory: "512MiB" },
  async (request) => {
    const { uid, id, slot } = photoInput(request),
      encoded = request.data.image;
    if (
      typeof encoded !== "string" ||
      encoded.length > 2800000 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
    )
      throw new HttpsError(
        "invalid-argument",
        "Image is too large or invalid.",
      );
    await writableSession(uid, id);
    const { default: sharp } = await import("sharp");
    let bytes;
    try {
      const source = Buffer.from(encoded, "base64");
      if (source.length > 2 * 1024 * 1024) throw Error();
      bytes = await sharp(source, { limitInputPixels: 30_000_000 })
        .rotate()
        .resize({
          width: 2048,
          height: 2048,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      if (bytes.length > 2 * 1024 * 1024) throw Error();
    } catch {
      throw new HttpsError(
        "invalid-argument",
        "Use a supported photo under 2 MB.",
      );
    }
    const file = getStorage().bucket().file(`sessions/${uid}/${id}/${slot}`);
    await file.save(bytes, {
      resumable: false,
      metadata: {
        contentType: "image/jpeg",
        cacheControl: "private,no-store",
        metadata: { sessionId: id },
      },
    });
    try {
      await writableSession(uid, id);
      await db.runTransaction(async (t) => {
        const ref = db.doc(`sessions/${id}`),
          s = await t.get(ref);
        if (!s.exists || s.data().deleting || s.data().visibility !== "private")
          throw new HttpsError(
            "failed-precondition",
            "Session changed while uploading.",
          );
        const photos = [...new Set([...(s.data().photos || []), slot])].sort();
        t.update(ref, { photos, updatedAt: new Date() });
      });
    } catch (error) {
      await file.delete({ ignoreNotFound: true });
      throw error;
    }
    return { uploaded: true };
  },
);
export const removeSessionPhoto = onCall(options, async (request) => {
  const { uid, id, slot } = photoInput(request);
  await writableSession(uid, id);
  await getStorage()
    .bucket()
    .file(`sessions/${uid}/${id}/${slot}`)
    .delete({ ignoreNotFound: true });
  await db.runTransaction(async (t) => {
    const ref = db.doc(`sessions/${id}`),
      s = await t.get(ref);
    if (!s.exists || s.data().deleting || s.data().visibility !== "private")
      throw new HttpsError(
        "failed-precondition",
        "Session changed while removing the photo.",
      );
    t.update(ref, {
      photos: (s.data().photos || []).filter((p) => p !== slot),
      updatedAt: new Date(),
    });
  });
  return { deleted: true };
});
