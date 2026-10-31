import { messagingError } from "./messaging-config.mjs";
export async function readLimited(request, maximum) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximum)
    throw messagingError("body_too_large", "Request body is too large.", 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw messagingError(
          "body_too_large",
          "Request body is too large.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
