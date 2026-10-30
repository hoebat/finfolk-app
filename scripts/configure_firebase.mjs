import { readFile, writeFile } from "node:fs/promises";
import { instagramHandle } from "../web/logbook-model.js";
const file = process.argv[2];
if (!file)
  throw Error(
    "Usage: node scripts/configure_firebase.mjs <web-config.json> [--instagram HANDLE] [--enable] [--enable-instagram]",
  );
const input = JSON.parse(await readFile(file, "utf8"));
const firebase =
  input.result?.sdkConfig || input.sdkConfig || input.firebase || input;
for (const key of [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "appId",
])
  if (typeof firebase[key] !== "string" || !firebase[key])
    throw Error(`Missing Firebase web configuration: ${key}`);
const index = process.argv.indexOf("--instagram");
const config = {
  enabled: process.argv.includes("--enable"),
  firebase,
  functionsRegion: "australia-southeast1",
  instagram: { enabled: process.argv.includes("--enable-instagram") && process.argv.includes("--enable") },
  instagramHandle: instagramHandle(
    index >= 0 ? process.argv[index + 1] || "finfolk.com.au" : "finfolk.com.au",
  ),
};
await writeFile(
  new URL("../web/firebase-config.json", import.meta.url),
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  `Configured ${firebase.projectId}. Accounts ${config.enabled ? "enabled" : "disabled"}. Web config contains public identifiers, never service-account credentials.`,
);
