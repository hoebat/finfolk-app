import assert from "node:assert/strict";
import {
  parseCommentCommand as parse,
  checkinDay,
} from "../backend/instagram-commands.mjs";
for (const text of ["/STATUS @finfolk.com.au", "@FinFolk.com.au /status"])
  assert.equal(parse(text).command, "status");
assert.equal(parse("nice beach @finfolk.com.au"), null);
assert.equal(parse("/checkin @another"), null);
assert.equal(parse("/checkin @finfolk.com.au.evil"), null);
for (const text of [
  "/status /checkin Bondi @finfolk.com.au",
  "/status foo @finfolk.com.au",
  "/unknown @finfolk.com.au",
  "/checkin Bondi\n/status @finfolk.com.au",
])
  assert.equal(parse(text).command, "help");
assert.deepEqual(parse("/checkin 2026-10-20 Bondi Beach @finfolk.com.au"), {
  command: "checkin",
  args: { beach: "Bondi Beach", day: "2026-10-20" },
});
for (const input of ["20/10/2026", "2026-xx-xx", "2026-10-20T12:00"]) {
  const parsed = parse("/checkin " + input + " Bondi Beach @finfolk.com.au");
  assert.equal(
    parsed.args.day,
    input,
    "Malformed dates must not silently become today",
  );
}
const base = {
  now: new Date("2026-10-31T03:00:00Z"),
  timezone: "Australia/Sydney",
  commentAt: "2026-10-31T01:00:00Z",
};
assert.deepEqual(checkinDay(base), { day: "2026-10-31" });
assert.deepEqual(checkinDay({ ...base, day: "2026-10-02" }), {
  day: "2026-10-02",
});
for (const day of ["2026-10-01", "2026-11-01", "2026-02-30", "bad"])
  assert.ok(checkinDay({ ...base, day }).error);
assert.ok(
  checkinDay({ ...base, commentAt: "2026-10-30T01:00:00Z" }).confirmation,
);
assert.ok(checkinDay({ ...base, commentAt: null }).confirmation);
// DST start: calendar-day arithmetic, not fixed hours.
assert.deepEqual(
  checkinDay({
    now: new Date("2026-10-04T16:00:00Z"),
    commentAt: "2026-10-04T13:01:00Z",
    timezone: "Australia/Sydney",
  }),
  { day: "2026-10-05" },
);
assert.ok(
  checkinDay({
    now: new Date("2026-10-04T13:01:00Z"),
    commentAt: "2026-10-04T12:59:00Z",
    timezone: "Australia/Sydney",
  }).confirmation,
);
console.log("Instagram comment parser, dates, DST and midnight checks passed.");
