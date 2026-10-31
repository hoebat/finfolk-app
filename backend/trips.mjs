import { createHash } from "node:crypto";
import {
  dateRange,
  normalizeDiveRecord,
  aggregateDives,
} from "../web/trip-model.js";
import { socialPostURL } from "../web/media.js";
import { isInstagramAdmin } from "./instagram-actions.mjs";
const fail = (m, status = 400) => {
  throw Object.assign(Error(m), { status });
};
const uuid = (v) => {
  if (
    typeof v !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
  )
    fail("Invalid trip identifier.");
  return v;
};
const validate = (fn) => {
  try {
    return fn();
  } catch (e) {
    fail(e.message);
  }
};
const text = (v, n) => {
  if (typeof v !== "string" || v.length > n)
    fail("Trip text is too long or invalid.");
  return v.trim();
};
export function tripDraft(v) {
  if (!v || typeof v !== "object") fail("Enter trip details.");
  const days = validate(() => dateRange(v.start, v.end)),
    title = text(v.title, 160),
    authorName = text(v.authorName || "Diver", 80);
  if (!title || !authorName) fail("Add a title and public author name.");
  if (
    typeof v.beachId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(v.beachId)
  )
    fail("Choose a beach.");
  if (!Array.isArray(v.links) || v.links.length > 10)
    fail("Use up to ten Instagram links.");
  const links = [
    ...new Set(
      v.links.map((link) => {
        const parsed = socialPostURL(link);
        if (parsed?.platform !== "instagram")
          fail("Use a public Instagram post or reel link.");
        return parsed.url;
      }),
    ),
  ];
  const waterDays = v.waterDays || {};
  if (typeof waterDays !== "object" || Array.isArray(waterDays))
    fail("Invalid water-time entries.");
  for (const [day, value] of Object.entries(waterDays))
    if (
      !days.includes(day) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1440
    )
      fail("Enter daily water time within the trip, up to 1,440 minutes.");
  const waterTotalMinutes =
    v.waterTotalMinutes === null ||
    v.waterTotalMinutes === undefined ||
    v.waterTotalMinutes === ""
      ? null
      : Number(v.waterTotalMinutes);
  if (
    waterTotalMinutes !== null &&
    (!Number.isFinite(waterTotalMinutes) ||
      waterTotalMinutes < 0 ||
      waterTotalMinutes > days.length * 1440)
  )
    fail("Enter a valid trip water-time total.");
  const claimedTotals = {};
  for (const key of [
    "dives",
    "maxDepthMetres",
    "totalDiveSeconds",
    "waterMinutes",
  ]) {
    const value = v.claimedTotals?.[key];
    if (value !== null && value !== undefined && value !== "") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1e8
      )
        fail("Invalid comparison total.");
      claimedTotals[key] = value;
    }
  }
  return {
    title,
    authorName,
    beachId: v.beachId,
    start: v.start,
    end: v.end,
    story: text(v.story || "", 10000),
    links,
    waterDays,
    claimedTotals,
    waterTotalMinutes,
  };
}
async function owned(q, id, uid) {
  const row = (
    await q("SELECT * FROM finfolk.trips WHERE id=$1::uuid AND owner_id=$2", [
      uuid(id),
      uid,
    ])
  )[0];
  if (!row) fail("Trip unavailable.", 404);
  return row;
}
async function snapshot(q, trip) {
  const draft = tripDraft(trip.draft),
    beach = (
      await q("SELECT id,name,timezone FROM finfolk.beaches WHERE id=$1", [
        draft.beachId,
      ])
    )[0];
  if (!beach) fail("Beach is unavailable.");
  const rows = trip.active_import
    ? await q(
        "SELECT data FROM finfolk.trip_dives WHERE import_id=$1 ORDER BY ordinal",
        [trip.active_import],
      )
    : [];
  const summary = aggregateDives(
    rows.map((r) => r.data),
    draft.start,
    draft.end,
    draft.waterDays,
  );
  const dailyWater = summary.total.waterMinutes;
  summary.total.waterTimeSource = dailyWater === null ? null : "daily";
  if (dailyWater === null && draft.waterTotalMinutes !== null) {
    summary.total.waterMinutes = draft.waterTotalMinutes;
    summary.total.waterTimeSource = "trip_total";
  }
  const discrepancies = Object.entries(draft.claimedTotals)
    .filter(
      ([key, value]) =>
        summary.total[key] === null ||
        Math.abs(summary.total[key] - value) > 0.01,
    )
    .map(([metric, expected]) => ({
      metric,
      entered: expected,
      calculated: summary.total[metric],
    }));
  if (
    dailyWater !== null &&
    draft.waterTotalMinutes !== null &&
    Math.abs(dailyWater - draft.waterTotalMinutes) > 0.01
  )
    discrepancies.push({
      metric: "waterMinutes",
      entered: draft.waterTotalMinutes,
      calculated: dailyWater,
    });
  return {
    title: draft.title,
    authorName: draft.authorName,
    story: draft.story,
    beachId: beach.id,
    beachName: beach.name,
    timezone: beach.timezone,
    start: draft.start,
    end: draft.end,
    links: draft.links,
    summary,
    discrepancies,
    selfReported: true,
  };
}
export async function publicTrip(q, id) {
  const row = (
    await q(
      "SELECT t.id,t.published,t.published_at FROM finfolk.trips t JOIN finfolk.members m ON m.user_id=t.owner_id WHERE t.id=$1::uuid AND t.published IS NOT NULL AND m.deleted=false",
      [uuid(id)],
    )
  )[0];
  if (!row)
    fail("This trip report is unavailable or no longer published.", 404);
  const p = row.published;
  return {
    id: row.id,
    title: p.title,
    authorName: p.authorName,
    story: p.story,
    beachId: p.beachId,
    beachName: p.beachName,
    timezone: p.timezone,
    start: p.start,
    end: p.end,
    links: p.links,
    summary: p.summary,
    selfReported: true,
    publishedAt: row.published_at,
  };
}
export async function publicTrips(q, { beachId, ownerId } = {}) {
  for (const value of [beachId, ownerId])
    if (
      value !== undefined &&
      (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    )
      fail("Invalid trip filter.");
  const rows = await q(
    "SELECT t.id,t.published,t.published_at FROM finfolk.trips t JOIN finfolk.members m ON m.user_id=t.owner_id WHERE t.published IS NOT NULL AND m.deleted=false AND ($1::text IS NULL OR t.published->>'beachId'=$1) AND ($2::text IS NULL OR t.owner_id=$2) ORDER BY t.published_at DESC,t.id DESC LIMIT 20",
    [beachId || null, ownerId || null],
  );
  return {
    trips: rows.map((r) => ({
      id: r.id,
      title: r.published.title,
      authorName: r.published.authorName,
      beachId: r.published.beachId,
      beachName: r.published.beachName,
      start: r.published.start,
      end: r.published.end,
      total: r.published.summary.total,
      publishedAt: r.published_at,
    })),
  };
}
export const tripActions = new Set([
  "tripSave",
  "tripList",
  "tripGet",
  "tripDives",
  "tripImportBegin",
  "tripImportBatch",
  "tripImportConfirm",
  "tripPreview",
  "tripPublish",
  "tripUnpublish",
  "tripDelete",
  "tripReviewInbox",
  "tripReview",
  "tripReport",
]);
export async function tripAction({ action, v, uid, q, env, verified }) {
  if (action === "tripList")
    return q(
      "SELECT id,draft,revision,active_import,published IS NOT NULL AS published,pending IS NOT NULL AS pending,updated_at FROM finfolk.trips WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 100",
      [uid],
    );
  if (action === "tripReviewInbox") {
    if (!isInstagramAdmin(uid, env))
      fail("Administrator access required.", 403);
    return {
      trips: await q(
        "SELECT id,pending,owner_id,md5(pending::text) AS review_token FROM finfolk.trips WHERE pending IS NOT NULL ORDER BY updated_at LIMIT 100",
      ),
      reports: await q(
        "SELECT r.id AS report_id,r.target_id,r.reason,t.id,t.published,md5(t.published::text) AS review_token FROM finfolk.reports r JOIN finfolk.trips t ON r.target_id='trip:'||t.id::text WHERE t.published IS NOT NULL ORDER BY r.created_at DESC LIMIT 100",
      ),
    };
  }
  if (action === "tripReview") {
    verified();
    if (!isInstagramAdmin(uid, env))
      fail("Administrator access required.", 403);
    const id = uuid(v.id);
    if (!["approve", "reject", "remove"].includes(v.decision))
      fail("Choose a review decision.");
    if (
      v.decision === "approve" &&
      (v.ownershipChecked !== true || v.beachChecked !== true)
    )
      fail("Check Instagram ownership, consent and beach location first.");
    const row = (
      await q(
        "WITH changed AS (UPDATE finfolk.trips SET published=CASE WHEN $2='approve' THEN pending WHEN $2='remove' THEN NULL ELSE published END,published_at=CASE WHEN $2='approve' THEN now() ELSE published_at END,pending=NULL,updated_at=now() WHERE id=$1 AND ($2='remove' OR pending IS NOT NULL) AND (($2='remove' AND ($4=md5(published::text) OR $4=md5(pending::text))) OR ($2<>'remove' AND $4=md5(pending::text))) RETURNING id) INSERT INTO finfolk.trip_reviews(trip_id,actor,decision) SELECT id,$3,$2 FROM changed RETURNING trip_id",
        [id, v.decision, uid, v.reviewToken],
      )
    )[0];
    if (!row) fail("This review has changed. Reload the inbox.", 409);
    return { ok: true };
  }
  if (action === "tripReport") {
    verified();
    const reason = text(v.reason || "", 1000);
    if (!reason) fail("Describe the issue.");
    await publicTrip(q, v.id);
    await q(
      "INSERT INTO finfolk.reports(owner_id,target_id,reason) VALUES($1,$2,$3)",
      [uid, "trip:" + uuid(v.id), reason],
    );
    return { ok: true };
  }
  if (action === "tripSave") {
    const draft = tripDraft(v.draft);
    if (
      !(await q("SELECT id FROM finfolk.beaches WHERE id=$1", [draft.beachId]))
        .length
    )
      fail("Choose a directory beach.");
    if (!v.id)
      return (
        await q(
          "INSERT INTO finfolk.trips(owner_id,draft) VALUES($1,$2::jsonb) RETURNING id,revision",
          [uid, JSON.stringify(draft)],
        )
      )[0];
    const current = await owned(q, v.id, uid);
    if (current.active_import) {
      const days = await q(
        "SELECT min(day)::text AS first,max(day)::text AS last FROM finfolk.trip_dives WHERE import_id=$1",
        [current.active_import],
      );
      if (days[0].first < draft.start || days[0].last > draft.end)
        fail("The date range must include all imported dives.");
    }
    const changed = await q(
      "UPDATE finfolk.trips SET draft=$3::jsonb,revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND revision=$4 RETURNING id,revision",
      [v.id, uid, JSON.stringify(draft), v.revision],
    );
    if (!changed.length)
      fail("Trip changed in another tab. Reload before saving.", 409);
    return changed[0];
  }
  const trip = await owned(q, v.id, uid);
  if (action === "tripGet")
    return {
      id: trip.id,
      draft: trip.draft,
      revision: trip.revision,
      activeImport: trip.active_import,
      published: !!trip.published,
      pending: !!trip.pending,
      preview: await snapshot(q, trip),
    };
  if (action === "tripDives") {
    const offset = Number(v.offset || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
      fail("Invalid dive page.");
    return {
      rows: trip.active_import
        ? await q(
            "SELECT ordinal,data FROM finfolk.trip_dives WHERE import_id=$1 AND ordinal>$2 ORDER BY ordinal LIMIT 100",
            [trip.active_import, offset],
          )
        : [],
    };
  }
  if (action === "tripPreview")
    return { snapshot: await snapshot(q, trip), revision: trip.revision };
  if (action === "tripImportBegin") {
    if (!Number.isInteger(v.count) || v.count < 1 || v.count > 10000)
      fail("Import between 1 and 10,000 dive rows.");
    // Expired incomplete uploads contain private data and are removed only for this owner.
    await q(
      "DELETE FROM finfolk.trip_imports WHERE trip_id=$1 AND state='uploading' AND created_at<now()-interval '1 day'",
      [trip.id],
    );
    return (
      await q(
        "INSERT INTO finfolk.trip_imports(trip_id,expected_rows) VALUES($1,$2) RETURNING id",
        [trip.id, v.count],
      )
    )[0];
  }
  if (action === "tripImportBatch") {
    if (
      !Number.isInteger(v.index) ||
      v.index < 0 ||
      v.index > 9999 ||
      !Array.isArray(v.rows) ||
      !v.rows.length ||
      v.rows.length > 200
    )
      fail("Invalid import batch.");
    const rows = v.rows.map((r) => validate(() => normalizeDiveRecord(r)));
    validate(() => aggregateDives(rows, trip.draft.start, trip.draft.end));
    const result = await q(
      "INSERT INTO finfolk.trip_import_batches(import_id,batch_index,rows) SELECT id,$3,$4::jsonb FROM finfolk.trip_imports WHERE id=$1 AND trip_id=$2 AND state='uploading' ON CONFLICT(import_id,batch_index) DO UPDATE SET rows=excluded.rows WHERE finfolk.trip_import_batches.rows=excluded.rows RETURNING import_id",
      [uuid(v.importId), trip.id, v.index, JSON.stringify(rows)],
    );
    if (!result.length)
      fail("Import batch changed or is no longer accepting rows.", 409);
    return { ok: true };
  }
  if (action === "tripImportConfirm") {
    const imported = (
      await q("SELECT * FROM finfolk.trip_imports WHERE id=$1 AND trip_id=$2", [
        uuid(v.importId),
        trip.id,
      ])
    )[0];
    if (!imported) fail("Import unavailable.", 404);
    if (imported.state === "complete") {
      if (trip.active_import === imported.id)
        return { unchanged: true, revision: trip.revision };
      fail("This import was already replaced.", 409);
    }
    const batches = await q(
      "SELECT batch_index,rows FROM finfolk.trip_import_batches WHERE import_id=$1 ORDER BY batch_index",
      [imported.id],
    );
    if (batches.some((b, i) => b.batch_index !== i))
      fail("Some import batches are missing.");
    const rows = batches
      .flatMap((b) => b.rows)
      .map((r) => validate(() => normalizeDiveRecord(r)));
    if (rows.length !== imported.expected_rows)
      fail("Import row count does not match.");
    validate(() =>
      aggregateDives(
        rows,
        trip.draft.start,
        trip.draft.end,
        trip.draft.waterDays,
      ),
    );
    const seen = new Set();
    let duplicate = false;
    for (const row of rows) {
      const identity = row.sourceId
        ? row.day + "|" + row.sourceId
        : row.timestamp;
      if (identity && seen.has(identity)) duplicate = true;
      if (identity) seen.add(identity);
    }
    if (duplicate && v.duplicatesConfirmed !== true)
      fail("Review repeated dive identifiers or timestamps before confirming.");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(rows))
      .digest("hex");
    if (trip.active_import) {
      const old = (
        await q("SELECT fingerprint FROM finfolk.trip_imports WHERE id=$1", [
          trip.active_import,
        ])
      )[0];
      if (old?.fingerprint === fingerprint) {
        await q("DELETE FROM finfolk.trip_imports WHERE id=$1", [imported.id]);
        return { unchanged: true, revision: trip.revision };
      }
      if (v.replace !== true)
        fail("Confirm replacing the previous private dive dataset.", 409);
    }
    const result = await q(
      `WITH locked AS (SELECT id FROM finfolk.trips WHERE id=$1 AND owner_id=$2 AND revision=$5 FOR UPDATE), dives AS (
   INSERT INTO finfolk.trip_dives(import_id,ordinal,day,data) SELECT $3,e.ordinality::integer,(e.value->>'day')::date,e.value FROM jsonb_array_elements($4::jsonb) WITH ORDINALITY e CROSS JOIN locked ON CONFLICT DO NOTHING RETURNING ordinal), complete AS (
   UPDATE finfolk.trip_imports SET state='complete',fingerprint=$6 WHERE id=$3 AND EXISTS(SELECT 1 FROM locked) RETURNING id)
   UPDATE finfolk.trips SET active_import=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND EXISTS(SELECT 1 FROM complete) RETURNING revision`,
      [
        trip.id,
        uid,
        imported.id,
        JSON.stringify(rows),
        v.revision,
        fingerprint,
      ],
    );
    if (!result.length)
      fail("Trip changed while importing. Reload before confirming.", 409);
    // Superseded raw records are private and no longer needed; published snapshots are unaffected.
    await q(
      "DELETE FROM finfolk.trip_imports WHERE trip_id=$1 AND id<>(SELECT active_import FROM finfolk.trips WHERE id=$1) AND state='complete'",
      [trip.id],
    );
    return {
      unchanged: false,
      revision: result[0].revision,
      rows: rows.length,
    };
  }
  if (action === "tripPublish") {
    verified();
    if (v.publicConsent !== true || v.ownPosts !== true)
      fail("Confirm ownership and public sharing of this report.");
    if (!trip.active_import)
      fail("Import your dive statistics before publishing.");
    const report = await snapshot(q, trip);
    if (report.discrepancies.length && v.discrepanciesConfirmed !== true)
      fail("Review the differences between entered and calculated totals.");
    const { discrepancies, ...publicReport } = report;
    let approved = true;
    for (const url of report.links) {
      const proof = await q(
        "SELECT 1 FROM finfolk.posts WHERE owner_id=$1 AND url=$2 AND status='approved' AND public_consent UNION ALL SELECT 1 FROM finfolk.instagram_discoveries WHERE owner_id=$1 AND url=$2 AND state='published' LIMIT 1",
        [uid, url],
      );
      if (!proof.length) approved = false;
    }
    const result = await q(
      "UPDATE finfolk.trips SET published=CASE WHEN $4::boolean THEN $3::jsonb ELSE published END,pending=CASE WHEN $4::boolean THEN NULL ELSE $3::jsonb END,published_at=CASE WHEN $4::boolean THEN now() ELSE published_at END,updated_at=now() WHERE id=$1 AND owner_id=$2 AND revision=$5 RETURNING id",
      [trip.id, uid, JSON.stringify(publicReport), approved, v.revision],
    );
    if (!result.length)
      fail("Trip changed. Preview it again before publishing.", 409);
    return { status: approved ? "published" : "pending", id: trip.id };
  }
  if (action === "tripUnpublish") {
    await q(
      "UPDATE finfolk.trips SET published=NULL,pending=NULL,updated_at=now() WHERE id=$1",
      [trip.id],
    );
    return { ok: true };
  }
  if (action === "tripDelete") {
    await q("DELETE FROM finfolk.trips WHERE id=$1 AND owner_id=$2", [
      trip.id,
      uid,
    ]);
    return { ok: true };
  }
  fail("Unknown trip action.");
}
