// Server-side setup only. Uses the operator's Application Default Credentials.
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const project = process.argv[2];
if (!project || project.startsWith("--"))
  throw Error(
    "Usage: node scripts/configure_instagram.mjs PROJECT [--admin UID] [--pilot UID ...] [--enable]",
  );
const { initializeApp } = require("firebase-admin/app"),
  { getFirestore } = require("firebase-admin/firestore"),
  { getAuth } = require("firebase-admin/auth");
initializeApp({ projectId: project });
const at = process.argv.indexOf("--admin");
if (at >= 0) {
  const uid = process.argv[at + 1];
  if (!uid || uid.startsWith("--")) throw Error("Supply an administrator UID.");
  const auth = getAuth(),
    user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, {
    ...user.customClaims,
    instagramAdmin: true,
  });
}
const pilots = process.argv.flatMap((arg, i) =>
  arg === "--pilot" ? [process.argv[i + 1]] : [],
);
if (pilots.some((p) => !p || p.startsWith("--")))
  throw Error("Supply a UID for every --pilot.");
if (process.argv.includes("--enable") && !pilots.length)
  throw Error("At least one pilot UID is required.");
await getFirestore()
  .doc("system/instagram")
  .set(
    {
      enabled: process.argv.includes("--enable"),
      pilotOnly: true,
      pilotUids: pilots,
      autoVerification: false,
      updatedAt: new Date(),
    },
    { merge: true },
  );
console.log(
  `Instagram ${process.argv.includes("--enable") ? "enabled for named pilot members" : "disabled"} in ${project}. Sign in again to refresh administrator claims.`,
);
