import assert from "node:assert/strict";
import { Window } from "happy-dom";
const w = new Window({
  url: "https://finfolk.test/?view=account&tab=settings",
});
for (const name of ["document", "window", "location"])
  Object.defineProperty(globalThis, name, {
    value: w[name],
    configurable: true,
  });
const { renderMessagingSettings } = await import(
  "../web/messaging-settings.js"
);
const host = document.createElement("div");
document.body.append(host);
await renderMessagingSettings({
  host,
  api: {
    request: async () => {
      throw Object.assign(Error("Access denied"), { status: 403 });
    },
  },
});
assert.equal(host.children.length, 0, "Non-admin sees no controls");
const calls = [],
  state = {
    mode: "disabled",
    username: null,
    enabledCommands: ["ping", "help"],
    pilotSenderIds: [],
    health:{status:"attention",issues:["uncertain_replies"],pendingReplies:1,uncertainReplies:2,failedReplies:0,stalledCommands:0},
    blockers: ["token_missing"],
    checks: {},
    lastWebhookAt: null,
    lastCommandAt: null,
    lastProviderAcceptedAt: null,
  };
await renderMessagingSettings({
  host,
  api: {
    request: async (path, options) => {
      calls.push({ path, options });
      if (path.includes("events?"))
        return {
          events: [
            {
              id: "event",
              requestId: "request",
              command: "ping",
              state: "completed",
              senderId: "100",
              receivedAt: new Date().toISOString(),
              reply: { state: "uncertain" },
            },
          ],
        };
      return state;
    },
  },
});
assert.ok(host.textContent.includes("token_missing"));
assert.ok(host.textContent.includes("Delivery is uncertain"));
assert.ok(
  ![...host.querySelectorAll("button")].some(
    (b) => b.textContent === "Retry safely",
  ),
);
const form = host.querySelector("form");
form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 10));
const saved = calls.find((call) => call.options?.method === "PUT");
assert.deepEqual(saved.options.body, {
  mode: "disabled",
  enabledCommands: ["ping", "help"],
  pilotSenderIds: [],
});
assert.ok(saved.options.idempotencyKey);
assert.ok(!JSON.stringify(saved.options).includes("visibleRepliesConfirmed"));
w.happyDOM.abort();
assert.match(host.textContent,/Needs attention|Inspect uncertain replies/);
console.log(
  "MESSAGING_SETTINGS_PASS: admin separation, readiness blockers, explicit acceptance, idempotency and no uncertain resend.",
);
