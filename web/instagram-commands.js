import { activity } from "./activity.js";
const el = (tag, text) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
};
export async function renderCommentCommands({
  host,
  api,
  beaches = [],
  admin = false,
}) {
  const root = el("details");
  root.className = "instagram-comment-commands";
  root.append(el("summary", "Instagram comment commands"));
  host.append(root);
  const status = el("p");
  status.setAttribute("role", "status");
  root.append(status);
  const call = async (action, v) => {
    const task = activity.begin({
      label: "Instagram comment commands",
      kind: "Instagram",
    });
    try {
      const result = await api.call(action, v);
      task.finish();
      return result;
    } catch (e) {
      task.finish({ state: "error", error: e.message });
      throw e;
    }
  };
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
  try {
    const state = await call("instagramCommandStatus");
    status.textContent = state.enabled
      ? "Mention @finfolk.com.au with a command in an Instagram post comment."
      : "Comment automation is in preparation. You can still check in and share posts in FinFolk.";
    const examples = el("ul");
    for (const text of [
      "/status @finfolk.com.au — see whether this post is published",
      "/me @finfolk.com.au — your verified profile",
      "/checkin Bondi Beach @finfolk.com.au — today’s visit",
      "/checkin YYYY-MM-DD Bondi Beach @finfolk.com.au — an earlier visit within 30 days",
      "/publish Bondi Beach @finfolk.com.au — request post sharing",
      "/help @finfolk.com.au — command help",
    ])
      examples.append(el("li", text));
    root.append(
      examples,
      el(
        "p",
        "Check-ins are self-reported visits, not dive statistics. Public replies keep visit details private. Use an explicit date for an earlier visit.",
      ),
    );
    if (state.enabled)
      root.append(
        button("Verify Instagram comments", async () => {
          const result = await call("instagramCommandVerify");
          const label = el(
            "label",
            "Post this one-time command in an Instagram comment mentioning FinFolk within 15 minutes.",
          );
          const input = el("input");
          input.readOnly = true;
          input.value = result.command;
          label.append(input);
          root.append(label);
          input.focus();
          input.select();
          root.append(
            button("Copy command", async () => {
              await navigator.clipboard.writeText(result.command);
              status.textContent =
                "Copied. Post it from your verified Instagram account.";
            }),
          );
        }),
      );
    for (const row of state.commands) {
      const card = el("section");
      card.className = "account-card";
      card.append(
        el("h4", "/" + row.command),
        el("p", row.result || row.state),
        el("small", "Reply: " + row.send_state),
      );
      root.append(card);
      if (row.state === "confirmation" && state.checkins) {
        const beachLabel = el("label", "Beach"),
          select = el("select");
        const blank = el("option", "Choose a beach");
        blank.value = "";
        select.append(blank);
        for (const b of beaches) {
          const option = el("option", b.name);
          option.value = b.id;
          select.append(option);
        }
        beachLabel.append(select);
        const dayLabel = el("label", "Visit date"),
          day = el("input");
        day.type = "date";
        dayLabel.append(day);
        card.append(
          beachLabel,
          dayLabel,
          button("Confirm my visit", async () => {
            await call("instagramCommandConfirm", {
              id: row.id,
              beachId: select.value,
              day: day.value,
            });
            card.replaceChildren(el("p", "Check-in saved."));
          }),
        );
      }
    }
    if (admin) {
      const review = el("details");
      review.append(el("summary", "Command activity and reply review"));
      root.append(review);
      review.append(
        button("Load activity", async () => {
          const rows = await call("instagramCommandReview");
          const list = el("div");
          for (const row of rows) {
            const item = el("section");
            item.className = "account-card";
            item.append(
              el(
                "p",
                `${row.id} · /${row.command} · ${row.state} · ${row.send_state}`,
              ),
            );
            if (row.send_state === "uncertain") {
              const label = el(
                  "label",
                  "Actual Instagram reply ID after checking the thread",
                ),
                input = el("input");
              label.append(input);
              item.append(
                label,
                button("Mark reply confirmed", async () => {
                  await call("instagramCommandResolve", {
                    id: row.id,
                    decision: "sent",
                    replyId: input.value,
                  });
                  item.append(el("p", "Resolved."));
                }),
                button("Skip reply", async () => {
                  await call("instagramCommandResolve", {
                    id: row.id,
                    decision: "skipped",
                  });
                  item.append(el("p", "Skipped."));
                }),
              );
            }
            list.append(item);
          }
          review.append(list);
        }),
      );
    }
  } catch (e) {
    status.textContent = e.message;
  }
  return root;
}
