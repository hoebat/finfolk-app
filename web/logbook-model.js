export const MAX_PHOTOS = 6,
  MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export function instagramHandle(value = "") {
  let text = value.trim();
  if (/^https?:/i.test(text)) {
    let u;
    try {
      u = new URL(text);
    } catch {
      throw Error("Enter an Instagram handle or profile link.");
    }
    if (
      !["instagram.com", "www.instagram.com"].includes(u.hostname) ||
      !/^\/[A-Za-z0-9._]+\/?$/.test(u.pathname)
    )
      throw Error("Use an Instagram profile link.");
    text = u.pathname.replaceAll("/", "");
  }
  text = text.replace(/^@/, "");
  if (text && !/^[A-Za-z0-9._]{1,30}$/.test(text))
    throw Error(
      "Instagram handles can contain letters, numbers, dots and underscores.",
    );
  if (
    ["p", "reel", "stories", "explore", "accounts"].includes(text.toLowerCase())
  )
    throw Error("Use a profile handle, rather than a post link.");
  return text;
}
export const instagramURL = (handle) =>
  handle ? `https://www.instagram.com/${instagramHandle(handle)}/` : null;
export function sessionInput(values) {
  const date = String(values.date || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
  )
    throw Error("Choose a valid session date.");
  const locationName = String(values.locationName || "").trim();
  if (!locationName || locationName.length > 160)
    throw Error("Enter a location name (up to 160 characters).");
  const optional = (v, max, label) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max)
      throw Error(`${label} must be between 0 and ${max}.`);
    return n;
  };
  const notes = String(values.notes || "");
  if (notes.length > 10000)
    throw Error("Notes must be under 10,000 characters.");
  const point = values.point ?? null;
  if (
    point !== null &&
    (!Array.isArray(point) ||
      point.length !== 2 ||
      !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 85)
  )
    throw Error("Invalid map location.");
  return {
    date,
    locationName,
    beachId: String(values.beachId || "").slice(0, 200),
    point,
    durationMinutes: optional(values.durationMinutes, 1440, "Duration"),
    maxDepthMetres: optional(values.maxDepthMetres, 300, "Maximum depth"),
    notes,
  };
}
export function sessionLink(id, base = globalThis.location?.href) {
  const u = new URL(base);
  u.search = "";
  u.hash = "";
  u.searchParams.set("view", "logbook");
  u.searchParams.set("session", id);
  return u.href;
}
export function profileLink(id, base = globalThis.location?.href) {
  const u = new URL(sessionLink(id, base));
  u.searchParams.delete("session");
  u.searchParams.set("profile", id);
  return u.href;
}
export async function compressPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(
      "Choose a JPEG, PNG or WebP image. Convert HEIC photos before uploading.",
    );
  if (file.size > 25 * 1024 * 1024)
    throw Error("Choose a source photo smaller than 25 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const c = canvas.getContext("2d");
    c.fillStyle = "#fff";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.55, 0.38]) {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
    }
    throw Error("This image remains too large. Choose a smaller photo.");
  } finally {
    bitmap.close();
  }
}
