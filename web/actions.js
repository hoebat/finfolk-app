import { renderInstagramDiscovery } from './instagram-discovery.js';
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
export async function renderActions({
  host,
  discoveryHost,
  api,
  beaches = [],
  refresh = () => {},
}) {
  const root = el("section", undefined, "account-card actions-panel");
  root.id = "member-actions";
  host.append(root);
  const status = el("p");
  status.setAttribute("role", "status");
  const button = (text, fn) => {
    const b = el("button", text, "secondary");
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
  const input = (parent, title, value = "", type = "text") => {
    const label = el("label", title),
      n = el(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") n.type = type;
    n.value = value || "";
    label.append(n);
    parent.append(label);
    return n;
  };
  const call = (action, v) => api.call(action, v);
  root.append(el("h2", "Instagram & actions"), status);
  try {
    const state = await call("instagramStatus"),
      c = state.connection;
    root.append(
      el(
        "p",
        c?.status === "connected"
          ? `@${c.handle} · Connected`
          : "Connect once. Then mention @finfolk.com.au in a public Instagram comment.",
      ),
    );
    if (!state.enabled)
      root.append(
        el(
          "small",
          "Instagram automation is in preparation. Connections are manually reviewed; incoming actions and replies will activate after provider testing.",
        ),
      );
    if (c?.status !== "connected") {
      const handle = input(root, "Your Instagram handle", c?.handle);
      handle.placeholder = "@yourhandle";
      const connectButton = button(
        c?.status === "pending"
          ? "Get a new verification code"
          : "Connect Instagram",
        async () => {
          const data = await call("instagramConnect", { handle: handle.value });
          const instructions = el("div", undefined, "instagram-verification");
          instructions.append(
            el("strong", "1. Open Instagram → @finfolk.com.au → Message"),
            el("p", "2. Send this exact message from your account:"),
            el("code", "FINFOLK " + data.code),
            el(
              "p",
              "3. We’ll review your message and confirm the connection. The code expires in 24 hours.",
            ),
            button("Copy verification message", async () => {
              await navigator.clipboard.writeText("FINFOLK " + data.code);
              status.textContent = "Verification message copied.";
            }),
          );
          const open = el("a", "Open FinFolk on Instagram ↗");
          open.href = "https://www.instagram.com/finfolk.com.au/";
          open.target = "_blank";
          open.rel = "noopener noreferrer";
          instructions.append(open);
          root.querySelector(".instagram-verification")?.remove();
          root.append(instructions);
        },
      );
      if (state.setupReady === false) {
        connectButton.disabled = true;
        connectButton.textContent = "Instagram connections opening soon";
      }
      root.append(connectButton);
    }
    if (c)
      root.append(
        button("Disconnect Instagram", async () => {
          await call("instagramDisconnect");
          refresh();
        }),
      );
    const consent = input(
      root,
      "Show my participation points publicly",
      "",
      "checkbox",
    );
    consent.checked = !!c?.public_points;
    consent.onchange = async () => {
      try {
        await call("instagramPointsConsent", { public: consent.checked });
        status.textContent = "Points visibility saved.";
      } catch (e) {
        consent.checked = !consent.checked;
        status.textContent = e.message;
      }
    };
    root.append(
      el(
        "p",
        `${state.total} participation points · no rewards for depth or breath-hold performance`,
      ),
    );
    const invites = el("details");
    invites.append(el("summary", "Invite friends & invitation statistics"));
    root.append(invites);
    invites.addEventListener("toggle", async () => {
      if (!invites.open || invites.dataset.loaded) return;
      try {
        const data = await call("invitationStatus");
        invites.dataset.loaded = "true";
        const url = input(invites, "Your invite link", data.url);
        url.readOnly = true;
        invites.append(
          button("Copy invite link", async () => {
            await navigator.clipboard.writeText(data.url);
            status.textContent = "Invite link copied.";
          }),
          el(
            "p",
            `${data.joined} joined · ${data.verified} verified Instagram connections · ${data.points} referral points`,
          ),
          el(
            "small",
            "One point to the inviter for each new member who joins using their link and verifies Instagram. These are FinFolk referrals, not verified Instagram mutuals.",
          ),
        );
      } catch (e) {
        status.textContent = e.message;
      }
    });
    const pendingInvite = new URL(location.href).searchParams.get("invite");
    let inviteCode = pendingInvite;
    try {
      if (pendingInvite && /^[A-Za-z0-9_-]{24}$/.test(pendingInvite))
        sessionStorage.setItem("finfolk:invite", pendingInvite);
      inviteCode = sessionStorage.getItem("finfolk:invite") || pendingInvite;
    } catch {}
    if (inviteCode)
      root.append(
        button("Accept invitation", async () => {
          await call("invitationClaim", { code: inviteCode });
          try {
            sessionStorage.removeItem("finfolk:invite");
          } catch {}
          status.textContent =
            "Invitation recorded. Points unlock after Instagram verification.";
        }),
      );
    root.append(
      el("h3", "My actions"),
      el(
        "p",
        "Try a comment such as “@finfolk.com.au log Bondi Beach depth 8m duration 30min”. Review anything that changes your log or shares your statistics.",
      ),
    );
    const actions = await call("instagramActions");
    if (!actions.length)
      root.append(
        el(
          "small",
          "No actions yet. Mentions on private posts are not supported.",
        ),
      );
    function source(card, row) {
      if (row.data.sourceUrl) {
        try {
          const url = new URL(row.data.sourceUrl);
          if (
            url.protocol === "https:" &&
            ["instagram.com", "www.instagram.com"].includes(url.hostname)
          ) {
            const a = el("a", "View source on Instagram ↗");
            a.href = url.href;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            card.append(a);
          }
        } catch {}
      }
    }
    for (const row of actions) {
      const card = el("article", undefined, "buddy-card");
      card.append(el("h4", `${row.kind} · ${row.state}`));
      source(card, row);
      card.append(el("p", row.data.text || ""));
      if (["review", "clarify"].includes(row.state)) {
        if (row.kind === "stats") {
          card.append(
            el(
              "p",
              row.data.reply ||
                "An administrator will prepare your proposed stats reply.",
            ),
          );
          if (row.data.reply)
            card.append(
              button("Approve this exact public reply", async () => {
                await call("instagramConfirm", {
                  id: row.id,
                  reply: row.data.reply,
                });
                refresh();
              }),
            );
        }
        if (row.kind === "dive") {
          const beachSearch = input(card, "Find the dive beach", "", "search");
          const choice = el("select");
          choice.setAttribute("aria-label", "Dive beach");
          const populate = () => {
            choice.replaceChildren();
            choice.append(el("option", "Choose a beach"));
            choice.options[0].value = "";
            for (const beach of beaches
              .filter((b) =>
                b.name.toLowerCase().includes(beachSearch.value.toLowerCase()),
              )
              .slice(0, 100)) {
              const option = el("option", beach.name);
              option.value = beach.id;
              choice.append(option);
            }
          };
          beachSearch.oninput = populate;
          populate();
          card.append(choice);
          const date = input(card, "Dive date", "", "date"),
            duration = input(
              card,
              "Duration (minutes)",
              row.data.duration,
              "number",
            ),
            depth = input(
              card,
              "Maximum depth (metres)",
              row.data.depth,
              "number",
            ),
            notes = input(card, "Notes", "", "textarea"),
            own = input(card, "This was my own dive", "", "checkbox");
          card.append(
            button("Confirm my private dive draft", async () => {
              const beach = beaches.find((b) => b.id === choice.value);
              await call("instagramConfirm", {
                id: row.id,
                beachId: choice.value,
                ownDive: own.checked,
                values: {
                  date: date.value,
                  locationName: beach?.name,
                  beachId: choice.value,
                  durationMinutes: duration.value,
                  maxDepthMetres: depth.value,
                  notes: notes.value,
                },
              });
              refresh();
            }),
          );
        }
        card.append(
          button("Cancel action", async () => {
            await call("instagramCancel", { id: row.id });
            refresh();
          }),
        );
      }
      root.append(card);
    }
    await renderInstagramDiscovery({root:discoveryHost||root,api,beaches,admin:state.admin,refresh});
    if (state.admin) {
      const inbox = el("details");
      inbox.append(el("summary", "Actions admin inbox"));
      root.append(inbox);
      inbox.addEventListener("toggle", async () => {
        if (!inbox.open || inbox.dataset.loaded) return;
        try {
          const data = await call("instagramAdminInbox");
          inbox.dataset.loaded = "true";
          for (const pending of data.connections) {
            const card = el("article", undefined, "buddy-card");
            card.append(el("h4", `Verify @${pending.handle}`));
            const code = input(
                card,
                pending.message_sender_id
                  ? "Message received — code matched (no entry needed)"
                  : "Code from the actual received Instagram message",
              ),
              sender = input(card, "Meta sender ID", pending.message_sender_id),
              checked = input(
                card,
                "I checked the code and sender in the actual Instagram message",
                "",
                "checkbox",
              );
            card.append(
              button("Verify connection", async () => {
                await call("instagramVerify", {
                  userId: pending.user_id,
                  code: code.value,
                  senderId: sender.value,
                  confirmed: checked.checked,
                });
                refresh();
              }),
            );
            inbox.append(card);
          }
          for (const row of data.actions) {
            const card = el("article", undefined, "buddy-card");
            card.append(
              el("h4", `${row.kind} · ${row.state}`),
              el("p", row.data.text || ""),
            );
            source(card, row);
            if (["review", "clarify"].includes(row.state)) {
              if (["reply", "stats"].includes(row.kind)) {
                const reply = input(
                  card,
                  "Proposed reply",
                  row.data.reply,
                  "textarea",
                );
                card.append(
                  button("Save reply draft", async () => {
                    await call("instagramReview", {
                      id: row.id,
                      mode: "edit",
                      reply: reply.value,
                    });
                    refresh();
                  }),
                );
              }
              card.append(
                el(
                  "small",
                  row.member_confirmed
                    ? "Member confirmed"
                    : "No member confirmation",
                ),
                ...["approve", "decline", "clarify"].map((mode) =>
                  button(
                    mode === "approve"
                      ? "Approve & execute"
                      : mode === "decline"
                        ? "Decline"
                        : "Request clarification",
                    async () => {
                      await call("instagramReview", { id: row.id, mode });
                      refresh();
                    },
                  ),
                ),
              );
            }
            if (["uncertain", "sending"].includes(row.state)) {
              const checked = input(
                card,
                "I checked the actual Instagram thread",
                "",
                "checkbox",
              );
              for (const outcome of ["sent", "review"])
                card.append(
                  button(
                    outcome === "sent"
                      ? "Confirm reply was sent"
                      : "Confirmed not sent — allow review",
                    async () => {
                      await call("instagramReconcile", {
                        id: row.id,
                        checked: checked.checked,
                        outcome,
                      });
                      refresh();
                    },
                  ),
                );
            }
            if (row.kind === "points" && row.state === "done")
              card.append(
                button("Reverse points", async () => {
                  await call("instagramReversePoints", { id: row.id });
                  refresh();
                }),
              );
            inbox.append(card);
          }
          for (const event of data.events) {
            inbox.append(
              el(
                "p",
                `${event.id} · ${event.status} · ${event.error || "Waiting for provider activation"}`,
              ),
            );
            if (event.status === "error")
              inbox.append(
                button("Retry event", async () => {
                  await call("instagramRetryEvent", { id: event.id });
                  refresh();
                }),
              );
          }
        } catch (e) {
          status.textContent = e.message;
        }
      });
    }
  } catch (e) {
    status.textContent = e.message;
  }
  return root;
}
