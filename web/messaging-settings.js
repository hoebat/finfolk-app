const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
export async function renderMessagingSettings({ host, api }) {
  if (!api.request) return;
  const root = el("section");
  root.className = "account-card messaging-settings";
  root.hidden = true;
  host.append(root);
  let state,
    events = [],
    busy = false;
  const feedback = el("p");
  feedback.setAttribute("role", "status");
  const commandNames = ["ping", "help", "claim", "status", "checkin", "points"];
  const button = (text, fn) => {
    const b = el("button", text);
    b.type = "button";
    b.className = "secondary";
    let key;
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      b.disabled = true;
      key ||= crypto.randomUUID();
      try {
        await fn(key);
        key = null;
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        busy = false;
        b.disabled = false;
      }
    };
    return b;
  };
  const call = (path, options) =>
    api.request("/v1/admin/messaging/" + path, options);
  const refresh = async () => {
    state = await call("instagram");
    const page = await call("events?limit=25");
    events = page.events;
    draw();
  };
  function draw() {
    root.hidden = false;
    root.replaceChildren(el("h2", "Instagram messaging"), feedback);
    feedback.textContent = "";
    root.append(
      el(
        "p",
        state.mode === "disabled"
          ? "Messaging is paused. Signed webhook receipts are still recorded."
          : "Messaging mode: " + state.mode,
      ),
    );
    root.append(
      el(
        "p",
        "Connected brand: " +
          (state.username ? "@" + state.username : "Not authorized"),
      ),
    );
    if (state.health) {
      const health = el("section");
      health.setAttribute("aria-label", "Messaging health");
      health.append(
        el(
          "h3",
          state.health.status === "paused"
            ? "Paused"
            : state.blockers.length
              ? "Setup needed"
              : state.health.status === "attention"
                ? "Needs attention"
                : "Processing normally",
        ),
      );
      const labels = {
        token_refresh_failed:
          "Reconnect Instagram: automatic token refresh failed.",
        token_expired: "Reconnect Instagram: authorization has expired.",
        subscription_missing:
          "Verify the Instagram account webhook subscription.",
        processing_delayed: "Some commands have waited more than five minutes.",
        uncertain_replies:
          "Inspect uncertain replies in Instagram. Do not resend them automatically.",
        failed_replies:
          "Review failed replies and use safe retry where available.",
      };
      for (const issue of state.health.issues)
        health.append(el("p", labels[issue] || issue));
      health.append(
        el(
          "p",
          `${state.health.pendingReplies} pending · ${state.health.uncertainReplies} uncertain · ${state.health.failedReplies} failed replies`,
        ),
      );
      root.append(health);
    }
    if (state.tokenExpiresAt)
      root.append(
        el(
          "p",
          "Authorization expiry: " +
            new Date(state.tokenExpiresAt).toLocaleString(),
        ),
      );
    const checks = el("ul");
    for (const [label, value] of [
      ["Authorization", state.checks.authorization],
      ["Account subscription", state.checks.subscription],
      ["Public help acceptance", state.checks.publicHelp],
      ["Personal-command follower verification", state.checks.followLookup],
      ["Real-account acceptance", state.checks.liveDelivery],
      [
        state.provider === "instagram-unified"
          ? "Business authorization"
          : "Token refresh",
        state.provider === "instagram-unified"
          ? state.checks.authorization
          : state.checks.tokenRefresh !== false,
      ],
    ])
      checks.append(
        el("li", label + ": " + (value ? "verified" : "not verified")),
      );
    root.append(checks);
    if (state.checks.pendingVerification) root.append(el('p', 'Meta approval received. The Instagram account and webhook subscription still need verification.'));
    if (state.blockers.length)
      root.append(el("p", "Setup needed: " + state.blockers.join(", ")));
    for (const [label, value] of [
      ["Last signed webhook", state.lastWebhookAt],
      ["Last completed command", state.lastCommandAt],
      ["Last provider-accepted reply", state.lastProviderAcceptedAt],
    ])
      root.append(
        el(
          "p",
          label + ": " + (value ? new Date(value).toLocaleString() : "none"),
        ),
      );
    root.append(
      el(
        "p",
        "Provider acceptance does not mean a message was delivered or read.",
      ),
    );
    root.append(
      button("Authorize @finfolk.com.au", async (key) => {
        const data = await call("instagram/authorization", {
          method: "POST",
          body: {},
          idempotencyKey: key,
        });
        location.assign(data.authorizationUrl);
      }),
    );
    const form = el("form"),
      mode = el("select");
    mode.setAttribute("aria-label", "Messaging rollout mode");
    for (const value of ["disabled", "pilot", "live"]) {
      const option = el(
        "option",
        value === "disabled"
          ? "Paused"
          : value === "pilot"
            ? "Pilot accounts only"
            : "Public",
      );
      option.value = value;
      mode.append(option);
    }
    mode.value = state.mode;
    form.append(mode);
    const fields = el("fieldset");
    fields.append(el("legend", "Enabled commands"));
    const inputs = {};
    for (const name of commandNames) {
      const label = el("label"),
        input = el("input");
      input.type = "checkbox";
      input.checked = state.enabledCommands.includes(name);
      inputs[name] = input;
      label.append(input, document.createTextNode("/" + name));
      fields.append(label);
    }
    form.append(fields);
    const pilotLabel = el(
        "label",
        "Pilot sender IDs (one per line, from receipts below)",
      ),
      pilots = el("textarea");
    pilots.value = state.pilotSenderIds.join("\n");
    pilotLabel.append(pilots);
    form.append(pilotLabel);
    const acceptance = el("details");
    acceptance.append(el("summary", "Record real-account acceptance"));
    const field = (text) => {
      const label = el("label", text),
        input = el("input");
      label.append(input);
      acceptance.append(label);
      return input;
    };
    const ping = field("/ping event ID"),
      help = field("/help event ID"),
      publicHelp = field(
        "Separate unregistered nonfollower /help event ID (public help rollout)",
      );
    const checkbox = (text) => {
      const label = el("label"),
        input = el("input");
      input.type = "checkbox";
      label.append(input, document.createTextNode(text));
      acceptance.append(label);
      return input;
    };
    const visible = checkbox(
        "I verified both replies in the actual Instagram thread.",
      ),
      production = checkbox(
        "I verified the Meta permissions and publishing requirements for public access.",
      ),
      negative = checkbox(
        "I verified the nonfollower test in Instagram. For public help, they received help without registration; for personal commands, access was denied.",
      );
    form.append(acceptance);
    let mutationKey, mutationBody;
    const save = el("button", "Save messaging controls");
    save.type = "submit";
    save.className = "primary";
    form.append(save);
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      save.disabled = true;
      try {
        const body = {
          mode: mode.value,
          enabledCommands: commandNames.filter((name) => inputs[name].checked),
          pilotSenderIds: pilots.value.split(/\s+/).filter(Boolean),
        };
        if (ping.value || help.value || publicHelp.value || visible.checked)
          body.acceptance = {
            pingEventId: ping.value.trim(),
            helpEventId: help.value.trim(),
            visibleRepliesConfirmed: visible.checked,
            productionAccessConfirmed: production.checked,
            nonFollowerTestConfirmed: negative.checked,
            ...(publicHelp.value.trim()
              ? { nonFollowerHelpEventId: publicHelp.value.trim() }
              : {}),
          };
        const fingerprint = JSON.stringify(body);
        if (fingerprint !== mutationBody) {
          mutationKey = crypto.randomUUID();
          mutationBody = fingerprint;
        }
        await call("instagram", {
          method: "PUT",
          body,
          idempotencyKey: mutationKey,
        });
        mutationKey = null;
        await refresh();
        feedback.textContent =
          "Messaging controls saved. Old queued work will not be replayed.";
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        busy = false;
        save.disabled = false;
      }
    };
    root.append(form, button("Refresh messaging status", refresh));
    const list = el("details");
    list.append(el("summary", "Recent webhook and command events"));
    if (!events.length)
      list.append(
        el(
          "p",
          "No signed messaging receipts have been recorded. Dashboard test delivery is separate from real-account acceptance.",
        ),
      );
    for (const event of events) {
      const card = el("section");
      card.className = "buddy-card";
      card.append(
        el("h3", "/" + event.command + " · " + event.state),
        el("p", "Event: " + event.id),
        el("p", "Request: " + event.requestId),
        el(
          "p",
          "Sender: " +
            event.senderId +
            (event.handle ? " (@" + event.handle + ")" : ""),
        ),
        el("p", "Received: " + new Date(event.receivedAt).toLocaleString()),
      );
      if (event.errorCode)
        card.append(el("p", "Processing: " + event.errorCode));
      if (event.reply)
        card.append(
          el(
            "p",
            "Reply: " +
              event.reply.state +
              (event.reply.errorCode ? " · " + event.reply.errorCode : ""),
          ),
        );
      if (event.state === "failed" || event.reply?.state === "failed")
        card.append(
          button("Retry safely", async (key) => {
            await call("events/" + event.id + "/retry", {
              method: "POST",
              body: {},
              idempotencyKey: key,
            });
            await refresh();
            feedback.textContent = "Retry scheduled.";
          }),
        );
      if (event.reply?.state === "uncertain")
        card.append(
          el(
            "p",
            "Delivery is uncertain. Inspect the Instagram thread; this reply cannot be automatically resent.",
          ),
        );
      list.append(card);
    }
    root.append(list);
  }
  try {
    await refresh();
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      root.remove();
      return;
    }
    root.hidden = false;
    root.replaceChildren(
      el("h2", "Instagram messaging"),
      feedback,
      button("Retry status", refresh),
    );
    feedback.textContent = error.message;
  }
  return root;
}
