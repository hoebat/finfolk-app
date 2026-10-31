export const TRIP_IMPORT_LIMIT = 10000;
export function validDay(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
    Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function dateRange(start, end) {
  if (!validDay(start) || !validDay(end) || start > end)
    throw Error("Choose a valid trip date range.");
  const out = [];
  for (
    let d = new Date(start + "T12:00:00Z");
    d <= new Date(end + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length > 366) throw Error("A trip can span at most 366 days.");
  }
  return out;
}
export function parseDiveCSV(text, delimiter = ",") {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > 5 * 1024 * 1024
  )
    throw Error("Choose a CSV smaller than 5 MB.");
  if (![",", ";", "\t"].includes(delimiter))
    throw Error("Choose a CSV delimiter.");
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    if (cell.length > 5000) throw Error("A CSV cell exceeds 5,000 characters.");
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > 100) throw Error("CSV has more than 100 columns.");
  };
  const pushRow = () => {
    pushCell();
    if (row.some((v) => v.trim())) rows.push(row);
    row = [];
    if (rows.length > TRIP_IMPORT_LIMIT + 1)
      throw Error("Import up to 10,000 dives at once.");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell) throw Error("Unexpected quote in CSV.");
      quoted = true;
    } else if (c === delimiter) pushCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      if (closed && !/\s/.test(c))
        throw Error("Unexpected text after a CSV quote.");
      if (!closed) cell += c;
    }
  }
  if (quoted) throw Error("CSV contains an unfinished quoted cell.");
  if (cell || row.length) pushRow();
  const headers = rows.shift()?.map((h) => h.trim());
  if (
    !headers?.length ||
    new Set(headers).size !== headers.length ||
    headers.some((h) => !h || h.length > 100)
  )
    throw Error("CSV needs unique, non-empty column headers.");
  if (rows.some((r) => r.length !== headers.length))
    throw Error(
      "Every CSV row must have the same number of columns as the header.",
    );
  if (!rows.length) throw Error("CSV has no dive rows.");
  return { headers, rows };
}
function numeric(value, label) {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const text = String(value).trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))
    throw Error(label + " must be a non-negative number.");
  return Number(text);
}
export function normalizeDiveRecord(input) {
  if (!input || !validDay(input.day)) throw Error("A dive needs a valid date.");
  const depth = numeric(input.depthMetres, "Depth"),
    duration = numeric(input.durationSeconds, "Dive duration");
  if (depth === null && duration === null)
    throw Error("A dive needs depth or duration.");
  if (depth !== null && depth > 300)
    throw Error("Depth must not exceed 300 m.");
  if (duration !== null && duration > 3600)
    throw Error("Dive duration must not exceed 3,600 seconds.");
  const original = input.original || {};
  if (
    typeof original !== "object" ||
    Array.isArray(original) ||
    Object.keys(original).length > 100 ||
    Object.entries(original).some(
      ([k, v]) => k.length > 100 || typeof v !== "string" || v.length > 5000,
    )
  )
    throw Error("Invalid original CSV columns.");
  const timestamp = input.timestamp || null;
  if (
    timestamp &&
    (!/^\d{4}-\d\d-\d\dT/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp)))
  )
    throw Error("Invalid dive timestamp.");
  const localTime = input.localTime || null;
  if (
    localTime &&
    (!/^\d\d:\d\d(?::\d\d)?$/.test(localTime) ||
      Number(localTime.slice(0, 2)) > 23 ||
      Number(localTime.slice(3, 5)) > 59 ||
      Number(localTime.slice(6) || 0) > 59)
  )
    throw Error("Invalid local dive time.");
  const sourceId = String(input.sourceId || "").trim();
  if (sourceId.length > 160) throw Error("Dive identifier is too long.");
  return {
    day: input.day,
    depthMetres: depth,
    durationSeconds: duration,
    sourceId: sourceId || null,
    timestamp: timestamp ? new Date(timestamp).toISOString() : null,
    localTime,
    original: Object.fromEntries(
      Object.entries(original).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}
export function mapDiveCSV(csv, mapping, timezone) {
  if (
    !["iso", "dmy", "mdy"].includes(mapping.dateFormat) ||
    (mapping.depth && !["m", "ft"].includes(mapping.depthUnit)) ||
    (mapping.duration &&
      !["seconds", "minutes", "clock"].includes(mapping.durationUnit))
  )
    throw Error("Choose date, depth and duration formats.");
  if (
    !csv.headers.includes(mapping.date) ||
    (!csv.headers.includes(mapping.depth) &&
      !csv.headers.includes(mapping.duration))
  )
    throw Error("Map the date and at least depth or duration.");
  new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
  const records = [],
    errors = [],
    duplicates = [],
    seen = new Set();
  for (let i = 0; i < csv.rows.length; i++)
    try {
      const original = Object.fromEntries(
        csv.headers.map((h, j) => [h, csv.rows[i][j]]),
      );
      let date = original[mapping.date].trim(),
        day,
        timestamp = null,
        localTime = null;
      if (mapping.dateFormat === "iso") {
        if (
          /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(
            date,
          )
        ) {
          if (!validDay(date.slice(0, 10))) throw Error("Invalid date.");
          const d = new Date(date);
          if (!Number.isFinite(+d)) throw Error("Invalid timestamp.");
          timestamp = d.toISOString();
          const parts = new Intl.DateTimeFormat("en-CA", {
              timeZone: timezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).formatToParts(d),
            get = (t) => parts.find((p) => p.type === t).value;
          day = `${get("year")}-${get("month")}-${get("day")}`;
        } else {
          const m = date.match(
            /^(\d{4}-\d\d-\d\d)(?:[T ](\d\d:\d\d(?::\d\d)?))?$/,
          );
          if (!m) throw Error("Use YYYY-MM-DD or an ISO timestamp.");
          day = m[1];
          localTime = m[2] || null;
        }
      } else {
        const m = date.match(
          /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T](\d\d:\d\d(?::\d\d)?))?$/,
        );
        if (!m) throw Error("Date does not match the selected format.");
        const month = mapping.dateFormat === "dmy" ? m[2] : m[1],
          d = mapping.dateFormat === "dmy" ? m[1] : m[2];
        day = `${m[3]}-${month.padStart(2, "0")}-${d.padStart(2, "0")}`;
        localTime = m[4] || null;
      }
      let depth = numeric(original[mapping.depth], "Depth");
      if (depth !== null && mapping.depthUnit === "ft") depth *= 0.3048;
      let duration;
      if (
        mapping.durationUnit === "clock" &&
        original[mapping.duration]?.trim()
      ) {
        const parts = original[mapping.duration].trim().split(":");
        if (
          ![2, 3].includes(parts.length) ||
          !/^\d+$/.test(parts[0]) ||
          parts.slice(1).some((p) => !/^([0-5]\d)$/.test(p))
        )
          throw Error("Dive duration must use m:ss or h:mm:ss.");
        duration = parts.map(Number).reduce((sum, n) => sum * 60 + n, 0);
      } else {
        duration = numeric(original[mapping.duration], "Dive duration");
        if (duration !== null && mapping.durationUnit === "minutes")
          duration *= 60;
      }
      const record = normalizeDiveRecord({
        day,
        depthMetres: depth,
        durationSeconds: duration,
        sourceId: original[mapping.id],
        timestamp,
        localTime,
        original,
      });
      const identity = record.sourceId
        ? record.day + "|" + record.sourceId
        : record.timestamp
          ? record.timestamp
          : null;
      if (identity && seen.has(identity)) duplicates.push(i + 2);
      if (identity) seen.add(identity);
      records.push(record);
    } catch (e) {
      errors.push({ row: i + 2, message: e.message });
    }
  return { records, errors, duplicates };
}
const round = (n) => (n === null ? null : Math.round(n * 100) / 100);
export function aggregateDives(records, start, end, waterDays = {}) {
  const days = dateRange(start, end),
    groups = new Map(days.map((day) => [day, []]));
  for (const row of records) {
    if (!groups.has(row.day))
      throw Error("Dive " + row.day + " is outside this trip.");
    groups.get(row.day).push(row);
  }
  const stats = (rows) => {
    const depths = rows
        .map((r) => r.depthMetres)
        .filter((v) => v !== null)
        .sort((a, b) => a - b),
      times = rows.map((r) => r.durationSeconds).filter((v) => v !== null),
      mid = Math.floor(depths.length / 2);
    return {
      dives: rows.length,
      depthRecords: depths.length,
      durationRecords: times.length,
      maxDepthMetres: depths.length ? round(depths.at(-1)) : null,
      averageDepthMetres: depths.length
        ? round(depths.reduce((a, b) => a + b, 0) / depths.length)
        : null,
      medianDepthMetres: depths.length
        ? round(
            depths.length % 2
              ? depths[mid]
              : (depths[mid - 1] + depths[mid]) / 2,
          )
        : null,
      longestDiveSeconds: times.length ? round(Math.max(...times)) : null,
      totalDiveSeconds:
        rows.length && times.length === rows.length
          ? round(times.reduce((a, b) => a + b, 0))
          : null,
    };
  };
  for (const [day, value] of Object.entries(waterDays)) {
    if (
      !groups.has(day) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1440
    )
      throw Error("Water time must be 0–1,440 minutes for a trip day.");
  }
  const daily = days.map((day) => ({
    day,
    ...stats(groups.get(day)),
    waterMinutes: waterDays[day] ?? null,
  }));
  const active = daily.filter((d) => d.dives);
  return {
    total: {
      ...stats(records),
      calendarDays: days.length,
      daysWithDives: active.length,
      waterMinutes:
        active.length && active.every((d) => d.waterMinutes !== null)
          ? round(
              Object.values(waterDays).reduce((sum, value) => sum + value, 0),
            )
          : null,
    },
    daily,
  };
}
export const tripURL = (id, base = globalThis.location?.href) => {
  const u = new URL(base);
  u.search = "";
  u.hash = "";
  u.searchParams.set("view", "trip");
  u.searchParams.set("trip", id);
  return u.href;
};
