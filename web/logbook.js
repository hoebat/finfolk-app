import {tripCards} from './trip-report.js';
import { getInstagramFeed } from './instagram-discovery.js';
import { instagramPanel } from "./instagram.js";
import { socialGallery } from "./media.js";
import { readResource } from "./activity.js";
import {
  instagramURL,
  instagramHandle,
  sessionLink,
  profileLink,
  MAX_PHOTOS,
} from "./logbook-model.js";
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const button = (text, fn, cls = "secondary") => {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = fn;
  return b;
};
const link = (text, url) => {
  const a = el("a", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
};
export function friendlyError(error) {
  const code = error?.code || "";
  if (/permission-denied|unauthorized/.test(code))
    return "This session is private or unavailable. Sign in with its owner account to open it.";
  if (/invalid-credential|wrong-password|user-not-found/.test(code))
    return "Check your email and password and try again.";
  if (
    /email-already-in-use|account-exists-with-different-credential/.test(code)
  )
    return "An account already uses this email. Sign in with its existing method, then link the other method in Account.";
  if (/popup-blocked|popup-closed/.test(code))
    return "The Google sign-in window was closed or blocked. Allow popups and try again.";
  if (/network|unavailable/.test(code))
    return "The connection failed. Your form is still here; try again when online.";
  if (/requires-recent-login|failed-precondition/.test(code))
    return error.message || "Sign in again and retry.";
  if (/weak-password/.test(code))
    return "Choose a stronger password with at least 8 characters.";
  return error.message || "Something went wrong. Please try again.";
}
export function installLogbook({
  shell,
  getBeaches = () => [],
  getSelectedBeach = () => null,
  loadJSON = (path) =>
    readResource(new URL(path, import.meta.url), { read: "json", cache: "no-cache" }),
  loadClient = () => import("./neon-client.js"),
} = {}) {
  const root = document.getElementById("logbook-page"),
    nav = document.querySelector('.primary-nav [data-view="logbook"]');
  let config,
    api,
    ready,
    epoch = 0,
    urls = [],
    editor = null,
    instagramUI = null;
  const status = el("p", "", "logbook-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  function release() {
    instagramUI?.dispose();
    instagramUI = null;
    for (const url of urls) URL.revokeObjectURL(url);
    urls = [];
  }
  function message(text) {
    status.textContent = text;
  }
  async function run(fn, control) {
    if (control?.disabled) return;
    const generation = epoch;
    if (control) control.disabled = true;
    message("");
    try {
      return await fn();
    } catch (error) {
      if (generation === epoch) message(friendlyError(error));
      return null;
    } finally {
      if (control?.isConnected) control.disabled = false;
    }
  }
  function action(text, fn, cls) {
    let b;
    b = button(text, () => run(() => fn(b), b), cls);
    return b;
  }
  function field(form, label, name, type = "text", value = "") {
    const wrap = el("label", label),
      input = el(type === "textarea" ? "textarea" : "input");
    input.name = name;
    if (type !== "textarea") input.type = type;
    input.value = value ?? "";
    wrap.append(input);
    form.append(wrap);
    return input;
  }
  function navigate(params = {}) {
    editor = null;
    shell.navigate("logbook", {
      params: { session: null, profile: null, ...params },
    });
  }
  function header(title) {
    release();
    root.replaceChildren();
    const head = el("header", undefined, "logbook-header");
    const group = el("div");
    group.append(el("p", "YOUR TIME IN THE WATER", "eyebrow"), el("h1", title));
    head.append(group);
    const actions = el("div", undefined, "logbook-actions");
    if (api?.user) {
      actions.append(
        button("My sessions", () => navigate()),
        button("Account", () => shell.navigate("account")),
        action("Sign out", async () => {
          editor = null;
          await api.signOut();
          await render();
        }),
      );
    } else if (title !== "Logbook") {
      actions.append(button("Sign in", () => navigate(), "primary"));
    }
    head.append(actions);
    root.append(head, status);
    message("");
  }
  async function init() {
    config = await loadJSON("neon-config.json?v=" + encodeURIComponent(new URL(import.meta.url).pathname.split("/").pop()));
    nav.hidden = true;
    if (!config.enabled) return;
    const module = await loadClient();
    api = await module.createLogbookClient(config);
    let resolve;
    const first = new Promise((r) => (resolve = r));
    api.observe(async (user) => {
      epoch++;
      release();
      editor = null;
      root.replaceChildren(el("p", "Loading your logbook…"));
      try {
        if (user) await api.ensureProfile();
      } catch (error) {
        message(friendlyError(error));
      }
      resolve();
      if (shell.route.view === "logbook") await render();
    });
    await first;
  }
  async function start() {
    if (!ready)
      ready = init().catch((error) => {
        ready = null;
        throw error;
      });
    await ready;
  }
  function instagram(profile) {
    if (!profile?.instagram) return null;
    const box = el("div", undefined, "instagram-profile");
    box.append(
      link(
        `Follow @${profile.instagram} on Instagram`,
        instagramURL(profile.instagram),
      ),
      el("small", "Instagram profile · added by this diver"),
    );
    return box;
  }
  async function gallery(session, parent, generation) {
    const grid = el("div", undefined, "session-photos");
    parent.append(grid);
    for (const slot of session.photos || []) {
      const wrap = el("figure"),
        image = el("img");
      image.alt = `Photo from ${session.locationName}`;
      wrap.append(image);
      grid.append(wrap);
      try {
        const blob = await api.photo(session, slot);
        if (generation !== epoch) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        image.src = url;
      } catch {
        if (generation === epoch)
          wrap.replaceChildren(
            el("p", "Photo unavailable. Reopen the session to retry."),
          );
      }
    }
  }
  function card(session) {
    const article = el("article", undefined, "session-card"),
      open = button(
        session.locationName,
        () => navigate({ session: session.id }),
        "session-title",
      );
    article.append(
      el(
        "small",
        `${session.date} · ${session.visibility === "public" ? "Published" : "Private"}`,
      ),
      open,
    );
    const stats = [];
    if (session.durationMinutes !== null)
      stats.push(`${session.durationMinutes} min`);
    if (session.maxDepthMetres !== null)
      stats.push(`${session.maxDepthMetres} m maximum`);
    if (stats.length) article.append(el("p", stats.join(" · ")));
    if (session.notes) article.append(el("p", session.notes.slice(0, 180)));
    return article;
  }
  async function list(owner, publicOnly = false) {
    const generation = epoch,
      box = el("div", undefined, "session-grid");
    root.append(box);
    const more = action("Load more sessions", async () => {
      await page(cursor);
    });
    let cursor = null;
    root.append(more);
    async function page(after) {
      const result = await api.list({ owner, publicOnly, cursor: after });
      if (generation !== epoch) return;
      cursor = result.cursor;
      for (const item of result.sessions) box.append(card(item));
      more.hidden = !result.more;
      if (!after && !result.sessions.length)
        box.append(
          el(
            "p",
            publicOnly
              ? "No published sessions yet."
              : "Your first session starts here. Save a beach, a few notes and the moments you want to remember.",
            "logbook-empty",
          ),
        );
    }
    await page(null);
  }
  function login() {
    const box = el("section", undefined, "logbook-card auth-card");
    box.append(
      el("h2", "Keep your time in the water"),
      el("p", "Save private sessions and choose what to share."),
    );
    box.append(action("Continue with Google", () => api.google(), "primary"));
    const form = el("form");
    const email = field(form, "Email", "email", "email");
    email.autocomplete = "email";
    email.required = true;
    const password = field(form, "Password", "password", "password");
    password.autocomplete = "current-password";
    password.minLength = 8;
    password.required = true;
    const submit = el("button", "Sign in", "primary");
    submit.type = "submit";
    form.append(submit);
    form.onsubmit = (e) => {
      e.preventDefault();
      run(() => api.email(email.value, password.value), submit);
    };
    box.append(
      form,
      action("Create account", async () => {
        password.autocomplete = "new-password";
        if (!form.reportValidity()) return;
        await api.email(email.value, password.value, true);
        message("Check your email to verify your account.");
      }),
      action("Reset password", async () => {
        if (!email.reportValidity() || !email.value) {
          email.focus();
          throw Error("Enter your email address first.");
        }
        await api.reset(email.value);
        message("If this account exists, a reset email will arrive shortly.");
      }),
    );
    root.append(box);
  }
  async function render() {
    if (shell.route.view !== "logbook") return;
    const generation = ++epoch;
    release();
    header("Logbook");
    try {
      await start();
      if (generation !== epoch || shell.route.view !== "logbook") return;
      if (!config.enabled) {
        root.append(
          el(
            "section",
            "The logbook is being prepared. Check back soon.",
            "logbook-card",
          ),
        );
        return;
      }
      header("Logbook");
      const params = new URL(location.href).searchParams,
        sessionId = params.get("session"),
        profileId = params.get("profile");
      if (sessionId) {
        await detail(sessionId);
        return;
      }
      if (profileId) {
        await publicProfile(profileId);
        return;
      }
      if (!api.user) {
        login();
        return;
      }
      const tools = el("div", undefined, "logbook-actions");
      tools.append(
        button("Log a session", () => edit(), "primary"),
        action("View public profile", () =>
          navigate({ profile: api.user.uid }),
        ),
      );
      root.append(tools);
      if (!api.user.emailVerified) {
        const banner = el("div", undefined, "logbook-card");
        banner.append(
          el("p", "Verify your email before publishing sessions."),
          action("Send verification email", async () => {
            await api.verify();
            message("Verification email sent.");
          }),
          action("I have verified", async () => {
            await api.refresh();
            await render();
          }),
        );
        root.append(banner);
      }
      if (config.instagram?.enabled) {
        instagramUI=instagramPanel({api,beaches:getBeaches(),notify:message,brand:config.instagramHandle || "finfolk.com.au"});
        root.append(instagramUI.root);
      }
      await list(api.user.uid);
    } catch (error) {
      if (generation !== epoch) return;
      message(friendlyError(error));
      if (api && !api.user) login();
      root.append(button("Retry", () => render()));
    }
  }
  async function publicProfile(id) {
    const generation = epoch,
      p = await api.profile(id);
    if (generation !== epoch) return;
    header(p?.displayName || "Diver");
    if (p?.bio) root.append(el("p", p.bio));
    const ig = instagram(p);
    if (ig) root.append(ig);
    root.append(action("Share profile", () => share(profileLink(id))));
    if (config.instagram?.enabled) {
      const posts=await api.instagramPosts({owner:id});
      if(generation !== epoch) return;
      const gallery=socialGallery(posts);
      if(gallery) root.append(gallery);
    }
    if(config.apiUrl)tripCards(root,config.apiUrl,{ownerId:id,isCurrent:()=>generation===epoch}).catch(()=>{});
    await list(id, true);
  }
  async function share(url) {
    if (navigator.share) {
      try {
        await navigator.share({ title: "FinFolk", url });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      message("Link copied.");
    } else {
      const input = el("input");
      input.value = url;
      input.readOnly = true;
      root.append(input);
      input.select();
      message("Copy this link to share it.");
    }
  }
  async function detail(id) {
    const generation = epoch,
      s = await api.get(id);
    if (generation !== epoch) return;
    if (s.visibility !== "public" && api.user?.uid !== s.ownerId)
      throw Error("This session is private. Sign in with its owner account.");
    const p = await api.profile(s.ownerId);
    if (generation !== epoch) return;
    header(s.locationName);
    const article = el("article", undefined, "logbook-card session-detail");
    article.append(
      el(
        "p",
        `${s.date} · ${s.visibility === "public" ? "Published" : "Private"}`,
      ),
    );
    const stats = el("div", undefined, "session-stats");
    if (s.durationMinutes !== null)
      stats.append(el("strong", `${s.durationMinutes} min`));
    if (s.maxDepthMetres !== null)
      stats.append(el("strong", `${s.maxDepthMetres} m maximum`));
    article.append(stats);
    if (s.notes) article.append(el("p", s.notes, "session-notes"));
    article.append(
      button(
        p?.displayName || "Diver",
        () => navigate({ profile: s.ownerId }),
        "text-button",
      ),
    );
    const ig = instagram(p);
    if (ig) article.append(ig);
    root.append(article);
    const actions = el("div", undefined, "logbook-actions");
    root.append(actions);
    if (s.visibility === "public")
      actions.append(action("Share session", () => share(sessionLink(s.id))));
    if (api.user?.uid === s.ownerId) {
      if (s.deleting) {
        actions.append(
          action("Retry deletion", async () => {
            await api.deleteSession(id);
            navigate();
          }),
        );
      } else {
        actions.append(
          action("Edit", async () => {
            if (s.visibility === "public") {
              if (!confirm("Make this session private before editing?")) return;
              await api.visibility(id, "private");
              s.visibility = "private";
            }
            edit(s);
          }),
          action(
            s.visibility === "public" ? "Unpublish" : "Publish",
            async () => {
              if (s.visibility === "public") {
                await api.visibility(id, "private");
                await render();
              } else publish(s);
            },
          ),
          action("Delete", async () => {
            if (!confirm("Delete this session and its photos permanently?"))
              return;
            await api.deleteSession(id);
            navigate();
          }),
        );
      }
    }
    await gallery(s, article, generation);
    if (config.instagramHandle && generation === epoch) {
      const invite = el("aside", undefined, "follow-invitation");
      invite.append(
        link(
          "Follow FinFolk on Instagram",
          instagramURL(config.instagramHandle),
        ),
      );
      root.append(invite);
    }
  }
  function publish(s) {
    if (!api.user.emailVerified) {
      message("Verify your email in Account before publishing.");
      return;
    }
    const dialog = el("dialog", undefined, "logbook-dialog"),
      body = el("div");
    body.append(
      el("h2", "Publish this session?"),
      el(
        "p",
        "Everyone with the link or your public profile can see the location, notes and photos below.",
      ),
      el("h3", s.locationName),
      el("p", s.date),
      el("p", s.notes, "session-notes"),
    );
    const actions = el("div", undefined, "logbook-actions");
    actions.append(
      button("Keep private", () => dialog.close()),
      action(
        "Publish for everyone",
        async () => {
          await api.visibility(s.id, "public");
          dialog.close();
          await render();
        },
        "primary",
      ),
    );
    body.append(actions);
    dialog.append(body);
    root.append(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
    gallery(s, body, epoch);
  }
  function edit(session = null, beach = null) {
    ++epoch;
    header(session ? "Edit session" : "Log a session");
    editor = session ? { ...session } : { id: null, photos: [] };
    const form = el("form", undefined, "logbook-card session-form");
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const date = field(
      form,
      "Date",
      "date",
      "date",
      session?.date || today.toISOString().slice(0, 10),
    );
    date.required = true;
    const place = field(
      form,
      "Beach or location",
      "locationName",
      "text",
      session?.locationName || beach?.name || "",
    );
    place.required = true;
    place.maxLength = 160;
    place.setAttribute("list", "logbook-beaches");
    const places = el("datalist");
    places.id = "logbook-beaches";
    for (const b of getBeaches()) {
      const option = el("option");
      option.value = `${b.name} · ${b.state || ""}`;
      option.dataset.id = b.id;
      places.append(option);
    }
    form.append(places);
    let selected = beach || null;
    place.oninput = () => {
      selected =
        getBeaches().find(
          (b) => `${b.name} · ${b.state || ""}` === place.value,
        ) || null;
    };
    const duration = field(
      form,
      "Duration (minutes, optional)",
      "durationMinutes",
      "number",
      session?.durationMinutes,
    );
    duration.min = 0;
    duration.max = 1440;
    duration.step = "any";
    const depth = field(
      form,
      "Maximum depth (metres, optional)",
      "maxDepthMetres",
      "number",
      session?.maxDepthMetres,
    );
    depth.min = 0;
    depth.max = 300;
    depth.step = "any";
    const notes = field(
      form,
      "Notes",
      "notes",
      "textarea",
      session?.notes || "",
    );
    notes.maxLength = 10000;
    notes.rows = 6;
    const existing = el("div", undefined, "logbook-actions");
    form.append(existing);
    for (const slot of editor.photos)
      existing.append(
        action(`Remove photo ${Number(slot) + 1}`, async (b) => {
          await api.removePhoto(editor.id, slot);
          editor.photos = editor.photos.filter((p) => p !== slot);
          b.remove();
        }),
      );
    const files = field(form, "Photos (up to six)", "photos", "file");
    files.accept = "image/jpeg,image/png,image/webp";
    files.multiple = true;
    files.closest("label").hidden = true;
    form.append(el("p", "Keep photos on Instagram or TikTok. Add post links on a beach page."));
    let pending = [];
    files.onchange = () => {
      pending = [...files.files];
    };
    form.append(
      el(
        "small",
        "Post links can be added on each beach page.",
      ),
    );
    const submit = el("button", "Save private session", "primary");
    submit.type = "submit";
    const actions = el("div", undefined, "logbook-actions");
    actions.append(
      submit,
      button("Cancel", () => {
        if (confirm("Discard unsaved changes?")) {
          editor = null;
          render();
        }
      }),
    );
    form.append(actions);
    form.onsubmit = (e) => {
      e.preventDefault();
      run(async () => {
        const draft = editor,
          generation = epoch;
        if (draft.photos.length + pending.length > MAX_PHOTOS)
          throw Error("Choose no more than six photos per session.");
        const locationChanged = place.value !== session?.locationName;
        const values = {
          date: date.value,
          locationName: selected?.name || place.value,
          beachId:
            selected?.id || (!locationChanged ? session?.beachId : "") || "",
          point:
            selected?.point ||
            (!locationChanged ? session?.point : null) ||
            null,
          durationMinutes: duration.value,
          maxDepthMetres: depth.value,
          notes: notes.value,
        };
        draft.id = await api.save(draft.id, values);
        files.disabled = true;
        try {
          while (pending.length) {
            const slot = ["0", "1", "2", "3", "4", "5"].find(
              (s) => !draft.photos.includes(s),
            );
            message(
              `Uploading photo ${draft.photos.length + 1} of ${draft.photos.length + pending.length}…`,
            );
            await api.upload(draft.id, slot, pending[0]);
            draft.photos.push(slot);
            pending.shift();
          }
          files.value = "";
          if (generation === epoch) navigate({ session: draft.id });
        } finally {
          files.disabled = false;
        }
      }, submit);
    };
    root.append(form);
    date.focus();
  }
  async function account() {
    const generation = ++epoch;
    header("Account");
    const p = await api.profile(api.user.uid);
    if (generation !== epoch) return;
    const form = el("form", undefined, "logbook-card");
    const name = field(
      form,
      "Display name",
      "displayName",
      "text",
      p?.displayName || "",
    );
    name.required = true;
    name.maxLength = 80;
    const bio = field(form, "Biography", "bio", "textarea", p?.bio || "");
    bio.maxLength = 500;
    const instagramField = field(
      form,
      "Instagram handle or profile link",
      "instagram",
      "text",
      p?.instagram || "",
    );
    form.append(
      el(
        "small",
        "Your name, biography and Instagram link are public. Instagram links are user-provided.",
      ),
    );
    const save = el("button", "Save profile", "primary");
    save.type = "submit";
    form.append(save);
    form.onsubmit = (e) => {
      e.preventDefault();
      run(async () => {
        instagramHandle(instagramField.value);
        await api.saveProfile({
          displayName: name.value,
          bio: bio.value,
          instagram: instagramField.value,
        });
        message("Profile saved.");
      }, save);
    };
    root.append(form);
    if (config.instagram?.enabled) {
      instagramUI=instagramPanel({api,beaches:getBeaches(),notify:message,brand:config.instagramHandle || "finfolk.com.au"});
      root.append(instagramUI.root);
    }
    const settings = el("section", undefined, "logbook-card");
    settings.append(el("h2", "Sign-in methods"), el("p", api.user.email || ""));
    const providers = api.user.providerData.map((p) => p.providerId);
    if (!providers.includes("google.com"))
      settings.append(
        action("Link Google", async () => {
          await api.linkGoogle();
          await account();
        }),
      );
    if (!providers.includes("password")) {
      const password = field(
        settings,
        "Add an email password",
        "new-password",
        "password",
      );
      password.minLength = 8;
      password.autocomplete = "new-password";
      settings.append(
        action("Add password sign-in", async () => {
          if (password.value.length < 8)
            throw Error("Use at least 8 characters.");
          await api.linkPassword(api.user.email, password.value);
          await account();
        }),
      );
    }
    if (!api.user.emailVerified)
      settings.append(
        action("Send verification email", async () => {
          await api.verify();
          message("Verification email sent.");
        }),
        action("Check verification", async () => {
          await api.refresh();
          await account();
        }),
      );
    const password = providers.includes("google.com")
      ? null
      : field(
          settings,
          "Password to confirm account deletion",
          "delete-password",
          "password",
        );
    if (password) password.autocomplete = "current-password";
    settings.append(
      action("Delete account and all sessions", async () => {
        if (!confirm("Permanently delete your account, sessions and photos?"))
          return;
        await api.reauthenticate(password?.value);
        await api.deleteAccount();
        await api.signOut();
        navigate();
      }),
    );
    root.append(settings);
  }
  shell.subscribe(() => {
    epoch++;
    release();
    if (shell.route.view === "logbook") render();
    else editor = null;
  });
  loadJSON("neon-config.json?v=" + encodeURIComponent(new URL(import.meta.url).pathname.split("/").pop()))
    .then((value) => {
      config = value;
      nav.hidden = true;
      const logButton = document.getElementById("log-session");
      if (logButton) logButton.hidden = !value.enabled || !getSelectedBeach();
    })
    .catch(() => {
      nav.hidden = true;
    });
  if (shell.route.view === "logbook") render();
  return {
    get enabled() {
      return !!config?.enabled;
    },
    async publicInstagramPosts(beachId) {
      config ||= await loadJSON("neon-config.json");
      if (!config.enabled || !config.apiUrl) return [];
      const discovered=await getInstagramFeed(config.apiUrl,beachId).catch(()=>({posts:[]}));
      const shared=api?.user?await api.instagramPosts({beachId}).catch(()=>[]):[];
      const seen=new Set();
      function page(result,extra=[]){const posts=[...result.posts,...extra].filter(p=>{if(seen.has(p.url))return false;seen.add(p.url);return true;}).map(p=>({...p,reportApi:config.apiUrl}));if(result.cursor)posts.next=async()=>page(await getInstagramFeed(config.apiUrl,beachId,result.cursor));return posts;}
      return page(discovered,shared);
    },
    async newSession(beach) {
      await start();
      if (!config.enabled) return;
      navigate();
      if (!api.user) {
        message("Sign in, then select Log a session.");
        return;
      }
      edit(null, beach);
    },
    render,
  };
}
