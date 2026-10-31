import assert from "node:assert/strict";
import { Window } from "happy-dom";
const w = new Window({
  url: "https://finfolk.com.au/?view=trip&trip=00000000-0000-0000-0000-000000000001",
});
globalThis.document = w.document;
globalThis.location = w.location;
globalThis.URL = w.URL;
const { reportBody } = await import("../web/trip-report.js");
const { importChunks } = await import("../web/trips.js");
const { aggregateDives } = await import("../web/trip-model.js");
const { routeFromURL } = await import("../web/mobile-shell.js");
let requests = 0;
globalThis.fetch = async () => {
  requests++;
  return Response.json({});
};
const summary = aggregateDives(
  [{ day: "2026-10-15", depthMetres: 8, durationSeconds: 60 }],
  "2026-10-15",
  "2026-10-23",
);
const report = reportBody({
  title: "<script>unsafe</script>",
  authorName: "Diver",
  start: "2026-10-15",
  end: "2026-10-23",
  beachName: "Bondi",
  timezone: "Australia/Sydney",
  summary,
  links: ["https://www.instagram.com/p/ABC/"],
  story: "Trip story",
});
document.body.append(report);
assert.equal(report.querySelector("script"), null);
assert.equal(report.querySelectorAll("tbody tr").length, 9);
assert.equal(report.querySelectorAll("iframe").length, 0);
assert.equal(requests, 0);
assert.ok(
  report.textContent.includes("Individual dive records remain private"),
);
assert.ok(!report.textContent.includes("PRIVATE"));
assert.equal(routeFromURL(location.href).view, "trip");
const rows = Array.from({ length: 1000 }, () => ({
  day: "2026-10-15",
  depthMetres: 8,
  durationSeconds: 60,
  original: { note: "x".repeat(100) },
}));
const chunks = importChunks(rows);
assert.equal(chunks.flat().length, 1000);
assert.ok(
  chunks.every(
    (c) =>
      c.length <= 200 &&
      new TextEncoder().encode(JSON.stringify(c)).length <= 45000,
  ),
);
console.log(
  "TRIP_UI_PASS: public route, nine-day table, escaped story/title, lazy embeds, privacy notice and bounded upload batches.",
);

const { tripCards } = await import("../web/trip-report.js");
const detached = document.createElement("section");
document.body.append(detached);
globalThis.fetch = async () =>
  Response.json({ trips: [{ id: "old", title: "Wrong beach" }] });
await tripCards(detached, "https://api.finfolk.com.au/", {
  beachId: "bondi",
  isCurrent: () => false,
});
assert.equal(detached.children.length, 0);

w.happyDOM.abort();
