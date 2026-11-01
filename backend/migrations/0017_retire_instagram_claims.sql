-- Retire pending legacy challenges without altering verified connections.
UPDATE finfolk.instagram_claims SET state='cancelled',code_hash=null,updated_at=now()
WHERE state<>'claimed';
UPDATE finfolk.messaging_accounts SET enabled_commands=enabled_commands-'claim';
UPDATE finfolk.messaging_outbox SET state='cancelled',error_code='claim_retired'
WHERE state='pending' AND event_id IN (SELECT id FROM finfolk.instagram_dm_events WHERE command IN ('claim','claim_usage'));
UPDATE finfolk.instagram_dm_events SET processing_state='blocked',error='claim_retired'
WHERE command IN ('claim','claim_usage') AND processing_state IN ('received','queued','failed','processing');
