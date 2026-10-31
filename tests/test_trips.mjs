import assert from "node:assert/strict";
import {
  parseDiveCSV,
  mapDiveCSV,
  normalizeDiveRecord,
  aggregateDives,
  tripURL,
} from "../web/trip-model.js";
import { tripDraft } from "../backend/trips.mjs";
const mapping = {
  date: "date",
  depth: "depth",
  duration: "duration",
  id: "id",
  dateFormat: "dmy",
  depthUnit: "m",
  durationUnit: "seconds",
};
const csv = parseDiveCSV(
  '\uFEFFdate,depth,duration,id,note\r\n15/10/2026,10,60,1,"some, notes"\r\n15/10/2026,20,90,2,"two\nlines"\r\n23/10/2026,30,120,3,plain\r\n',
);
assert.equal(csv.rows[1][4], "two\nlines");
const parsed = mapDiveCSV(csv, mapping, "Australia/Sydney");
assert.equal(parsed.errors.length, 0);
assert.equal(parsed.records.length, 3);
assert.equal(parsed.records[0].timestamp, null);
let stats = aggregateDives(parsed.records, "2026-10-15", "2026-10-23", {
  "2026-10-15": 60,
  "2026-10-23": 90,
});
assert.equal(stats.daily.length, 9);
assert.equal(stats.total.dives, 3);
assert.equal(stats.total.daysWithDives, 2);
assert.equal(stats.total.averageDepthMetres, 20);
assert.equal(stats.total.medianDepthMetres, 20);
assert.equal(stats.total.totalDiveSeconds, 270);
assert.equal(stats.total.waterMinutes, 150);
assert.equal(stats.daily[1].dives, 0);
assert.equal(stats.daily[1].maxDepthMetres, null);
const weighted = aggregateDives(
  [
    { day: "2026-10-15", depthMetres: 10, durationSeconds: 50 },
    { day: "2026-10-15", depthMetres: 20, durationSeconds: 60 },
    { day: "2026-10-16", depthMetres: 60, durationSeconds: null },
  ],
  "2026-10-15",
  "2026-10-16",
);
assert.equal(weighted.total.averageDepthMetres, 30);
assert.equal(weighted.total.totalDiveSeconds, null);
const units = mapDiveCSV(
  parseDiveCSV("date;depth;duration;id\n15/10/2026;10;1:15;x\n", ";"),
  { ...mapping, depthUnit: "ft", durationUnit: "clock" },
  "Australia/Sydney",
);
assert.equal(units.records[0].durationSeconds, 75);
assert.equal(units.records[0].depthMetres, 3.048);
const zoned = mapDiveCSV(
  parseDiveCSV("date,depth,duration\n2026-10-15T23:30:00Z,8,60\n"),
  { ...mapping, dateFormat: "iso" },
  "Australia/Sydney",
);
assert.equal(zoned.records[0].day, "2026-10-16");
const dup = mapDiveCSV(
  parseDiveCSV(
    "date,depth,duration,id\n15/10/2026,8,60,1\n15/10/2026,8,60,1\n",
  ),
  mapping,
  "Australia/Sydney",
);
assert.equal(dup.duplicates.length, 1);
assert.equal(dup.records.length, 2);
assert.throws(() => parseDiveCSV("a,a\n1,2"), /headers/);
assert.throws(() => parseDiveCSV('a,b\n"broken,2'), /unfinished/);
assert.throws(
  () => aggregateDives(parsed.records, "2026-10-16", "2026-10-23"),
  /outside/,
);
assert.throws(
  () => normalizeDiveRecord({ day: "2026-02-30", depthMetres: 1 }),
  /date/,
);
assert.throws(
  () => normalizeDiveRecord({ day: "2026-10-15", depthMetres: -1 }),
  /Depth/,
);
assert.equal(
  mapDiveCSV(
    parseDiveCSV("date,depth,duration\n2026-02-30T12:00:00Z,8,60"),
    { ...mapping, dateFormat: "iso" },
    "Australia/Sydney",
  ).errors.length,
  1,
);
assert.equal(
  new URL(tripURL("abc", "https://finfolk.com.au/?view=maps")).searchParams.get(
    "view",
  ),
  "trip",
);
const draft = tripDraft({
  title: "Bondi",
  authorName: "Diver",
  beachId: "bondi",
  start: "2026-10-15",
  end: "2026-10-23",
  links: ["https://www.instagram.com/p/De5ihb-H5ie/?img_index=1"],
  story: "",
});
assert.equal(draft.links[0], "https://www.instagram.com/p/De5ihb-H5ie/");
assert.throws(
  () => tripDraft({ ...draft, links: ["javascript:alert(1)"] }),
  /Instagram/,
);
console.log(
  "TRIP_MODEL_PASS: CSV quoting, nine days, per-dive averages, distinct water time, units, dates/timezones, missing values and duplicates.",
);

assert.equal(
  mapDiveCSV(
    parseDiveCSV("date,depth\n2026-10-15,8"),
    {
      date: "date",
      depth: "depth",
      duration: "",
      dateFormat: "iso",
      depthUnit: "m",
      durationUnit: "",
    },
    "Australia/Sydney",
  ).errors.length,
  0,
);
