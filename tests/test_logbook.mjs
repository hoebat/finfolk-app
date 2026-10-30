import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  sessionInput,
  instagramHandle,
  sessionLink,
} from "../web/logbook-model.js";
import { installLogbook } from "../web/logbook.js";
assert.equal(
  instagramHandle("https://www.instagram.com/fin.folk/"),
  "fin.folk",
);
assert.equal(instagramHandle("@finfolk"), "finfolk");
for (const v of [
  "https://evil.test/finfolk",
  "https://instagram.com/p/abc",
  "a b",
])
  assert.throws(() => instagramHandle(v));
assert.equal(
  sessionInput({ date: "2026-10-30", locationName: "Bondi" }).maxDepthMetres,
  null,
);
assert.throws(() =>
  sessionInput({
    date: "2026-10-30",
    locationName: "Bondi",
    maxDepthMetres: -1,
  }),
);
assert.equal(
  new URL(sessionLink("abc", "https://example.test/app/?site=beach")).search,
  "?view=logbook&session=abc",
);
const w = new Window({ url: "https://example.test/?view=logbook" });
w.document.write(
  '<nav class="primary-nav"><button data-view="logbook" hidden>Logbook</button></nav><section id="logbook-page"></section>',
);
for (const k of ["document", "location", "history"]) globalThis[k] = w[k];
globalThis.confirm = () => true;
Object.defineProperty(globalThis, "navigator", {
  value: w.navigator,
  configurable: true,
});
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new w.Event("close"));
};
let route = { view: "logbook" },
  listeners = [],
  authCallback,
  failSave = true,
  published = false,
  saveCalls = 0;
const session = {
  id: "one",
  ownerId: "alice",
  date: "2026-10-30",
  locationName: "Bondi",
  durationMinutes: 60,
  maxDepthMetres: 10,
  notes: "Private reef notes",
  photos: [],
  visibility: "private",
  deleting: false,
};
const api = {
  user: {
    uid: "alice",
    email: "alice@example.test",
    emailVerified: true,
    providerData: [{ providerId: "google.com" }],
  },
  observe(fn) {
    authCallback = fn;
    queueMicrotask(() => fn(this.user));
  },
  ensureProfile: async () => {},
  list: async () => ({ sessions: [{ ...session }], more: false }),
  profile: async () => ({ displayName: "Alice", bio: "", instagram: "alice" }),
  get: async () => ({ ...session }),
  save: async () => {
    saveCalls++;
    if (failSave) throw Error("Connection lost");
    return "one";
  },
  visibility: async (id, value) => {
    session.visibility = value;
    published = value === "public";
  },
  signOut: async () => {
    api.user = null;
    await authCallback(null);
  },
};
const shell = {
  get route() {
    return route;
  },
  subscribe(fn) {
    listeners.push(fn);
  },
  navigate(view, { params = {} } = {}) {
    route = { view };
    const u = new URL(location.href);
    for (const [k, v] of Object.entries(params))
      v === null ? u.searchParams.delete(k) : u.searchParams.set(k, v);
    history.replaceState(null, "", u);
    for (const fn of listeners) fn(route);
  },
};
const wait = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("Timeout: " + document.body.textContent);
};
const click = (text) => {
  const b = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
  assert.ok(b, text);
  b.click();
};
try {
  installLogbook({
    shell,
    getBeaches: () => [
      { id: "bondi", name: "Bondi", state: "NSW", point: [151.2, -33.9] },
    ],
    loadJSON: async () => ({ enabled: true, firebase: {} }),
    loadClient: async () => ({ createLogbookClient: async () => api }),
  });
  await wait(() => document.querySelector(".session-title"));
  click("Log a session");
  const form = document.querySelector(".session-form");
  form.elements.date.value = "2026-10-30";
  form.elements.locationName.value = "Bondi";
  form.elements.notes.value = "Keep this draft";
  form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await wait(() => document.body.textContent.includes("Connection lost"));
  assert.equal(form.elements.notes.value, "Keep this draft");
  failSave = false;
  form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await wait(() => document.querySelector(".session-detail"));
  assert.equal(saveCalls, 2);
  click("Publish");
  assert.ok(document.querySelector("dialog").open);
  assert.ok(document.querySelector("dialog").textContent.includes("Everyone"));
  click("Publish for everyone");
  await wait(
    () => published && document.body.textContent.includes("Unpublish"),
  );
  click("Unpublish");
  await wait(
    () =>
      session.visibility === "private" &&
      document.body.textContent.includes("Publish"),
  );
  click("Sign out");
  await wait(() => document.querySelector(".auth-card"));
  assert.ok(!document.body.textContent.includes("Private reef notes"));
  console.log(
    "Logbook checks passed: Instagram validation, draft retry, publication preview, unpublish and sign-out privacy.",
  );
} finally {
  await w.happyDOM.close();
}
