export async function messagingHealth(q, config, { now = Date.now() } = {}) {
  const events = (
    await q(
      `SELECT count(*) FILTER(WHERE processing_state IN ('received','queued','processing','failed') AND next_attempt_at<now()-interval '5 minutes')::int AS stalled FROM finfolk.instagram_dm_events WHERE generation=$1 AND provider_scope=$2`,
      [config.generation, config.scope],
    )
  )[0];
  const replies = (
    await q(
      `SELECT count(*) FILTER(WHERE o.state='pending')::int AS pending,
    count(*) FILTER(WHERE o.state='uncertain')::int AS uncertain,count(*) FILTER(WHERE o.state='failed')::int AS failed
    FROM finfolk.messaging_outbox o JOIN finfolk.instagram_dm_events e ON e.id=o.event_id WHERE e.provider_scope=$1`,
      [config.scope],
    )
  )[0];
  const issues = [];
  if (config.checks?.tokenRefresh === false)
    issues.push("token_refresh_failed");
  if (config.token_expires_at && Date.parse(config.token_expires_at) <= now)
    issues.push("token_expired");
  if (config.checks?.authorization && !config.checks?.subscription)
    issues.push("subscription_missing");
  if (Number(events?.stalled) > 0) issues.push("processing_delayed");
  if (Number(replies?.uncertain) > 0) issues.push("uncertain_replies");
  if (Number(replies?.failed) > 0) issues.push("failed_replies");
  return {
    status:
      config.mode === "disabled"
        ? "paused"
        : issues.length
          ? "attention"
          : "healthy",
    issues,
    pendingReplies: Number(replies?.pending) || 0,
    uncertainReplies: Number(replies?.uncertain) || 0,
    failedReplies: Number(replies?.failed) || 0,
    stalledCommands: Number(events?.stalled) || 0,
  };
}
