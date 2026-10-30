import assert from "node:assert/strict";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  getMetadata,
  getBytes,
} from "firebase/storage";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const { default: sharp } = await import(
  pathToFileURL(
    createRequire(
      new URL("../functions/package.json", import.meta.url),
    ).resolve("sharp"),
  ).href
);
const projectId = "demo-finfolk";
const adminRequire = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const admin = adminRequire("firebase-admin/app").initializeApp({
  projectId,
  storageBucket: projectId + ".appspot.com",
});
const adminDB = adminRequire("firebase-admin/firestore").getFirestore(admin),
  adminBucket = adminRequire("firebase-admin/storage")
    .getStorage(admin)
    .bucket();
function client(name) {
  const app = initializeApp(
      {
        projectId,
        apiKey: "demo-key",
        storageBucket: projectId + ".appspot.com",
      },
      name,
    ),
    auth = getAuth(app),
    db = getFirestore(app),
    storage = getStorage(app),
    functions = getFunctions(app, "australia-southeast1");
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return { auth, db, storage, functions };
}
const alice = client("alice"),
  bob = client("bob");
await createUserWithEmailAndPassword(
  alice.auth,
  `alice-${Date.now()}@example.test`,
  "Password-1234",
);
await createUserWithEmailAndPassword(
  bob.auth,
  `bob-${Date.now()}@example.test`,
  "Password-1234",
);
const uid = alice.auth.currentUser.uid;
const data = {
  ownerId: uid,
  date: "2026-10-30",
  locationName: "Bondi",
  beachId: "",
  point: null,
  durationMinutes: null,
  maxDepthMetres: null,
  notes: "test",
  visibility: "private",
  photos: [],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  deleting: false,
};
await setDoc(doc(alice.db, "sessions", "function-test"), data);
const image = (
  await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#009db2" },
  })
    .jpeg()
    .toBuffer()
).toString("base64");
await assert.rejects(
  httpsCallable(bob.functions, "deleteSession")({ id: "function-test" }),
);
await assert.rejects(
  httpsCallable(
    alice.functions,
    "uploadSessionPhoto",
  )({ id: "function-test", slot: "6", image }),
);
await httpsCallable(
  alice.functions,
  "uploadSessionPhoto",
)({ id: "function-test", slot: "0", image });
const object = ref(alice.storage, `sessions/${uid}/function-test/0`);
assert.deepEqual(
  (await getDoc(doc(alice.db, "sessions", "function-test"))).data().photos,
  ["0"],
);
const metadata = await getMetadata(object);
assert.equal(metadata.customMetadata?.firebaseStorageDownloadTokens, undefined);
assert.equal(metadata.cacheControl, "private,no-store");
await httpsCallable(alice.functions, "deleteSession")({ id: "function-test" });
assert.equal((await adminDB.doc("sessions/function-test").get()).exists, false);
assert.equal(
  (await adminBucket.file(`sessions/${uid}/function-test/0`).exists())[0],
  false,
);
await assert.rejects(getBytes(object));
await setDoc(doc(alice.db, "sessions", "account-test"), data);
await httpsCallable(
  alice.functions,
  "uploadSessionPhoto",
)({ id: "account-test", slot: "0", image });
await httpsCallable(alice.functions, "deleteAccount")({});
await assert.rejects(
  setDoc(doc(alice.db, "sessions", "after-account-delete"), data),
);
assert.equal((await adminDB.doc("sessions/account-test").get()).exists, false);
assert.equal(
  (await adminBucket.file(`sessions/${uid}/account-test/0`).exists())[0],
  false,
);
console.log(
  "Callable checks passed: cross-account denial, photo slots, token-free images, session cleanup, and account deletion.",
);
process.exit(0);
