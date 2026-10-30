import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function fail(message, code = "failed-precondition") {
  const e = Error(message);
  e.code = code;
  throw e;
}
export function handle(value) {
  const h = String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(h))
    fail("Enter your Instagram username.", "invalid-argument");
  return h;
}
export function validSignature(raw, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature || "")) return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    createHmac("sha256", secret).update(raw).digest(),
  );
}
export function mediaInput(m) {
  if (!/^\d{1,40}$/.test(String(m?.id || "")))
    fail("Invalid media ID.", "invalid-argument");
  let url;
  try {
    url = new URL(m.permalink);
  } catch {
    fail("Invalid Instagram post.", "invalid-argument");
  }
  if (
    url.protocol !== "https:" ||
    !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/(p|reel)\/[\w-]+\/?$/.test(url.pathname)
  )
    fail("Invalid Instagram post.", "invalid-argument");
  if (!["IMAGE", "VIDEO", "CAROUSEL_ALBUM"].includes(m.media_type))
    fail("Unsupported Instagram media.", "invalid-argument");
  const postedAt = new Date(m.timestamp);
  if (!Number.isFinite(+postedAt))
    fail("Missing post date.", "invalid-argument");
  return {
    id: String(m.id),
    url: `https://www.instagram.com${url.pathname.replace(/\/$/, "")}/`,
    caption: String(m.caption || "").slice(0, 2200),
    username: m.username ? handle(m.username) : "",
    postedAt,
    mediaType: m.media_type,
  };
}
const words = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function matchBeach(caption, beaches) {
  const text = ` ${words(caption)} `;
  const matches = beaches.filter(
    (b) => words(b.name).length >= 5 && text.includes(` ${words(b.name)} `),
  );
  return matches.length === 1 ? matches[0] : null;
}
export function eligible(connection, postedAt, now) {
  return (
    connection?.status === "verified" &&
    connection.importsEnabled === true &&
    connection.consentVersion === 1 &&
    +postedAt >= +connection.importSince &&
    +postedAt <= +now
  );
}
