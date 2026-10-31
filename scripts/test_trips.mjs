import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database } from "../backend/db.mjs";
import { tripAction, publicTrip, publicTrips } from "../backend/trips.mjs";
import { createAPI } from "../backend/api.mjs";
if (process.env.NEON_BRANCH !== "finfolk-regulars-dev")
  throw Error("Isolated test branch required");
const db = database(process.env.DATABASE_URL),
  q = db.query,
  tag = randomBytes(5).toString("hex"),
  owner = "trip_" + tag,
  other = "trip_other_" + tag,
  admin = "trip_admin_" + tag,
  env = { INSTAGRAM_ADMIN_IDS: admin };
const call = (action, v = {}, uid = owner) =>
  tripAction({ action, v, uid, q, env, verified: () => {} });
let id;
const draft = {
  title: "Synthetic nine-day Bondi trip",
  authorName: "Test diver",
  beachId: "bondi",
  start: "2026-10-15",
  end: "2026-10-23",
  story: "Synthetic test data only.",
  links: ["https://www.instagram.com/p/TEST" + tag + "/"],
  waterDays: Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => ["2026-10-" + (15 + i), 60]),
  ),
  claimedTotals: {},
};
const records = Array.from({ length: 155 }, (_, i) => ({
  day: "2026-10-" + (15 + (i % 9)),
  depthMetres: 5 + (i % 10),
  durationSeconds: 60 + (i % 30),
  sourceId: String(i + 1),
  timestamp: null,
  localTime: null,
  original: {
    dive_id: String(i + 1),
    heart_rate: "PRIVATE",
    coordinates: "PRIVATE",
  },
}));
try {
  for (const uid of [owner, other, admin])
    await q(
      "INSERT INTO finfolk.members(user_id,profile) VALUES($1,$2::jsonb)",
      [uid, JSON.stringify({ displayName: "Test", open: false })],
    );
  let saved = await call("tripSave", { draft });
  id = saved.id;
  await assert.rejects(call("tripGet", { id }, other), /unavailable/);
  await assert.rejects(publicTrip(q, id), /unavailable/);
  const upload = await call("tripImportBegin", { id, count: 155 });
  await call("tripImportBatch", {
    id,
    importId: upload.id,
    index: 0,
    rows: records.slice(0, 75),
  });
  await call("tripImportBatch", {
    id,
    importId: upload.id,
    index: 0,
    rows: records.slice(0, 75),
  });
  await assert.rejects(
    call("tripImportBatch", {
      id,
      importId: upload.id,
      index: 0,
      rows: records.slice(1, 76),
    }),
    /changed/,
  );
  await assert.rejects(
    call("tripImportConfirm", {
      id,
      importId: upload.id,
      revision: saved.revision,
    }),
    /count/,
  );
  await call("tripImportBatch", {
    id,
    importId: upload.id,
    index: 1,
    rows: records.slice(75),
  });
  let imported = await call("tripImportConfirm", {
    id,
    importId: upload.id,
    revision: saved.revision,
  });
  assert.equal(imported.rows, 155);
  assert.equal(
    (
      await call("tripImportConfirm", {
        id,
        importId: upload.id,
        revision: saved.revision,
      })
    ).unchanged,
    true,
  );
  let trip = await call("tripGet", { id });
  assert.equal(trip.preview.summary.total.dives, 155);
  assert.equal(trip.preview.summary.daily.length, 9);
  assert.equal(trip.preview.summary.total.waterMinutes, 540);
  assert.equal((await call("tripDives", { id })).rows.length, 100);
  await assert.rejects(
    call("tripPublish", {
      id,
      revision: trip.revision,
      publicConsent: false,
      ownPosts: true,
    }),
    /Confirm/,
  );
  assert.equal(
    (
      await call("tripPublish", {
        id,
        revision: trip.revision,
        publicConsent: true,
        ownPosts: true,
      })
    ).status,
    "pending",
  );
  await assert.rejects(publicTrip(q, id), /unavailable/);
  await assert.rejects(call("tripReviewInbox", {}, other), /Administrator/);
  let inbox = await call("tripReviewInbox", {}, admin);
  let review = inbox.trips.find((t) => t.id === id);
  await assert.rejects(
    call(
      "tripReview",
      { id, decision: "approve", reviewToken: review.review_token },
      admin,
    ),
    /Check/,
  );
  await call(
    "tripReview",
    {
      id,
      decision: "approve",
      reviewToken: review.review_token,
      ownershipChecked: true,
      beachChecked: true,
    },
    admin,
  );
  let published = await publicTrip(q, id);
  assert.equal(published.summary.total.dives, 155);
  assert.ok(!JSON.stringify(published).includes("PRIVATE"));
  assert.ok(!("records" in published));
  assert.ok(
    (await publicTrips(q, { beachId: "bondi" })).trips.some((t) => t.id === id),
  );
  const changed = {
    ...draft,
    title: "Edited private draft",
    claimedTotals: { dives: 999 },
  };
  saved = await call("tripSave", {
    id,
    revision: trip.revision,
    draft: changed,
  });
  trip = await call("tripGet", { id });
  assert.equal((await publicTrip(q, id)).title, draft.title);
  assert.equal(trip.preview.discrepancies.length, 1);
  await assert.rejects(
    call("tripPublish", {
      id,
      revision: trip.revision,
      publicConsent: true,
      ownPosts: true,
    }),
    /differences/,
  );
  await call("tripPublish", {
    id,
    revision: trip.revision,
    publicConsent: true,
    ownPosts: true,
    discrepanciesConfirmed: true,
  });
  // A stale review token cannot approve changed content.
  await assert.rejects(
    call(
      "tripReview",
      {
        id,
        decision: "approve",
        reviewToken: review.review_token,
        ownershipChecked: true,
        beachChecked: true,
      },
      admin,
    ),
    /changed/,
  );
  inbox = await call("tripReviewInbox", {}, admin);
  review = inbox.trips.find((t) => t.id === id);
  await call(
    "tripReview",
    {
      id,
      decision: "approve",
      reviewToken: review.review_token,
      ownershipChecked: true,
      beachChecked: true,
    },
    admin,
  );
  assert.equal((await publicTrip(q, id)).title, "Edited private draft");
  const again = await call("tripImportBegin", { id, count: records.length });
  await call("tripImportBatch", {
    id,
    importId: again.id,
    index: 0,
    rows: records,
  });
  const repeated = await call("tripImportConfirm", {
    id,
    importId: again.id,
    revision: trip.revision,
  });
  assert.equal(repeated.unchanged, true);
  assert.equal(
    (await call("tripGet", { id })).preview.summary.total.dives,
    155,
  );
  const replacement = await call("tripImportBegin", { id, count: 1 });
  await call("tripImportBatch", {
    id,
    importId: replacement.id,
    index: 0,
    rows: [records[0]],
  });
  await assert.rejects(
    call("tripImportConfirm", {
      id,
      importId: replacement.id,
      revision: trip.revision,
    }),
    /replacing/,
  );
  await call("tripImportConfirm", {
    id,
    importId: replacement.id,
    revision: trip.revision,
    replace: true,
  });
  assert.equal((await call("tripGet", { id })).preview.summary.total.dives, 1);
  assert.equal((await publicTrip(q, id)).summary.total.dives, 155);
  const app = createAPI({
    db,
    verify: async () => {
      throw Error("No auth");
    },
  });
  let response = await app.request("/trips/" + id);
  assert.equal(response.status, 200);
  assert.ok(!JSON.stringify(await response.json()).includes("PRIVATE"));
  await call("tripReport", { id, reason: "Test trip report" }, other);
  assert.ok(
    (await call("tripReviewInbox", {}, admin)).reports.some((r) => r.id === id),
  );
  await call("tripUnpublish", { id });
  await assert.rejects(publicTrip(q, id), /unavailable/);
  assert.equal((await call("tripGet", { id })).preview.summary.total.dives, 1);
  const latest = await call("tripGet", { id });
  await call("tripSave", {
    id,
    revision: latest.revision,
    draft: { ...latest.draft, waterDays: {}, waterTotalMinutes: 1230 },
  });
  const withWater = await call("tripGet", { id });
  assert.equal(withWater.preview.summary.total.waterMinutes, 1230);
  assert.equal(withWater.preview.summary.total.waterTimeSource, "trip_total");
  await call("tripDelete", { id });
  assert.equal(
    (await q("SELECT id FROM finfolk.trip_imports WHERE trip_id=$1", [id]))
      .length,
    0,
  );
  console.log(
    "TRIP_DATABASE_PASS: 155 synthetic dives / nine days, private ownership, retry-safe batches, review, public privacy, snapshots, discrepancy consent, reimport, replacement and withdrawal.",
  );
} finally {
  if (id) await q("DELETE FROM finfolk.trips WHERE id=$1", [id]);
  for (const uid of [owner, other, admin]) {
    await q("DELETE FROM finfolk.reports WHERE owner_id=$1", [uid]);
    await q("DELETE FROM finfolk.members WHERE user_id=$1", [uid]);
  }
  await db.pool.end();
}
