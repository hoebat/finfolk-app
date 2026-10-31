import { activity } from "./activity.js";
const el = (tag, text) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
};
export async function getInstagramFeed(apiUrl, beachId, cursor = null) {
  const u = new URL(
    "instagram/posts",
    apiUrl.endsWith("/") ? apiUrl : apiUrl + "/",
  );
  u.searchParams.set("beachId", beachId);
  if (cursor) u.searchParams.set("cursor", cursor);
  const task = activity.begin({
    label: "Instagram beach posts",
    kind: "Instagram",
    url: u.href,
  });
  try {
    const r = await fetch(u, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw Error("Instagram posts are unavailable.");
    const result = await r.json();
    task.finish();
    if (result.activity) {
      const panel = document.getElementById("system-panel");
      if (panel) {
        let summary = document.getElementById("instagram-public-status");
        if (!summary) {
          summary = el("p");
          summary.id = "instagram-public-status";
          panel.append(summary);
        }
        summary.textContent = `Instagram · ${result.activity.collecting ? "Collecting" : "Collection paused"} · Last collection ${result.activity.lastSuccess ? new Date(result.activity.lastSuccess).toLocaleString() : "not yet run"}`;
      }
    }
    return result;
  } catch (e) {
    task.finish({ state: "error", error: e.message });
    throw e;
  }
}
export async function renderInstagramDiscovery({
  root,
  api,
  beaches,
  admin,
  refresh,
}) {
  const section = el("section");
  section.className = "account-card instagram-discovery-controls";
  root.append(section);
  const status = el("p");
  status.setAttribute("role", "status");
  section.append(status);
  const call = (action, v) => api.call(action, v);
  const button = (label, fn) => {
    const b = el("button", label);
    b.type = "button";
    b.className = "secondary";
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
  const link = (url) => {
    const a = el("a", "Open Instagram post ↗");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  };
  const picker = (row) => {
    const select = el("select");
    select.setAttribute("aria-label", "Beach for this post");
    const empty = el("option", "Choose a beach");
    empty.value = "";
    select.append(empty);
    for (const b of beaches) {
      const o = el("option", b.name);
      o.value = b.id;
      select.append(o);
    }
    select.value = row.beach_id || "";
    return select;
  };
  const data = await call("instagramMyPosts");
  section.append(el("h3", "Your Instagram posts"));
  if (data.connection) {
    const label = el("label", "Share my tagged Instagram posts on FinFolk "),
      toggle = el("input");
    toggle.type = "checkbox";
    toggle.checked = !!data.connection.share_posts;
    label.prepend(toggle);
    section.append(
      label,
      el(
        "p",
        "Eligible posts become public on beach pages. Your logbook stays private. Turning this off pauses future sharing; remove existing posts below.",
      ),
    );
    toggle.onchange = async () => {
      toggle.disabled = true;
      try {
        await call("instagramSharing", { enabled: toggle.checked });
        status.textContent = toggle.checked
          ? "Public sharing enabled."
          : "Future sharing paused.";
      } catch (e) {
        toggle.checked = !toggle.checked;
        status.textContent = e.message;
      } finally {
        toggle.disabled = false;
      }
    };
    if (!data.connection.media_owner_id)
      section.append(
        el(
          "small",
          "Your connection needs media-owner evidence before automatic publication. Posts can still be reviewed.",
        ),
      );
  }
  if (!data.posts.length)
    section.append(
      el(
        "p",
        "No discovered posts yet. Mention @finfolk.com.au in a public post or comment and include the beach name.",
      ),
    );
  for (const row of data.posts) {
    const card = el("article");
    card.className = "buddy-card";
    card.append(el("h4", row.state), link(row.url));
    if (row.posted_at)
      card.append(
        el("small", "Posted " + new Date(row.posted_at).toLocaleDateString()),
      );
    if (["pending", "published"].includes(row.state)) {
      const select = picker(row);
      card.append(
        select,
        button(
          row.state === "published" ? "Change beach" : "Share at this beach",
          async () => {
            await call("instagramChoosePostBeach", {
              id: row.id,
              beachId: select.value,
            });
            refresh();
          },
        ),
      );
    }
    if (!["hidden", "rejected"].includes(row.state))
      card.append(
        button("Hide post", async () => {
          await call("instagramHidePost", { id: row.id });
          refresh();
        }),
      );
    section.append(card);
  }
  if (data.posts.length)
    section.append(
      button("Remove all my discovered posts", async () => {
        await call("instagramRemoveAllPosts");
        refresh();
      }),
    );
  const system = await call("instagramDiscoveryStatus");
  const activitySection = el("div");
  activitySection.id = "instagram-system-status";
  activitySection.append(
    el("h4", "Instagram discovery"),
    el(
      "p",
      `${system.collection ? "Collecting" : "Collection paused"} · ${system.publication ? "Publication enabled" : "Publication paused"} · ${system.hashtags ? "Hashtags enabled" : "Hashtags unavailable"} · ${system.pending} awaiting review`,
    ),
  );
  const systemPanel = document.getElementById("system-panel");
  if (systemPanel) {
    document.getElementById("instagram-system-status")?.remove();
    systemPanel.append(activitySection);
  } else section.append(activitySection);
  if (!admin) return;
  const inbox = el("details");
  inbox.append(el("summary", "Post discovery admin inbox"));
  section.append(inbox);
  inbox.addEventListener("toggle", async () => {
    if (!inbox.open || inbox.dataset.loaded) return;
    try {
      const review = await call("instagramDiscoveryInbox");
      inbox.dataset.loaded = "true";
      for (const row of review.posts) {
        const card = el("article");
        card.className = "buddy-card";
        const select = picker(row);
        card.append(
          el("h4", row.author ? "@" + row.author : "Creator unavailable"),
          el("p", row.caption),
          link(row.url),
          select,
          button("Approve at beach", async () => {
            await call("instagramReviewPost", {
              id: row.id,
              mode: "approve",
              beachId: select.value,
            });
            refresh();
          }),
          button("Reject", async () => {
            await call("instagramReviewPost", { id: row.id, mode: "reject" });
            refresh();
          }),
        );
        if (row.author_id)
          card.append(
            button("Suppress creator", async () => {
              await call("instagramSuppressSource", { id: row.id });
              refresh();
            }),
          );
        inbox.append(card);
      }
      for (const report of review.reports) {
        const card = el("article"),
          select = picker({});
        card.append(
          el("h4", "Reported: " + report.reason),
          link(report.url),
          select,
          button("Correct beach", async () => {
            await call("instagramReviewPost", {
              id: report.discovery_id,
              mode: "approve",
              beachId: select.value,
            });
            refresh();
          }),
          button("Hide reported post", async () => {
            await call("instagramHidePost", { id: report.discovery_id });
            refresh();
          }),
        );
        inbox.append(card);
      }
      for (const c of review.connections.filter((c) => !c.media_owner_id)) {
        const card = el("article");
        card.append(el("h4", "Media ownership: @" + c.handle));
        const media = el("input");
        media.placeholder = "Actual Instagram media ID";
        media.setAttribute(
          "aria-label",
          "Media ID authored by verified member",
        );
        const checked = el("input");
        checked.type = "checkbox";
        const label = el(
          "label",
          " I checked this post belongs to the verified Instagram member",
        );
        label.prepend(checked);
        card.append(
          media,
          label,
          button("Verify provider author evidence", async () => {
            await call("instagramBindMediaOwner", {
              userId: c.user_id,
              mediaId: media.value,
              confirmed: checked.checked,
            });
            refresh();
          }),
        );
        inbox.append(card);
      }
      for (const source of system.sources) {
        const card = el("article");
        card.append(
          el(
            "p",
            `${source.key} · ${source.status} · Last collected ${source.last_success ? new Date(source.last_success).toLocaleString() : "never"}`,
          ),
          button("Retry source", async () => {
            await call("instagramDiscoveryRetry", { key: source.key });
            status.textContent = "Source queued for next scheduled collection.";
          }),
        );
        inbox.append(card);
      }
    } catch (e) {
      status.textContent = e.message;
    }
  });
}
