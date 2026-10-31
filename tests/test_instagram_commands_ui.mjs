import assert from "node:assert/strict";
import { Window } from "happy-dom";
const w = new Window({ url: "https://finfolk.test/?view=account" });
for (const key of ["window", "document", "navigator", "Option"])
  Object.defineProperty(globalThis, key, { value: w[key], configurable: true });
const { renderCommentCommands } = await import("../web/instagram-commands.js");
const host = document.createElement("div");
document.body.append(host);
const calls = [];
const api = {
  call: async (action, v) => {
    calls.push({ action, v });
    if (action === "instagramCommandStatus")
      return {
        enabled: true,
        checkins: true,
        commands: [
          {
            id: "123",
            command: "checkin",
            state: "confirmation",
            send_state: "sent",
            result: "Confirm your visit.",
          },
        ],
      };
    if (action === "instagramCommandVerify")
      return { command: "/me " + "a".repeat(24) + " @finfolk.com.au" };
    return { saved: true };
  },
};
await renderCommentCommands({
  host,
  api,
  beaches: [{ id: "bondi", name: "Bondi Beach" }],
});
assert.equal(host.querySelector("details").open, false);
assert.match(host.textContent, /\/checkin/);
assert.ok(!host.textContent.includes("Command activity and reply review"));
const button = (text) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === text);
button("Verify Instagram comments").click();
await new Promise((r) => setTimeout(r, 15));
assert.match(
  host.querySelector("[readonly]").value,
  /^\/me [a-f0-9]{24} @finfolk.com.au$/,
);
host.querySelector("select").value = "bondi";
host.querySelector("[type=date]").value = "2026-10-20";
button("Confirm my visit").click();
await new Promise((r) => setTimeout(r, 15));
assert.deepEqual(calls.find((c) => c.action === "instagramCommandConfirm").v, {
  id: "123",
  beachId: "bondi",
  day: "2026-10-20",
});
assert.match(host.textContent, /Check-in saved/);
host.replaceChildren();
await renderCommentCommands({
  host,
  api: { call: async () => ({ enabled: false, commands: [] }) },
});
assert.match(host.textContent, /in preparation/);
assert.equal(host.querySelector("button"), null);
host.replaceChildren();
await renderCommentCommands({
  host,
  api: {
    call: async () => {
      throw Error("Offline");
    },
  },
});
assert.match(host.textContent, /Offline/);
w.happyDOM.abort();
console.log(
  "Comment command UI passed: compact panel, verification, private date/location confirmation, rollout and error states.",
);
