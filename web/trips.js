import {
  parseDiveCSV,
  mapDiveCSV,
  aggregateDives,
  dateRange,
  tripURL,
} from "./trip-model.js";
import { reportBody } from "./trip-report.js";
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const field = (host, title, type = "text", value = "") => {
  const label = el("label", title),
    input = el(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") input.type = type;
  input.value = value ?? "";
  label.append(input);
  host.append(label);
  return input;
};
const choose = (host, title, values, value = "") => {
  const label = el("label", title),
    input = el("select");
  for (const [v, text] of values) {
    const o = el("option", text);
    o.value = v;
    input.append(o);
  }
  input.value = value;
  label.append(input);
  host.append(label);
  return input;
};
const button = (title, fn, status) => {
  const b = el("button", title, "secondary");
  b.type = "button";
  b.onclick = async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      status.textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
  return b;
};
export function importChunks(records) {
  const chunks = [];
  let rows = [];
  for (const record of records) {
    if (new TextEncoder().encode(JSON.stringify(record)).length > 40000)
      throw Error(
        "A dive row is too large to upload. Remove unneeded long-text CSV columns.",
      );
    if (
      rows.length >= 200 ||
      new TextEncoder().encode(JSON.stringify([...rows, record])).length > 45000
    ) {
      chunks.push(rows);
      rows = [];
    }
    rows.push(record);
  }
  if (rows.length) chunks.push(rows);
  return chunks;
}
export async function renderTripManager({ host, api, beaches, refresh }) {
  const section = el("section", undefined, "account-card trip-manager"),
    status = el("p");
  status.setAttribute("role", "status");
  section.append(
    el("h2", "Trip reports"),
    el(
      "p",
      "Keep every dive private. Share your days, story and Instagram posts.",
    ),
    status,
  );
  host.append(section);
  const editor = el("div"),
    list = el("div");
  section.append(
    button("Create trip report", () => edit(), status),
    editor,
    list,
  );
  async function reloadList() {
    list.replaceChildren();
    const trips = await api.call("tripList");
    for (const trip of trips) {
      const card = el("article", undefined, "buddy-card");
      card.append(
        el("h3", trip.draft.title),
        el(
          "p",
          `${trip.draft.start} – ${trip.draft.end} · ${trip.pending ? "Review pending" : trip.published ? "Published" : "Private draft"}`,
        ),
        button("Edit report", () => edit(trip.id), status),
      );
      if (trip.published) {
        const link = el("a", "View published report");
        link.href = tripURL(trip.id);
        card.append(link);
      }
      list.append(card);
    }
  }
  await reloadList();
  async function edit(id) {
    let current = id ? await api.call("tripGet", { id }) : null;
    editor.replaceChildren();
    const form = el("div", undefined, "trip-editor");
    editor.append(form);
    const d = current?.draft || {
      title: "",
      authorName: api.user?.displayName || api.user?.name || "Diver",
      beachId: "",
      start: "",
      end: "",
      story: "",
      links: [],
      waterDays: {},
      claimedTotals: {},
    };
    const title = field(form, "Report title", "text", d.title),
      author = field(form, "Public author name", "text", d.authorName),
      beach = choose(
        form,
        "Beach",
        [["", "Choose a beach"], ...beaches.map((b) => [b.id, b.name])],
        d.beachId,
      ),
      start = field(form, "First day", "date", d.start),
      end = field(form, "Last day", "date", d.end),
      story = field(form, "Your story (optional)", "textarea", d.story),
      links = field(
        form,
        "Instagram post links (one per line)",
        "textarea",
        d.links.join("\n"),
      );
    links.placeholder = "https://www.instagram.com/p/De5ihb-H5ie/";
    const waterTotal = field(
      form,
      "Total time in the water, minutes (optional)",
      "number",
      d.waterTotalMinutes ?? "",
    );
    const water = el("details");
    water.append(el("summary", "Time in the water (optional daily entries)"));
    form.append(water);
    const waterInputs = new Map();
    function waterFields() {
      const saved = Object.fromEntries(
        [...waterInputs]
          .filter(([, i]) => i.value !== "")
          .map(([day, i]) => [day, Number(i.value)]),
      );
      water.replaceChildren(
        el("summary", "Time in the water (optional daily entries)"),
      );
      waterInputs.clear();
      try {
        for (const day of dateRange(start.value, end.value)) {
          const input = field(
            water,
            day + " · minutes in the water",
            "number",
            saved[day] ?? d.waterDays[day] ?? "",
          );
          input.min = "0";
          input.max = "1440";
          waterInputs.set(day, input);
        }
      } catch {
        water.append(el("p", "Choose the date range first."));
      }
    }
    start.onchange = end.onchange = waterFields;
    waterFields();
    const claims = el("details");
    claims.append(
      el("summary", "Compare with existing trip totals (optional)"),
    );
    form.append(claims);
    const claimInputs = {};
    for (const [key, label] of [
      ["dives", "Dive count"],
      ["maxDepthMetres", "Maximum depth (metres)"],
      ["totalDiveSeconds", "Total recorded dive time (seconds)"],
      ["waterMinutes", "Total time in water (minutes)"],
    ])
      claimInputs[key] = field(
        claims,
        label,
        "number",
        d.claimedTotals[key] ?? "",
      );
    const draft = () => ({
      title: title.value,
      authorName: author.value,
      beachId: beach.value,
      start: start.value,
      end: end.value,
      story: story.value,
      links: links.value
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean),
      waterDays: Object.fromEntries(
        [...waterInputs]
          .filter(([, i]) => i.value !== "")
          .map(([day, i]) => [day, Number(i.value)]),
      ),
      waterTotalMinutes:
        waterTotal.value === "" ? null : Number(waterTotal.value),
      claimedTotals: Object.fromEntries(
        Object.entries(claimInputs)
          .filter(([, i]) => i.value !== "")
          .map(([k, i]) => [k, Number(i.value)]),
      ),
    });
    async function save() {
      const result = await api.call("tripSave", {
        id: current?.id,
        revision: current?.revision,
        draft: draft(),
      });
      current = await api.call("tripGet", { id: result.id });
      await reloadList();
      status.textContent = "Private trip draft saved.";
      return current;
    }
    form.append(button("Save private draft", save, status));
    const imports = el("section", undefined, "trip-import");
    imports.append(
      el("h3", "Add your complete dive statistics"),
      el(
        "p",
        "CSV stays on this device until you confirm import. Date-only rows remain date-only. Individual records are not published.",
      ),
    );
    const template = el("a", "Download CSV template");
    template.href = "#";
    template.download = "finfolk-dive-template.csv";
    template.onclick = () => {
      const url = URL.createObjectURL(
        new Blob(["date,depth_m,duration_seconds,dive_id\n"], {
          type: "text/csv",
        }),
      );
      template.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    imports.append(template);
    const file = field(imports, "Dive CSV", "file");
    file.accept = ".csv,text/csv";
    const delimiter = choose(
      imports,
      "CSV separator",
      [
        [",", "Comma"],
        [";", "Semicolon"],
        ["\t", "Tab"],
      ],
      ",",
    );
    const mapping = el("div"),
      preview = el("div");
    imports.append(mapping, preview);
    form.append(imports);
    let csv = null,
      parsed = null,
      upload = null;
    const read = async () => {
      preview.replaceChildren();
      parsed = null;
      upload = null;
      mapping.replaceChildren();
      if (!file.files?.[0]) return;
      if (file.files[0].size > 5 * 1024 * 1024)
        throw Error("Choose a CSV smaller than 5 MB.");
      csv = parseDiveCSV(await file.files[0].text(), delimiter.value);
      const cols = [["", "Not supplied"], ...csv.headers.map((h) => [h, h])],
        dateCol = choose(
          mapping,
          "Date column",
          cols,
          csv.headers.find((h) => /^date|timestamp/i.test(h)) || "",
        ),
        depthCol = choose(
          mapping,
          "Depth column",
          cols,
          csv.headers.find((h) => /depth/i.test(h)) || "",
        ),
        durationCol = choose(
          mapping,
          "Dive duration column",
          cols,
          csv.headers.find((h) => /duration|dive.time/i.test(h)) || "",
        ),
        idCol = choose(
          mapping,
          "Dive identifier column (optional)",
          cols,
          csv.headers.find((h) => /^(dive_?id|id)$/i.test(h)) || "",
        );
      const dateFormat = choose(mapping, "Date format", [
          ["", "Choose date format"],
          ["iso", "YYYY-MM-DD / ISO timestamp"],
          ["dmy", "Day / month / year"],
          ["mdy", "Month / day / year"],
        ]),
        depthUnit = choose(mapping, "Depth units", [
          ["", "Choose units"],
          ["m", "Metres"],
          ["ft", "Feet"],
        ]),
        durationUnit = choose(mapping, "Duration format", [
          ["", "Choose format"],
          ["seconds", "Seconds"],
          ["minutes", "Minutes"],
          ["clock", "Minutes:seconds / hours:minutes:seconds"],
        ]);
      const unitVisibility = () => {
        depthUnit.closest("label").hidden = !depthCol.value;
        durationUnit.closest("label").hidden = !durationCol.value;
      };
      unitVisibility();
      for (const select of mapping.querySelectorAll("select"))
        select.onchange = () => {
          unitVisibility();
          preview.replaceChildren();
          parsed = null;
          upload = null;
        };
      mapping.append(
        button(
          "Preview CSV",
          async () => {
            await save();
            const b = beaches.find((b) => b.id === beach.value);
            const zone = current.preview.timezone;
            parsed = mapDiveCSV(
              csv,
              {
                date: dateCol.value,
                depth: depthCol.value,
                duration: durationCol.value,
                id: idCol.value,
                dateFormat: dateFormat.value,
                depthUnit: depthUnit.value,
                durationUnit: durationUnit.value,
              },
              zone,
            );
            preview.replaceChildren(
              el(
                "h4",
                `${parsed.records.length} dive rows ready · ${parsed.errors.length} errors`,
              ),
            );
            if (parsed.errors.length) {
              for (const e of parsed.errors.slice(0, 20))
                preview.append(el("p", `Row ${e.row}: ${e.message}`));
              parsed = null;
              return;
            }
            const summary = aggregateDives(
              parsed.records,
              start.value,
              end.value,
              draft().waterDays,
            );
            preview.append(
              reportBody({ ...current.preview, summary, links: [] }),
            );
            const raw = el("details");
            raw.append(el("summary", "Private row preview (first 10)"));
            for (const r of parsed.records.slice(0, 10))
              raw.append(el("pre", JSON.stringify(r, null, 2)));
            preview.append(raw);
            let duplicateCheck = null;
            if (parsed.duplicates.length) {
              duplicateCheck = field(
                preview,
                `${parsed.duplicates.length} repeated identifiers/timestamps found. I checked these rows and want to retain them.`,
                "checkbox",
              );
            }
            const replace = current.activeImport
              ? field(
                  preview,
                  "Replace my previous private dive dataset with this import",
                  "checkbox",
                )
              : null;
            const importButton = button(
              "Confirm private import",
              async () => {
                if (duplicateCheck && !duplicateCheck.checked)
                  throw Error("Check repeated dive rows first.");
                if (replace && !replace.checked)
                  throw Error(
                    "Confirm replacing the previous private dataset.",
                  );
                if (!upload) {
                  await save();
                  const begun = await api.call("tripImportBegin", {
                    id: current.id,
                    count: parsed.records.length,
                  });
                  upload = {
                    id: begun.id,
                    index: 0,
                    chunks: importChunks(parsed.records),
                    revision: current.revision,
                  };
                }
                while (upload.index < upload.chunks.length) {
                  status.textContent = `Saving dive data · batch ${upload.index + 1} of ${upload.chunks.length}`;
                  await api.call("tripImportBatch", {
                    id: current.id,
                    importId: upload.id,
                    index: upload.index,
                    rows: upload.chunks[upload.index],
                  });
                  upload.index++;
                }
                await api.call("tripImportConfirm", {
                  id: current.id,
                  importId: upload.id,
                  revision: upload.revision,
                  replace: !!replace?.checked,
                  duplicatesConfirmed: !!duplicateCheck?.checked,
                });
                upload = null;
                status.textContent =
                  "Complete private dive dataset saved. Preview your report before publishing.";
                await edit(current.id);
              },
              status,
            );
            preview.append(importButton);
          },
          status,
        ),
      );
    };
    file.onchange = delimiter.onchange = () =>
      read().catch((e) => {
        status.textContent = e.message;
      });
    if (current?.activeImport) {
      const records = el("details");
      records.append(el("summary", "Your private dive records"));
      let offset = 0;
      const rows = el("div"),
        more = button(
          "Load 100 private records",
          async () => {
            const data = await api.call("tripDives", {
              id: current.id,
              offset,
            });
            for (const row of data.rows) {
              rows.append(el("pre", JSON.stringify(row.data, null, 2)));
              offset = row.ordinal;
            }
            if (data.rows.length < 100) more.remove();
          },
          status,
        );
      records.append(rows, more);
      form.append(records);
    }
    const publication = el("section");
    form.append(
      publication,
      button(
        "Preview public report",
        async () => {
          await save();
          const result = await api.call("tripPreview", { id: current.id });
          publication.replaceChildren(
            el("h3", "Public preview"),
            reportBody(result.snapshot),
          );
          const consent = field(
              publication,
              "Publish this story, public name, date range and daily/trip summaries. Keep individual dives and original CSV columns private.",
              "checkbox",
            ),
            own = field(
              publication,
              "These are my statistics and my Instagram posts, and I permit their public listing.",
              "checkbox",
            );
          let discrepancy = null;
          if (result.snapshot.discrepancies.length) {
            publication.append(
              el(
                "p",
                "Entered totals differ from the imported data. The report uses the calculated values.",
              ),
            );
            for (const d of result.snapshot.discrepancies)
              publication.append(
                el(
                  "p",
                  `${d.metric}: entered ${d.entered}, calculated ${d.calculated ?? "unavailable"}`,
                ),
              );
            discrepancy = field(
              publication,
              "I reviewed these differences and want to publish the calculated summary.",
              "checkbox",
            );
          }
          publication.append(
            button(
              "Publish report",
              async () => {
                const published = await api.call("tripPublish", {
                  id: current.id,
                  revision: result.revision,
                  publicConsent: consent.checked,
                  ownPosts: own.checked,
                  discrepanciesConfirmed: !!discrepancy?.checked,
                });
                status.textContent =
                  published.status === "pending"
                    ? "Report submitted. Your Instagram links need ownership and beach review before it becomes public."
                    : "Trip report published.";
                withdraw.hidden = false;
                await reloadList();
                if (published.status === "published") {
                  const a = el("a", "Open your published trip report");
                  a.href = tripURL(current.id);
                  publication.append(a);
                }
              },
              status,
            ),
          );
        },
        status,
      ),
    );
    const withdraw = button(
      "Unpublish / withdraw report",
      async () => {
        await api.call("tripUnpublish", { id: current.id });
        status.textContent =
          "Report withdrawn. Your private dive data is retained.";
        await reloadList();
        await edit(current.id);
      },
      status,
    );
    withdraw.hidden = !current?.published && !current?.pending;
    form.append(withdraw);
  }
}
export async function renderTripAdmin({ host, api }) {
  const root = el("details"),
    status = el("p");
  root.append(el("summary", "Trip report reviews"), status);
  host.append(root);
  root.addEventListener("toggle", async () => {
    if (!root.open || root.dataset.loaded) return;
    try {
      const data = await api.call("tripReviewInbox");
      root.dataset.loaded = "true";
      for (const trip of data.trips) {
        const card = el("section", undefined, "account-card");
        card.append(reportBody(trip.pending));
        const ownership = field(
            card,
            "I checked the author owns these Instagram posts and consented to listing them.",
            "checkbox",
          ),
          beach = field(
            card,
            "I checked the trip’s beach location.",
            "checkbox",
          );
        for (const [decision, title] of [
          ["approve", "Approve report"],
          ["reject", "Reject revision"],
          ["remove", "Remove published report"],
        ])
          card.append(
            button(
              title,
              async () => {
                await api.call("tripReview", {
                  id: trip.id,
                  decision,
                  ownershipChecked: ownership.checked,
                  beachChecked: beach.checked,
                  reviewToken: trip.review_token,
                });
                card.remove();
                status.textContent = "Review saved.";
              },
              status,
            ),
          );
        root.append(card);
      }
      for (const report of data.reports) {
        const card = el("section");
        card.append(
          el("p", report.reason),
          reportBody(report.published),
          button(
            "Remove reported trip",
            async () => {
              await api.call("tripReview", {
                id: report.id,
                decision: "remove",
                reviewToken: report.review_token,
              });
              card.remove();
            },
            status,
          ),
        );
        root.append(card);
      }
    } catch (e) {
      status.textContent = e.message;
    }
  });
}
