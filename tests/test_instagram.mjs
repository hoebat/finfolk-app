import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Window } from "happy-dom";
import {
  handle,
  validSignature,
  mediaInput,
  matchBeach,
  eligible,
} from "../functions/instagram-core.js";
import { instagramPanel } from "../web/instagram.js";
assert.equal(handle("@Some.Diver"), "some.diver");
assert.throws(() => handle("../bad"));
const raw = Buffer.from('{"entry":[]}'),
  secret = "test-secret";
const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
assert.ok(validSignature(raw, sig, secret));
assert.ok(!validSignature(Buffer.from("{}"), sig, secret));
assert.ok(!validSignature(raw, "sha256=aa", secret));
const media = {
  id: "123",
  permalink: "https://www.instagram.com/p/test/",
  timestamp: "2026-10-30T01:00:00Z",
  media_type: "IMAGE",
  username: "diver",
};
assert.equal(mediaInput(media).url, media.permalink);
for (const url of [
  "https://evil.test/p/test/",
  "javascript:alert(1)",
  "https://www.instagram.com/stories/test/",
  "https://user@instagram.com/p/test/",
])
  assert.throws(() => mediaInput({ ...media, permalink: url }));
const beaches = [
  { id: "bondi", name: "Bondi Beach" },
  { id: "coogee", name: "Coogee Beach" },
];
assert.equal(matchBeach("At Bondi Beach today", beaches)?.id, "bondi");
assert.equal(matchBeach("Bondi Beach and Coogee Beach", beaches), null);
assert.equal(matchBeach("Ocean swim", beaches), null);
const now = new Date("2026-10-30T02:00:00Z");
const c = {
  status: "verified",
  importsEnabled: true,
  consentVersion: 1,
  importSince: new Date("2026-10-30T00:00:00Z"),
};
assert.ok(eligible(c, new Date(media.timestamp), now));
assert.ok(
  !eligible({ ...c, importsEnabled: false }, new Date(media.timestamp), now),
);
assert.ok(!eligible(c, new Date("2025-01-01"), now));
const w = new Window({ url: "https://example.test" });
globalThis.document = w.document;
globalThis.confirm = () => true;
Object.defineProperty(globalThis, "navigator", {
  value: w.navigator,
  configurable: true,
});
let state = null,
  requestCount = 0,
  message = "",
  posts = [];
const api = {
  user: { uid: "a", emailVerified: true },
  instagramStatus: async () => state,
  instagramPosts: async () => posts,
  isInstagramAdmin: async () => false,
  requestInstagramVerification: async (name, consent) => {
    assert.equal(name, "diver");
    assert.equal(consent, true);
    requestCount++;
    state = { handle: name, status: "pending" };
    return {
      code: "FINFOLK ABCDEF0123456789ABCDEF01",
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
    };
  },
  manageInstagram: async (action) => {
    state = {
      ...state,
      importsEnabled: action === "resume",
      status: action === "disconnect" ? "disconnected" : state.status,
    };
  },
  editInstagramPost: async (id, action) => {
    assert.equal(id, "123");
    if (action === "remove") posts = [];
  },
};
const tick = () => new Promise((r) => setTimeout(r, 15));
const panel = instagramPanel({ api, beaches, notify: (s) => (message = s) });
document.body.append(panel.root);
await tick();
const form = document.querySelector("form");
form.querySelector("input[type=text]").value = "diver";
form.dispatchEvent(new w.Event("submit"));
await tick();
assert.equal(requestCount, 0);
assert.match(message, /Agree/);
form.querySelector("input[type=checkbox]").checked = true;
form.dispatchEvent(new w.Event("submit"));
await tick();
assert.equal(requestCount, 1);
assert.match(document.body.textContent, /Verification pending/);
assert.match(document.body.textContent, /FINFOLK ABC/);
state = { status: "verified", handle: "diver", importsEnabled: true };
posts = [
  {
    id: "123",
    url: media.permalink,
    author: "diver",
    title: "Tagged post",
    community: true,
  },
];
const click = async (title) => {
  const b = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === title,
  );
  assert.ok(b, title);
  b.click();
  await tick();
};
await click("Refresh status");
assert.match(document.body.textContent, /Verified · Importing/);
assert.equal(document.querySelectorAll("iframe").length, 0);
await click("Pause importing");
assert.equal(state.importsEnabled, false);
await click("Resume importing");
assert.equal(state.importsEnabled, true);
await click("Remove from FinFolk");
assert.equal(posts.length, 0);
panel.dispose();
await w.happyDOM.close();
console.log(
  "Instagram checks passed: signed payloads, media validation, matching, eligibility, consent, verification states and member controls.",
);
