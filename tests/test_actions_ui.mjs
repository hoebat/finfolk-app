import assert from "node:assert/strict";
import { Window } from "happy-dom";
const w = new Window({ url: "https://finfolk.test/?view=account" });
for (const key of [
  "window",
  "document",
  "location",
  "sessionStorage",
  "navigator",
])
  Object.defineProperty(globalThis, key, { value: w[key], configurable: true });
const { renderActions } = await import("../web/actions.js");
const calls = [],
  host = document.createElement("div");
document.body.append(host);
await renderActions({
  host,
  api: {
    call: async (action, v) => {
      calls.push({ action, v });
      if (action === "instagramStatus")
        return {
          connection: null,
          total: 0,
          admin: false,
          enabled: false,
          setupReady: true,
        };
      if (action === "instagramActions") return [];
      if (action === "instagramClaimStatus") return {enabled:false,capabilities:{connect:true},state:"ready"};
      if (action === "instagramClaimStart") return {command:"/claim " + "a".repeat(24),expiresAt:new Date(Date.now()+86400000).toISOString()};
    },
  },
});
assert.match(host.textContent, /Follow @finfolk.com.au/);
assert.match(host.textContent, /in preparation/);
assert.ok([...host.querySelectorAll('button')].some(b=>b.textContent==='Connect Instagram'));
assert.ok(!host.textContent.includes('/claim'));
assert.ok(!calls.some(c=>c.action==='instagramClaimStart'));
assert.equal(host.querySelector("input[type=checkbox]").checked, false);
assert.equal(host.textContent.includes("Actions admin inbox"), false);
w.happyDOM.abort();
console.log(
  "Actions UI passed: connection instructions, pending rollout, default-private points and admin separation.",
);
