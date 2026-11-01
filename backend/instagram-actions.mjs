import { commentCommandAction } from './instagram-commands.mjs';
import { instagramClaimAction } from './instagram-claims.mjs';
import { instagramHandle, sessionInput } from "../web/logbook-model.js";
import { instagramContentClient } from "./instagram-content.mjs";
const error = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
export const isInstagramAdmin = (uid, env) =>
  (env.INSTAGRAM_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(uid);
export function parseActionRequest(text = "") {
  const kinds = ["reply"];
  if (/\bstats\b/i.test(text)) kinds.push("stats");
  if (/\blog\b/i.test(text)) kinds.push("dive");
  if (/\bpoints?\b/i.test(text)) kinds.push("points");
  const number = (key) => {
    const units = key === "depth" ? "m|metres|meters" : "min|mins|minutes";
    const match = text.match(
      new RegExp(
        `\\b${key}\\s+(\\d+(?:\\.\\d+)?)(?:\\s*(?:${units}))?(?=\\s|$|[.,;!?])`,
        "i",
      ),
    );
    return match ? Number(match[1]) : null;
  };
  return { kinds, depth: number("depth"), duration: number("duration") };
}
async function audit(q, id, uid, event) {
  await q(
    "INSERT INTO finfolk.instagram_audit(action_id,actor,event) VALUES($1,$2,$3)",
    [id, uid, event],
  );
}
export async function instagramAction({ action, v, uid, env, q, db, verified, fetcher = fetch }) {
  if(['instagramConnect','instagramVerify'].includes(action))throw Object.assign(Error('Use /connect in Instagram, then enter the code on FinFolk.'),{status:410,code:'claim_retired'});
  const admin = isInstagramAdmin(uid, env),
    enabled = env.INSTAGRAM_ENABLED === "true";
  if (typeof action === 'string' && action.startsWith('instagramCommand')) return commentCommandAction({action,v,uid,env,q,db,verified,admin});
  if (typeof action === 'string' && action.startsWith('instagramClaim')) return instagramClaimAction({action,v,uid,env,q,db,verified,admin});
  if (action === "instagramProfileLink") {
    if (typeof v.handle !== 'string' || v.handle.length > 250) error('Enter your Instagram username.');
    let handle;
    try { handle = instagramHandle(v.handle).toLowerCase(); } catch (validation) { error(validation.message); }
    if (!handle) error('Enter your Instagram username.');
    const profileUrl = 'https://www.instagram.com/' + handle + '/';
    await db.transaction(async tq => {
      await tq('SELECT user_id FROM finfolk.members WHERE user_id=$1 FOR UPDATE',[uid]);
      if ((await tq("SELECT 1 FROM finfolk.instagram_connections WHERE user_id=$1 AND status='connected'",[uid])).length)
        error('Remove the verified connection before linking a different account.',409);
      await tq("UPDATE finfolk.members SET profile=jsonb_set(profile,'{instagram}',to_jsonb($2::text)),updated_at=now() WHERE user_id=$1",[uid,profileUrl]);
    });
    return {profileUrl};
  }
  if (action === "instagramStatus") {
    const connection =
      (
        await q(
          "SELECT handle,status,public_points,expires_at FROM finfolk.instagram_connections WHERE user_id=$1",
          [uid],
        )
      )[0] || null;
    const total =
      (
        await q(
          "SELECT coalesce(sum(points),0)::integer AS total FROM finfolk.points_ledger WHERE user_id=$1 AND reversed=false",
          [uid],
        )
      )[0]?.total || 0;
    const referrals =
      (
        await q(
          "SELECT count(*)::integer AS total FROM finfolk.invitation_joins WHERE inviter_id=$1 AND rewarded_at IS NOT NULL",
          [uid],
        )
      )[0]?.total || 0;
    return {
      connection,
      total: total + referrals,
      admin,
      enabled,
      setupReady: !!env.INSTAGRAM_ADMIN_IDS,
    };
  }
  if (action === "instagramDisconnect") {
    const disconnect = async tq => {
      await tq("UPDATE finfolk.messaging_outbox SET state='cancelled',error_code='connection_removed' WHERE state='pending' AND event_id IN (SELECT id FROM finfolk.instagram_dm_events WHERE owner_id=$1)",[uid]);
      await tq("UPDATE finfolk.instagram_dm_events SET processing_state='blocked',error='connection_removed' WHERE owner_id=$1 AND processing_state IN ('received','queued','failed','processing')",[uid]);
      await tq("SELECT user_id FROM finfolk.instagram_claims WHERE user_id=$1 FOR UPDATE",[uid]);
      await tq("SELECT user_id FROM finfolk.members WHERE user_id=$1 FOR UPDATE",[uid]);
      await tq("UPDATE finfolk.instagram_connect_codes SET invalidated=true WHERE consumed_by=$1 OR (provider_scope,sender_id) IN (SELECT provider_scope,sender_id FROM finfolk.instagram_connections WHERE user_id=$1)",[uid]);
      await tq("DELETE FROM finfolk.instagram_comment_identities WHERE user_id=$1",[uid]);
      await tq("UPDATE finfolk.instagram_commands SET state='cancelled',send_state=CASE WHEN send_state='pending' THEN 'skipped' ELSE send_state END WHERE owner_id=$1 AND (state='confirmation' OR send_state='pending')",[uid]);
      await tq("UPDATE finfolk.instagram_claims SET state='cancelled',code_hash=null,updated_at=now() WHERE user_id=$1",[uid]);
      await tq("UPDATE finfolk.instagram_connections SET status='disconnected',identity_version=gen_random_uuid(),sender_id=null,challenge_hash=null,expires_at=null,public_points=false,share_posts=false,media_owner_id=null,updated_at=now() WHERE user_id=$1",[uid]);
      await tq("UPDATE finfolk.members SET profile=jsonb_set(profile,'{instagram}','\"\"'::jsonb),updated_at=now() WHERE user_id=$1",[uid]);
      await tq("UPDATE finfolk.instagram_discoveries SET state='hidden',updated_at=now() WHERE owner_id=$1 AND state IN ('pending','published')",[uid]);
      await tq("UPDATE finfolk.posts SET status='removed',public_consent=false,updated_at=now() WHERE owner_id=$1 AND platform='instagram' AND status IN ('pending','approved')",[uid]);
      await tq("UPDATE finfolk.instagram_actions SET state='cancelled',updated_at=now() WHERE owner_id=$1 AND state NOT IN ('done','sent','uncertain','sending')",[uid]);
    };
    if (db?.transaction) await db.transaction(disconnect);
    else await disconnect(q);
    return { ok: true };
  }
  if (action === "instagramPointsConsent") {
    await q(
      "UPDATE finfolk.instagram_connections SET public_points=$2 WHERE user_id=$1",
      [uid, v.public === true],
    );
    return { ok: true };
  }
  if (action === "instagramActions")
    return await q(
      "SELECT id,kind,state,data,member_confirmed,created_at FROM finfolk.instagram_actions WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
      [uid],
    );
  if (action === "instagramAdminInbox") {
    if (!admin) error("Administrator access required.", 403);
    return {
      connections: await q(
        "SELECT c.user_id,c.handle,c.status,c.expires_at,(SELECT e.payload->>'senderId' FROM finfolk.instagram_events e WHERE e.payload->>'challengeHash'=c.challenge_hash AND e.id LIKE 'dm:%' ORDER BY e.created_at DESC LIMIT 1) AS message_sender_id FROM finfolk.instagram_connections c WHERE c.status='pending' ORDER BY c.updated_at LIMIT 100",
      ),
      actions: await q(
        "SELECT * FROM finfolk.instagram_actions ORDER BY created_at DESC LIMIT 100",
      ),
      events: await q(
        "SELECT id,status,error,created_at FROM finfolk.instagram_events WHERE status<>'done' ORDER BY created_at DESC LIMIT 100",
      ),
    };
  }
  if (action === "instagramRetryEvent") {
    if (!admin) error("Administrator access required.", 403);
    if (!/^(?:media:)?\d{1,40}$/.test(v.id || "")) error("Invalid provider event.");
    await q(
      "UPDATE finfolk.instagram_events SET status='queued',attempts=0,error=null WHERE id=$1 AND status='error'",
      [v.id],
    );
    if (enabled && env.INSTAGRAM_QUEUE)
      await env.INSTAGRAM_QUEUE.send({ id: v.id });
    return { ok: true };
  }
  const row = (
    await q("SELECT * FROM finfolk.instagram_actions WHERE id::text=$1", [
      String(v.id || ""),
    ])
  )[0];
  if (!row || (!admin && row.owner_id !== uid))
    error("Action unavailable.", 404);
  if (action === "instagramReconcile") {
    if (!admin) error("Administrator access required.", 403);
    if (
      row.state === "sending" &&
      Date.now() - new Date(row.updated_at).getTime() < 20 * 60000
    )
      error("This reply may still be in flight. Wait before reconciling.", 409);
    if (
      !["uncertain", "sending"].includes(row.state) ||
      v.checked !== true ||
      !["sent", "review"].includes(v.outcome)
    )
      error("Check the actual Instagram thread before reconciling.");
    await q(
      "UPDATE finfolk.instagram_actions SET state=$2,updated_at=now() WHERE id=$1 AND state IN ('uncertain','sending')",
      [row.id, v.outcome],
    );
    await audit(q, row.id, uid, "reconciled_" + v.outcome);
    return { ok: true };
  }
  const connection = (
    await q(
      "SELECT * FROM finfolk.instagram_connections WHERE user_id=$1 AND status='connected'",
      [row.owner_id],
    )
  )[0];
  if (action === "instagramReversePoints") {
    if (!admin || row.kind !== "points")
      error("Administrator access required.", 403);
    await q(
      "UPDATE finfolk.points_ledger SET reversed=true WHERE action_id=$1",
      [row.id],
    );
    await audit(q, row.id, uid, "points_reversed");
    return { ok: true };
  }
  if (
    !(admin && !row.owner_id && row.kind === "reply") &&
    (!connection || connection.sender_id !== row.sender_id)
  )
    error("Instagram connection is no longer active.", 409);
  if (action === "instagramCancel") {
    const rows = await q(
      "UPDATE finfolk.instagram_actions SET state='cancelled',updated_at=now() WHERE id=$1 AND state IN ('review','clarify','approved') RETURNING id",
      [row.id],
    );
    if (!rows.length) error("This action can no longer be cancelled.", 409);
    await audit(q, row.id, uid, "cancelled");
    return { ok: true };
  }
  if (action === "instagramConfirm") {
    if (row.owner_id !== uid)
      error("Only the requesting member can confirm this action.", 403);
    if (row.state !== "review" && row.state !== "clarify")
      error("Action is no longer awaiting confirmation.", 409);
    let data = { ...row.data };
    if (row.kind === "stats") {
      if (v.reply !== row.data.reply || !v.reply)
        error("Review the exact proposed public reply before confirming.");
    } else if (row.kind === "dive") {
      if (v.ownDive !== true) error("Confirm this is your own dive.");
      try {
        data.session = sessionInput(v.values);
      } catch (e) {
        error(e.message);
      }
      data.session.visibility = "private";
      data.session.photos = [];
      if (
        !v.beachId ||
        (await q("SELECT id FROM finfolk.beaches WHERE id=$1", [v.beachId]))
          .length !== 1
      )
        error("Choose a known beach.");
      data.beachId = v.beachId;
    } else error("This action does not need member confirmation.");
    await q(
      "UPDATE finfolk.instagram_actions SET data=$2::jsonb,member_confirmed=true,state='review',updated_at=now() WHERE id=$1 AND state IN ('review','clarify')",
      [row.id, JSON.stringify(data)],
    );
    await audit(q, row.id, uid, "member_confirmed");
    return { ok: true };
  }
  if (action === "instagramReview") {
    if (!admin) error("Administrator access required.", 403);
    if (!["approve", "decline", "clarify", "edit"].includes(v.mode))
      error("Unknown review action.");
    if (row.state !== "review" && row.state !== "clarify")
      error("Action already processed.", 409);
    if (v.mode === "decline" || v.mode === "clarify") {
      await q(
        "UPDATE finfolk.instagram_actions SET state=$2,updated_at=now() WHERE id=$1 AND state IN ('review','clarify')",
        [row.id, v.mode === "decline" ? "declined" : "clarify"],
      );
      await audit(q, row.id, uid, v.mode);
      return { ok: true };
    }
    if (v.mode === "edit") {
      if (
        !["reply", "stats"].includes(row.kind) ||
        typeof v.reply !== "string" ||
        !v.reply.trim() ||
        v.reply.length > 1500
      )
        error("Write a reply of up to 1,500 characters.");
      // Stats are deliberately member-written/approved: no private statistics are automatically disclosed.
      await q(
        "UPDATE finfolk.instagram_actions SET data=jsonb_set(data,'{reply}',$2::jsonb),member_confirmed=false,state='review' WHERE id=$1 AND state IN ('review','clarify')",
        [row.id, JSON.stringify(v.reply.trim())],
      );
      await audit(q, row.id, uid, "reply_edited");
      return { ok: true };
    }
    if (row.kind === "dive") {
      if (!row.member_confirmed || !row.data.session)
        error("The member must confirm their own dive first.");
      await q(
        "WITH claimed AS (UPDATE finfolk.instagram_actions SET state='done',session_id=gen_random_uuid(),updated_at=now() WHERE id=$1 AND state='review' AND member_confirmed=true RETURNING *) INSERT INTO finfolk.sessions(id,owner_id,beach_id,data) SELECT session_id,owner_id,data->>'beachId',data->'session' FROM claimed",
        [row.id],
      );
    } else if (row.kind === "points") {
      await q(
        "WITH claimed AS (UPDATE finfolk.instagram_actions SET state='done',updated_at=now() WHERE id=$1 AND state='review' RETURNING *) INSERT INTO finfolk.points_ledger(user_id,action_id,day) SELECT owner_id,id,(created_at AT TIME ZONE 'Australia/Melbourne')::date FROM claimed ON CONFLICT DO NOTHING",
        [row.id],
      );
    } else {
      if (!enabled)
        error(
          "Instagram delivery is disabled pending provider acceptance tests.",
          503,
        );
      if (row.kind === "stats" && !row.member_confirmed)
        error("Member consent is required for the exact stats reply.");
      if (!row.data.reply) error("Prepare a reply first.");
      const client = await instagramContentClient(env, q, { capability: 'mentions', fetcher });
      const claimed = await q(
        "UPDATE finfolk.instagram_actions SET state='sending',updated_at=now() WHERE id=$1 AND state='review' AND data=$2::jsonb AND ($3::boolean=false OR member_confirmed=true) RETURNING id",
        [row.id, JSON.stringify(row.data), row.kind === "stats"],
      );
      if (!claimed.length) error("Action already claimed.", 409);
      try {
        const output = await client.request(client.accountId + '/mentions', {}, {
            method: "POST", body: new URLSearchParams({
              comment_id: row.source_id,
              message: row.data.reply,
            }),
        });
        if (!output.id)
          throw Error("Provider outcome requires review");
        await q(
          "UPDATE finfolk.instagram_actions SET state='sent',data=jsonb_set(data,'{replyId}',$2::jsonb),updated_at=now() WHERE id=$1",
          [row.id, JSON.stringify(String(output.id))],
        );
      } catch {
        await q(
          "UPDATE finfolk.instagram_actions SET state='uncertain',updated_at=now() WHERE id=$1",
          [row.id],
        );
        error(
          "Reply outcome is uncertain. Reconcile in Instagram before taking any further action.",
          502,
        );
      }
    }
    await audit(q, row.id, uid, "approved");
    return { ok: true };
  }
  if (action === "instagramReversePoints") {
    if (!admin) error("Administrator access required.", 403);
    await q(
      "UPDATE finfolk.points_ledger SET reversed=true WHERE action_id=$1",
      [row.id],
    );
    await audit(q, row.id, uid, "points_reversed");
    return { ok: true };
  }
  error("Unknown Instagram action.");
}
