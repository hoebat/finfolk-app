import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import SwaggerParser from "@apidevtools/swagger-parser";
import {
  seal,
  unseal,
  modeAllows,
  commands,
} from "../backend/messaging-config.mjs";
import { InstagramProvider } from "../backend/instagram-provider.mjs";
import { parseInstagramCommand } from "../backend/instagram-dm-commands.mjs";
import { readLimited } from "../backend/messaging-http.mjs";
const api = await SwaggerParser.validate("docs/openapi/messaging.yaml");
assert.equal(api.openapi, "3.0.3");
assert.ok(api.paths["/v1/me/instagram/claims"]);
const env = {
  MESSAGING_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};
const box = seal({ command: "SECRET" }, env, "alice:key");
assert.ok(!box.includes("SECRET"));
assert.deepEqual(unseal(box, env, "alice:key"), { command: "SECRET" });
assert.throws(() => unseal(box, env, "bob:key"));
assert.throws(() => seal({}, {}, "alice"));
assert.equal(parseInstagramCommand("/PING").command, "ping");
assert.equal(parseInstagramCommand("/ping extra").command, "unknown");
assert.equal(
  modeAllows(
    { mode: "pilot", pilot_sender_ids: ["100"], enabled_commands: ["ping"] },
    "100",
    "ping",
  ),
  true,
);
assert.equal(
  modeAllows(
    { mode: "pilot", pilot_sender_ids: ["100"], enabled_commands: ["ping"] },
    "101",
    "ping",
  ),
  false,
);
assert.equal(
  modeAllows(
    { mode: "disabled", pilot_sender_ids: [], enabled_commands: ["ping"] },
    "100",
    "ping",
  ),
  false,
);
let sent;
const config = {
  accountId: "900",
  appId: "777",
  metaAppId: "778",
  token: "secret",
  graphVersion: "v26.0",
};
const provider = new InstagramProvider(config, async (url, options) => {
  assert.equal(new URL(url).origin, "https://graph.instagram.com");
  assert.equal(options.headers.Authorization, "Bearer secret");
  assert.ok(!String(url).includes("secret"));
  sent = options.body;
  return {
    ok: true,
    json: async () =>
      options.method === "POST"
        ? { message_id: "accepted" }
        : { id: "100", username: "ChrisZFree", is_user_follow_business: true },
  };
});
assert.deepEqual(await provider.profile("100"), {
  handle: "chriszfree",
  follows: true,
});
assert.equal(await provider.sendText("100", "Pong."), "accepted");
assert.deepEqual(JSON.parse(sent), {
  recipient: { id: "100" },
  message: { text: "Pong." },
});
const malformed = new InstagramProvider(config, async () => ({
  ok: true,
  json: async () => ({
    id: "other",
    username: "alice",
    is_user_follow_business: true,
  }),
}));
await assert.rejects(() => malformed.profile("100"), {
  code: "follow_lookup_unverified",
});
const limited = new InstagramProvider(config, async () => ({
  ok: false,
  status: 429,
  headers: new Headers({ "retry-after": "45" }),
  json: async () => ({ error: { code: 4 } }),
}));
await assert.rejects(
  () => limited.sendText("100", "test"),
  (error) =>
    error.code === "provider_rate_limited" &&
    error.definiteRejection &&
    error.retryAfter === 45,
);
const unavailable = new InstagramProvider(config, async () => ({
  ok: false,
  status: 503,
  json: async () => ({ error: { message: "DO NOT LEAK" } }),
}));
await assert.rejects(
  () => unavailable.sendText("100", "test"),
  (error) =>
    error.code === "provider_response_uncertain" &&
    !error.message.includes("LEAK"),
);
const token = new InstagramProvider(config, async () => ({
  ok: false,
  status: 400,
  json: async () => ({ error: { code: 190 } }),
}));
await assert.rejects(() => token.sendText("100", "test"), {
  code: "token_invalid",
});
await assert.rejects(
  () =>
    readLimited(
      new Request("https://test", { method: "POST", body: "🐠".repeat(10) }),
      20,
    ),
  { status: 413 },
);
const bytes = await readLimited(
  new Request("https://test", { method: "POST", body: "hello" }),
  5,
);
assert.equal(new TextDecoder().decode(bytes), "hello");
// Contract surface is intentionally event-bound, without a generic public send API.
assert.ok(
  !Object.keys(api.paths).some((path) =>
    /messages\/send|\/recipients/.test(path),
  ),
);
for (const [name, command] of Object.entries(commands)) {
  assert.ok(command.syntax.startsWith("/" + name));
  assert.equal(typeof command.claimed, "boolean");
}
const source = await readFile("backend/messaging-api.mjs", "utf8");
for (const [path, item] of Object.entries(api.paths)) {
  if (path === "/instagram/webhook") continue;
  for (const method of Object.keys(item)) {
    if (!["get", "post", "put", "delete"].includes(method)) continue;
    assert.ok(
      source.includes(path.replace("{id}", ":id")),
      path + " has a handler",
    );
  }
}
console.log(
  "MESSAGING_CONTRACT_PASS: OpenAPI, encryption/AAD, command registry, rollout policy, provider classification, bounded UTF-8 bodies and route coverage.",
);
