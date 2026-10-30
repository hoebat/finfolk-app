import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
const env = await initializeTestEnvironment({
  projectId: "demo-finfolk",
  firestore: { rules: await readFile("firestore.rules", "utf8") },
  storage: { rules: await readFile("storage.rules", "utf8") },
});
const alice = env.authenticatedContext("alice", { email_verified: true }),
  bob = env.authenticatedContext("bob", { email_verified: true }),
  unverified = env.authenticatedContext("unverified", {
    email_verified: false,
  }),
  anon = env.unauthenticatedContext();
const input = (uid) => ({
  ownerId: uid,
  date: "2026-10-30",
  locationName: "Bondi",
  beachId: "bondi",
  point: [151.2, -33.9],
  durationMinutes: 60,
  maxDepthMetres: 10,
  notes: "Private notes",
  visibility: "private",
  photos: [],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  deleting: false,
});
const session = (context, id = "one") =>
  doc(context.firestore(), "sessions", id);
try {
  await env.clearFirestore();
  await env.clearStorage();
  await assertFails(setDoc(session(anon), input("alice")));
  await assertFails(setDoc(session(bob), input("alice")));
  await assertSucceeds(setDoc(session(alice), input("alice")));
  await assertSucceeds(getDoc(session(alice)));
  await assertFails(getDoc(session(bob)));
  await assertFails(getDoc(session(anon)));
  await assertFails(
    updateDoc(session(bob), {
      visibility: "public",
      photos: ["0"],
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(session(alice), { ownerId: "bob", updatedAt: serverTimestamp() }),
  );
  await assertFails(
    updateDoc(session(alice), {
      photos: ["0", "1", "2", "3", "4", "5", "6"],
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(session(alice), {
      maxDepthMetres: -5,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    setDoc(session(unverified, "unverified"), input("unverified")),
  );
  await assertFails(
    updateDoc(session(unverified, "unverified"), {
      visibility: "public",
      photos: ["0"],
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    uploadBytes(
      ref(alice.storage(), "sessions/alice/one/0"),
      new Uint8Array([1]),
      { contentType: "image/jpeg" },
    ),
  );
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(
      ref(context.storage(), "sessions/alice/one/0"),
      new Uint8Array([1, 2, 3]),
      { contentType: "image/jpeg" },
    );
  });
  await assertSucceeds(getBytes(ref(alice.storage(), "sessions/alice/one/0")));
  await assertFails(getBytes(ref(bob.storage(), "sessions/alice/one/0")));
  await assertSucceeds(
    updateDoc(session(alice), {
      visibility: "public",
      photos: ["0"],
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(getDoc(session(anon)));
  await assertSucceeds(getBytes(ref(anon.storage(), "sessions/alice/one/0")));
  await assertSucceeds(
    getDocs(
      query(
        collection(anon.firestore(), "sessions"),
        where("ownerId", "==", "alice"),
        where("visibility", "==", "public"),
        where("deleting", "==", false),
      ),
    ),
  );
  await assertFails(getDocs(collection(anon.firestore(), "sessions")));
  await assertSucceeds(
    updateDoc(session(alice), {
      visibility: "private",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(getDoc(session(anon)));
  await assertFails(getBytes(ref(anon.storage(), "sessions/alice/one/0")));
  await assertFails(deleteDoc(session(alice)));
  await assertFails(
    setDoc(doc(alice.firestore(), "profiles", "alice"), {
      displayName: "Alice",
      bio: "",
      instagram: "alice",
      email: "leak@example.test",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    setDoc(doc(alice.firestore(), "profiles", "alice"), {
      displayName: "Alice",
      bio: "",
      instagram: "alice",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(getDoc(doc(anon.firestore(), "profiles", "alice")));
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "deletingAccounts", "alice"), {
      startedAt: new Date(),
    });
  });
  await assertFails(setDoc(session(alice, "after-delete"), input("alice")));
  console.log(
    "Firebase rules passed: private/public sessions and photos, ownership, verified publication, validation, query constraints and account deletion lock.",
  );
} finally {
  await env.cleanup();
}
