import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  linkWithPopup,
  linkWithCredential,
  EmailAuthProvider,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  connectAuthEmulator,
  reload,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  getBlob,
  connectStorageEmulator,
} from "firebase/storage";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { activity } from "./activity.js";
import {
  sessionInput,
  instagramHandle,
  compressPhoto,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
} from "./logbook-model.js";
async function operation(label, fn) {
  const task = activity.begin({ label, kind: "Logbook" });
  try {
    const value = await fn();
    task.finish();
    return value;
  } catch (error) {
    task.finish({ state: "error", error: error.code || "Operation failed" });
    throw error;
  }
}
export async function createLogbookClient(config) {
  const app = initializeApp(config.firebase),
    auth = getAuth(app),
    db = getFirestore(app),
    storage = getStorage(app),
    functions = getFunctions(
      app,
      config.functionsRegion || "australia-southeast1",
    );
  if (
    config.emulators &&
    ["localhost", "127.0.0.1"].includes(location.hostname)
  ) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
  await setPersistence(auth, browserLocalPersistence);
  const uid = () => {
    if (!auth.currentUser) throw Error("Sign in to save a session.");
    return auth.currentUser.uid;
  };
  async function profile(id) {
    const snap = await getDoc(doc(db, "profiles", id));
    return snap.exists() ? { id, ...snap.data() } : null;
  }
  return {
    get user() {
      return auth.currentUser;
    },
    observe(callback) {
      return onAuthStateChanged(auth, callback);
    },
    async ensureProfile() {
      const id = uid();
      if (!(await profile(id)))
        await setDoc(doc(db, "profiles", id), {
          displayName: (auth.currentUser.displayName || "Diver").slice(0, 80),
          bio: "",
          instagram: "",
          updatedAt: serverTimestamp(),
        });
    },
    profile: (id) => operation("Loading diver profile", () => profile(id)),
    saveProfile: (values) =>
      operation("Saving diver profile", async () => {
        const displayName = values.displayName.trim(),
          bio = values.bio.trim();
        if (!displayName || displayName.length > 80 || bio.length > 500)
          throw Error(
            "Use a name up to 80 characters and biography up to 500.",
          );
        await setDoc(doc(db, "profiles", uid()), {
          displayName,
          bio,
          instagram: instagramHandle(values.instagram),
          updatedAt: serverTimestamp(),
        });
      }),
    google: () =>
      operation("Signing in", () =>
        signInWithPopup(auth, new GoogleAuthProvider()),
      ),
    email: (email, password, register = false) =>
      operation(register ? "Creating account" : "Signing in", async () => {
        const result = await (
          register ? createUserWithEmailAndPassword : signInWithEmailAndPassword
        )(auth, email, password);
        if (register) await sendEmailVerification(result.user);
        return result;
      }),
    reset: (email) =>
      operation("Sending password reset", () =>
        sendPasswordResetEmail(auth, email),
      ),
    verify: () =>
      operation("Sending verification email", () =>
        sendEmailVerification(auth.currentUser),
      ),
    refresh: () =>
      operation("Checking email verification", async () => {
        await reload(auth.currentUser);
        await auth.currentUser.getIdToken(true);
      }),
    signOut: () => signOut(auth),
    linkGoogle: () =>
      operation("Linking Google account", () =>
        linkWithPopup(auth.currentUser, new GoogleAuthProvider()),
      ),
    linkPassword: (email, password) =>
      operation("Linking email sign-in", () =>
        linkWithCredential(
          auth.currentUser,
          EmailAuthProvider.credential(email, password),
        ),
      ),
    async reauthenticate(password) {
      const user = auth.currentUser;
      if (user.providerData.some((p) => p.providerId === "google.com"))
        return reauthenticateWithPopup(user, new GoogleAuthProvider());
      return reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password),
      );
    },
    async list({ owner = uid(), publicOnly = false, cursor = null } = {}) {
      return operation("Loading sessions", async () => {
        const constraints = [where("ownerId", "==", owner)];
        if (publicOnly)
          constraints.push(
            where("visibility", "==", "public"),
            where("deleting", "==", false),
          );
        constraints.push(orderBy("date", "desc"), orderBy("__name__", "desc"));
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(30));
        const snap = await getDocs(
          query(collection(db, "sessions"), ...constraints),
        );
        return {
          sessions: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          cursor: snap.docs.at(-1) || null,
          more: snap.size === 30,
        };
      });
    },
    get: (id) =>
      operation("Loading session", async () => {
        const snap = await getDoc(doc(db, "sessions", id));
        if (!snap.exists()) throw Error("This session is unavailable.");
        return { id: snap.id, ...snap.data() };
      }),
    save: (id, values) =>
      operation("Saving session", async () => {
        const data = sessionInput(values),
          target = id
            ? doc(db, "sessions", id)
            : doc(collection(db, "sessions"));
        if (id)
          await updateDoc(target, { ...data, updatedAt: serverTimestamp() });
        else
          await setDoc(target, {
            ...data,
            ownerId: uid(),
            visibility: "private",
            photos: [],
            deleting: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        return target.id;
      }),
    visibility: (id, visibility) =>
      operation(
        visibility === "public"
          ? "Publishing session"
          : "Making session private",
        () =>
          updateDoc(doc(db, "sessions", id), {
            visibility,
            updatedAt: serverTimestamp(),
          }),
      ),
    async upload(id, slot, file) {
      if (!/^[0-5]$/.test(String(slot)))
        throw Error("A session can have six photos.");
      const blob = await compressPhoto(file);
      return operation("Uploading session photo", async () => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        await httpsCallable(
          functions,
          "uploadSessionPhoto",
        )({ id, slot: String(slot), image: btoa(binary) });
      });
    },
    removePhoto: (id, slot) =>
      operation("Removing session photo", () =>
        httpsCallable(
          functions,
          "removeSessionPhoto",
        )({ id, slot: String(slot) }),
      ),
    photo: (session, slot) =>
      operation("Loading session photo", () =>
        getBlob(
          ref(storage, `sessions/${session.ownerId}/${session.id}/${slot}`),
          MAX_PHOTO_BYTES,
        ),
      ),
    deleteSession: (id) =>
      operation("Deleting session", () =>
        httpsCallable(functions, "deleteSession")({ id }),
      ),
    deleteAccount: () =>
      operation("Deleting account", () =>
        httpsCallable(functions, "deleteAccount")({}),
      ),
  };
}
