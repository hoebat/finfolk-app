import assert from "node:assert/strict";
import { Window } from "happy-dom";
const window = new Window({ url: "https://finfolk.com.au/" });
globalThis.document = window.document;
const { renderInstagramDiscovery, getInstagramFeed } = await import(
  "../web/instagram-discovery.js"
);
const { socialGallery } = await import("../web/media.js");
document.body.innerHTML = '<section id="system-panel"></section><main></main>';
const calls = [];
let refreshes = 0;
const api = {
  call: async (action, v) => {
    calls.push({ action, v });
    if (action === "instagramMyPosts")
      return {
        connection: { share_posts: false, media_owner_id: "123" },
        posts: [
          {
            id: "a",
            url: "https://www.instagram.com/p/ABC/",
            state: "pending",
            candidates: [],
            beach_id: null,
          },
        ],
      };
    if (action === "instagramDiscoveryStatus")
      return {
        collection: false,
        publication: false,
        hashtags: false,
        pending: 1,
        sources: [],
      };
    return { ok: true };
  },
};
await renderInstagramDiscovery({
  root: document.querySelector("main"),
  api,
  beaches: [{ id: "bondi", name: "Bondi Beach" }],
  admin: false,
  refresh: () => refreshes++,
});
assert.equal(document.querySelector("input[type=checkbox]").checked, false);
assert.ok(!document.body.textContent.includes("Post discovery admin inbox"));
const toggle = document.querySelector("input[type=checkbox]");
toggle.checked = true;
await toggle.onchange();
assert.deepEqual(calls.at(-1), {
  action: "instagramSharing",
  v: { enabled: true },
});
const select = document.querySelector("select");
select.value = "bondi";
await [...document.querySelectorAll("button")]
  .find((b) => b.textContent === "Share at this beach")
  .onclick();
assert.equal(calls.at(-1).action, "instagramChoosePostBeach");
assert.equal(refreshes, 1);
let requests = 0;
globalThis.fetch = async () => {
  requests++;
  return Response.json({
    posts: [],
    cursor: null,
    activity: { collecting: false, lastSuccess: null },
  });
};
const gallery = socialGallery([
  {
    id: "123",
    url: "https://www.instagram.com/p/ABC/",
    title: "Bondi",
    discovered: true,
    reportApi: "https://api.finfolk.com.au/",
  },
]);
document.body.append(gallery);
assert.equal(requests, 0);
assert.equal(gallery.querySelectorAll("iframe").length, 0);
const report = [...gallery.querySelectorAll("button")].find(
  (b) => b.textContent === "Report post",
);
report.click();
assert.ok(gallery.querySelector("select"));
assert.equal(requests, 0);
await getInstagramFeed("https://api.finfolk.com.au/", "bondi");
assert.equal(requests, 1);
assert.ok(
  document
    .querySelector("#instagram-public-status")
    .textContent.includes("Collection paused"),
);
console.log(
  "INSTAGRAM_DISCOVERY_UI_PASS: opt-in default, member beach picker, admin separation, lazy embeds, reporting and system callout.",
);
window.happyDOM.abort();
