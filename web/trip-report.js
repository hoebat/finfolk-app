import { socialGallery } from "./media.js";
import { tripURL } from "./trip-model.js";
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
export const secondsLabel = (value) =>
  value === null || value === undefined
    ? "—"
    : value >= 3600
      ? `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m ${Math.round(value % 60)}s`
      : value >= 60
        ? `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`
        : `${Math.round(value)}s`;
const depth = (value) => (value === null ? "—" : `${value} m`);
export function reportBody(report) {
  const root = el("article", undefined, "trip-report"),
    header = el("header");
  header.append(
    el("p", report.beachName, "trip-kicker"),
    el("h1", report.title),
    el("p", `${report.start} – ${report.end} · ${report.authorName}`),
    el(
      "small",
      `Self-reported · Dates in ${report.timezone} · Individual dive records remain private`,
    ),
  );
  root.append(header);
  const stats = el("div", undefined, "trip-highlights"),
    t = report.summary.total;
  for (const [label, value] of [
    ["Dives", t.dives],
    ["Days with dives", `${t.daysWithDives} / ${t.calendarDays}`],
    ["Deepest recorded", depth(t.maxDepthMetres)],
    ["Average depth", depth(t.averageDepthMetres)],
    ["Median depth", depth(t.medianDepthMetres)],
    ["Longest recorded dive", secondsLabel(t.longestDiveSeconds)],
    ["Recorded dive time", secondsLabel(t.totalDiveSeconds)],
    [
      t.waterTimeSource === "trip_total"
        ? "Time in water (entered total)"
        : "Time in the water",
      t.waterMinutes === null
        ? "Not supplied"
        : secondsLabel(t.waterMinutes * 60),
    ],
  ]) {
    const card = el("div");
    card.append(el("strong", String(value)), el("span", label));
    stats.append(card);
  }
  root.append(stats);
  if (t.depthRecords !== t.dives || t.durationRecords !== t.dives)
    root.append(
      el(
        "p",
        `${t.depthRecords} dives have depth; ${t.durationRecords} have duration. Missing measurements are excluded from averages; total dive time requires every duration.`,
      ),
    );
  if (report.story) {
    const story = el("p", report.story, "trip-story");
    root.append(story);
  }
  const chart = el("section", undefined, "trip-chart"),
    label = el("label", "Daily view "),
    select = el("select");
  for (const [value, title] of [
    ["dives", "Dive count"],
    ["maxDepthMetres", "Maximum recorded depth (m)"],
    ["totalDiveSeconds", "Recorded dive time (seconds)"],
  ]) {
    const option = el("option", title);
    option.value = value;
    select.append(option);
  }
  label.append(select);
  const bars = el("div", undefined, "trip-bars");
  chart.append(el("h2", "Day by day"), label, bars);
  root.append(chart);
  function draw() {
    bars.replaceChildren();
    const metric = select.value,
      max = Math.max(1, ...report.summary.daily.map((d) => d[metric] || 0));
    for (const day of report.summary.daily) {
      const item = el("div", undefined, "trip-bar-item"),
        value = day[metric],
        bar = el("div", undefined, "trip-bar");
      bar.style.setProperty(
        "--trip-height",
        `${Math.max(0, ((value || 0) / max) * 100)}%`,
      );
      bar.title = `${day.day}: ${value === null ? "not recorded" : value}`;
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", bar.title);
      item.append(
        el("small", value === null ? "—" : String(value)),
        bar,
        el("small", day.day.slice(5)),
      );
      bars.append(item);
    }
  }
  select.onchange = draw;
  draw();
  const wrap = el("div", undefined, "trip-table-wrap"),
    table = el("table"),
    caption = el("caption", "Daily statistics");
  table.append(caption);
  const head = el("thead"),
    hr = el("tr");
  for (const title of [
    "Date",
    "Dives",
    "Max depth",
    "Average depth",
    "Median depth",
    "Longest dive",
    "Recorded dive time",
    "Water time",
  ]) {
    const th = el("th", title);
    th.scope = "col";
    hr.append(th);
  }
  head.append(hr);
  table.append(head);
  const body = el("tbody");
  for (const d of report.summary.daily) {
    const row = el("tr");
    for (const value of [
      d.day,
      d.dives,
      depth(d.maxDepthMetres),
      depth(d.averageDepthMetres),
      depth(d.medianDepthMetres),
      secondsLabel(d.longestDiveSeconds),
      secondsLabel(d.totalDiveSeconds),
      d.waterMinutes === null ? "—" : secondsLabel(d.waterMinutes * 60),
    ])
      row.append(el("td", String(value)));
    body.append(row);
  }
  table.append(body);
  wrap.append(table);
  root.append(
    wrap,
    el(
      "p",
      "Recorded dive time and time in the water are different measurements. This report does not create check-ins or Regulars credit.",
      "trip-note",
    ),
  );
  if (report.links?.length) {
    const gallery = socialGallery(
      report.links.map((url) => ({
        url,
        title: "From this trip",
        author: report.authorName,
        location_context: report.beachName,
      })),
    );
    if (gallery) root.append(gallery);
  }
  return root;
}
export async function tripCards(
  host,
  apiUrl,
  { beachId, ownerId, isCurrent = () => true } = {},
) {
  const u = new URL("trips", apiUrl.endsWith("/") ? apiUrl : apiUrl + "/");
  if (beachId) u.searchParams.set("beachId", beachId);
  if (ownerId) u.searchParams.set("ownerId", ownerId);
  const response = await fetch(u, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error("Trip reports are unavailable.");
  const data = await response.json();
  if (!host.isConnected || !isCurrent()) return;
  if (data.trips?.length) {
    const section = el("section", undefined, "trip-cards");
    section.append(el("h3", "Trip reports"));
    for (const trip of data.trips) {
      const a = el("a", undefined, "trip-card");
      a.href = tripURL(trip.id);
      a.append(
        el("strong", trip.title),
        el("span", `${trip.beachName} · ${trip.start} – ${trip.end}`),
        el("small", `${trip.total.dives} dives · ${trip.authorName}`),
      );
      section.append(a);
    }
    host.append(section);
  }
}
export function installTripPage({ shell, loadJSON }) {
  const root = document.getElementById("trip-page");
  let sequence = 0;
  async function show() {
    if (shell.route.view !== "trip") return;
    const request = ++sequence;
    root.replaceChildren(el("p", "Loading trip report…"));
    try {
      const id = new URL(location.href).searchParams.get("trip");
      if (!/^[a-f0-9-]{36}$/.test(id || ""))
        throw Error("Choose a valid trip report.");
      const config = await loadJSON("neon-config.json"),
        r = await fetch(new URL("trips/" + id, config.apiUrl), {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        }),
        report = await r.json();
      if (request !== sequence) return;
      if (!r.ok) throw Error(report.error || "Trip report unavailable.");
      const back = el("button", "Explore this beach", "secondary");
      back.onclick = () =>
        shell.navigate("maps", {
          params: { site: report.beachId, trip: null },
        });
      const share = el("button", "Copy report link", "secondary");
      share.onclick = async () => {
        try {
          await navigator.clipboard.writeText(tripURL(id));
          share.textContent = "Link copied";
        } catch {
          share.textContent = "Copy the address from your browser";
        }
      };
      const issues = el("a", "Report a problem");
      issues.href = "?view=account&reportTrip=" + encodeURIComponent(id);
      root.replaceChildren(back, share, reportBody(report), issues);
    } catch (e) {
      if (request !== sequence) return;
      root.replaceChildren(
        el("h1", "Trip report unavailable"),
        el("p", e.message),
      );
    }
  }
  shell.subscribe((route) => {
    if (route.view === "trip") show();
    else sequence++;
  });
  if (shell.route.view === "trip") show();
}
