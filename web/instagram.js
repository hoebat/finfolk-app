import { socialGallery } from "./media.js";
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
export function instagramPanel({
  api,
  beaches = [],
  notify = () => {},
  brand = "finfolk.com.au",
}) {
  const root = el("section", undefined, "logbook-card instagram-connect");
  let disposed = false,
    code = null,
    busy = false;
  const input = (parent, label, type = "text") => {
    const wrap = el("label", label),
      field = el("input");
    field.type = type;
    wrap.append(field);
    parent.append(wrap);
    return field;
  };
  const button = (parent, title, fn) => {
    const b = el("button", title, "secondary");
    b.type = "button";
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        if (!disposed) notify(e.message || "Please retry.");
      } finally {
        busy = false;
        if (b.isConnected) b.disabled = false;
      }
    };
    parent.append(b);
    return b;
  };
  const link = (parent, title, url) => {
    const a = el("a", title);
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    parent.append(a);
  };
  async function render() {
    const state = await api.instagramStatus();
    if (disposed || !root.isConnected) return;
    root.replaceChildren(el("h2", "Instagram"));
    const verified = state?.status === "verified";
    if (verified) {
      root.append(
        el(
          "p",
          `@${state.handle} · Verified${state.importsEnabled ? " · Importing" : " · Paused"}`,
        ),
        el(
          "small",
          "Account ownership and following checked at setup. This is not a diving qualification.",
        ),
      );
      button(
        root,
        state.importsEnabled ? "Pause importing" : "Resume importing",
        async () => {
          await api.manageInstagram(state.importsEnabled ? "pause" : "resume");
          await render();
        },
      );
    } else {
      root.append(el("p", "Follow once. Verify once. Then just tag us."));
      if (state?.status === "pending")
        root.append(
          el("p", "Verification pending", "instagram-pending"),
          el(
            "small",
            state.messageReceivedAt
              ? "Message received. We’re checking your username and follow status."
              : "Send the verification message from the Instagram account below.",
          ),
        );
      const form = el("form"),
        name = input(form, "Your Instagram username");
      name.value = state?.handle || "";
      name.required = true;
      name.maxLength = 30;
      name.autocomplete = "off";
      link(form, `1. Follow @${brand}`, `https://www.instagram.com/${brand}/`);
      const consent = input(
        form,
        "Automatically show my eligible public posts that tag FinFolk on my public FinFolk profile and location pages. I can pause imports or remove posts.",
        "checkbox",
      );
      consent.required = true;
      const submit = el(
        "button",
        state?.status === "pending"
          ? "Get a new verification code"
          : "2. Get verification code",
        "primary",
      );
      submit.type = "submit";
      form.append(submit);
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (busy) return;
        busy = true;
        submit.disabled = true;
        try {
          if (!consent.checked) throw Error("Agree to public indexing first.");
          code = await api.requestInstagramVerification(
            name.value,
            consent.checked,
          );
          busy = false;
          await render();
        } catch (e) {
          notify(e.message);
        } finally {
          busy = false;
          if (submit.isConnected) submit.disabled = false;
        }
      };
      if (!api.user.emailVerified) {
        submit.disabled = true;
        root.append(el("p", "Verify your email in Account to continue."));
      }
      root.append(form);
      if (code && Date.parse(code.expiresAt) > Date.now()) {
        root.append(
          el("p", "3. Send this exact message to FinFolk on Instagram"),
          el("code", code.code),
          el(
            "small",
            "Code expires after 30 minutes. Keep this page open while you send it.",
          ),
        );
        button(root, "Copy verification message", async () => {
          await navigator.clipboard.writeText(code.code);
          notify("Copied. Send it to FinFolk from your Instagram account.");
        });
        link(
          root,
          "Open FinFolk on Instagram",
          `https://www.instagram.com/${brand}/`,
        );
      }
    }
    if (state && state.status !== "disconnected")
      button(root, "Disconnect Instagram", async () => {
        if (
          !confirm(
            "Stop future imports? Existing posts stay visible until you remove them.",
          )
        )
          return;
        await api.manageInstagram("disconnect");
        code = null;
        await render();
      });
    button(root, "Refresh status", render);
    root.append(
      el(
        "small",
        "Public posts and reels only. Instagram may not make every tagged post available.",
      ),
    );
    const posts = await api.instagramPosts({ owner: api.user.uid });
    if (disposed || !root.isConnected) return;
    root.append(el("h3", "My Instagram posts"));
    if (!posts.length)
      root.append(
        el("p", "Your tagged posts will appear here after verification."),
      );
    async function appendPosts(posts) {
      for (const post of posts) {
        const card = socialGallery([post]);
        if (!card) continue;
        const location = el("select");
        location.setAttribute("aria-label", "Post beach");
        const empty = el("option", "Choose a beach");
        empty.value = "";
        location.append(empty);
        for (const beach of [...beaches].sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          const o = el(
            "option",
            `${beach.name}${beach.state ? " · " + beach.state : ""}`,
          );
          o.value = beach.id;
          location.append(o);
        }
        location.value = post.beachId || "";
        card.append(location);
        button(card, "Save location", async () => {
          if (!location.value) throw Error("Choose a beach.");
          await api.editInstagramPost(post.id, "location", location.value);
          await render();
        });
        button(card, "Remove from FinFolk", async () => {
          await api.editInstagramPost(post.id, "remove");
          await render();
        });
        root.append(card);
      }
      if (posts.more) {
        const more = button(root, "More Instagram posts", async () => {
          const next = await api.instagramPosts({
            owner: api.user.uid,
            cursor: posts.cursor,
          });
          if (disposed || !root.isConnected) return;
          more.remove();
          await appendPosts(next);
        });
      }
    }
    await appendPosts(posts);
    if (await api.isInstagramAdmin()) await admin();
  }
  async function admin() {
    const q = await api.instagramAdminQueue();
    if (disposed || !root.isConnected) return;
    const section = el("details", undefined, "instagram-admin");
    section.append(el("summary", "Instagram verification inbox"));
    for (const member of q.connections) {
      const card = el("section", undefined, "logbook-card");
      card.append(
        el("h3", `@${member.handle}`),
        el(
          "p",
          member.messageReceivedAt
            ? "Verification message received"
            : "Check the verification message in Instagram",
        ),
      );
      link(
        card,
        "Open Instagram messages",
        "https://www.instagram.com/direct/inbox/",
      );
      const code = input(
        card,
        "Code from their Instagram message (if not received automatically)",
      );
      const ownership = input(
        card,
        "I checked that the message sender owns this exact username",
        "checkbox",
      );
      const following = input(
        card,
        "I checked that this account follows FinFolk",
        "checkbox",
      );
      button(card, "Verify member", async () => {
        await api.approveInstagram({
          uid: member.uid,
          code: code.value,
          ownershipChecked: ownership.checked,
          followChecked: following.checked,
        });
        await render();
      });
      section.append(card);
    }
    for (const post of q.media) {
      const card = el("section", undefined, "logbook-card");
      card.append(el("h3", "Unmatched post"));
      link(card, "Check original post", post.url);
      const name = input(card, "Verified member’s Instagram username");
      name.value = post.username || "";
      const checked = input(
        card,
        "I checked the original post and confirmed this is its author",
        "checkbox",
      );
      button(card, "Resolve author", async () => {
        await api.resolveInstagramMedia({
          id: post.id,
          username: name.value,
          authorshipChecked: checked.checked,
        });
        await render();
      });
      section.append(card);
    }
    root.append(section);
  }
  // Initial render runs once the caller attaches the panel.
  queueMicrotask(() => render().catch((e) => notify(e.message)));
  return {
    root,
    dispose() {
      disposed = true;
      code = null;
    },
  };
}
