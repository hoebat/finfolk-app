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
      if (action === "instagramClaimStatus") return {enabled:true,state:"ready"};
      if (action === "instagramClaimStart") return {command:"/claim " + "a".repeat(24),expiresAt:new Date(Date.now()+86400000).toISOString()};
    },
  },
});
assert.match(host.textContent, /Follow @finfolk.com.au/);
assert.match(host.textContent, /in preparation/);
[...host.querySelectorAll("button")].find(b=>b.textContent==="Start linking").click();
await new Promise(r=>setTimeout(r,10));
assert.ok(calls.find(c=>c.action==="instagramClaimStart"));
assert.equal(host.querySelector('[readonly]').value,'/claim '+ 'a'.repeat(24));
assert.equal(host.querySelector("input[type=checkbox]").checked, false);
assert.equal(host.textContent.includes("Actions admin inbox"), false);
w.happyDOM.abort();
console.log(
  "Actions UI passed: connection instructions, pending rollout, default-private points and admin separation.",
);
