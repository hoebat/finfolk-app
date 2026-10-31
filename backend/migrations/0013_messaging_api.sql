CREATE TABLE finfolk.messaging_accounts (
 id text PRIMARY KEY CHECK(id='instagram'), account_id text, username text,
 credential_ciphertext text, token_expires_at timestamptz,
 mode text NOT NULL DEFAULT 'disabled' CHECK(mode IN ('disabled','pilot','live')),
 enabled_commands jsonb NOT NULL DEFAULT '["ping","help"]', pilot_sender_ids jsonb NOT NULL DEFAULT '[]',
 generation integer NOT NULL DEFAULT 1, checks jsonb NOT NULL DEFAULT '{}',
 last_webhook_at timestamptz, last_command_at timestamptz, last_reply_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO finfolk.messaging_accounts(id) VALUES('instagram');
CREATE TABLE finfolk.messaging_idempotency (
 user_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 key_hash text NOT NULL, request_hash text NOT NULL, response_ciphertext text,
 response_status integer NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key_hash)
);
CREATE TABLE finfolk.messaging_oauth_states (
 state_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE finfolk.instagram_connections ADD COLUMN provider_scope text NOT NULL DEFAULT 'facebook-login:legacy';
ALTER TABLE finfolk.instagram_connections DROP CONSTRAINT instagram_connections_sender_id_key;
CREATE UNIQUE INDEX instagram_sender_scope ON finfolk.instagram_connections(provider_scope,sender_id) WHERE sender_id IS NOT NULL;
ALTER TABLE finfolk.instagram_claims ADD COLUMN claim_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE finfolk.instagram_claims ADD COLUMN provider_scope text NOT NULL DEFAULT 'facebook-login:legacy';
ALTER TABLE finfolk.instagram_dm_events ADD COLUMN event_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE finfolk.instagram_dm_events ADD COLUMN provider_scope text NOT NULL DEFAULT 'facebook-login:legacy';
ALTER TABLE finfolk.instagram_dm_events ADD COLUMN correlation_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE finfolk.instagram_dm_events ADD COLUMN processing_state text NOT NULL DEFAULT 'ignored'
 CHECK(processing_state IN ('received','queued','processing','completed','ignored','blocked','paused','failed'));
ALTER TABLE finfolk.instagram_dm_events ADD COLUMN generation integer NOT NULL DEFAULT 0;
ALTER TABLE finfolk.instagram_dm_events ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE finfolk.instagram_dm_events ADD COLUMN follow_checked_at timestamptz;
ALTER TABLE finfolk.instagram_dm_events ADD COLUMN sender_handle text;
CREATE INDEX messaging_events_work ON finfolk.instagram_dm_events(processing_state,next_attempt_at);
CREATE TABLE finfolk.messaging_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id text NOT NULL UNIQUE REFERENCES finfolk.instagram_dm_events(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(length(body)<=2000), correlation_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','provider_accepted','failed','uncertain','cancelled','expired')),
 attempts integer NOT NULL DEFAULT 0, lease uuid, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 deadline timestamptz NOT NULL, provider_message_id text, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messaging_outbox_work ON finfolk.messaging_outbox(state,next_attempt_at);
CREATE TABLE finfolk.messaging_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, event text NOT NULL, correlation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON finfolk.messaging_accounts,finfolk.messaging_idempotency,finfolk.messaging_oauth_states,finfolk.messaging_outbox,finfolk.messaging_audit FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='finfolk_api') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON finfolk.messaging_accounts,finfolk.messaging_idempotency,finfolk.messaging_oauth_states,finfolk.messaging_outbox,finfolk.messaging_audit TO finfolk_api;
END IF; END $$;
ALTER TABLE finfolk.instagram_dm_events ADD COLUMN rate_limit_key text;
ALTER TABLE finfolk.messaging_accounts ADD COLUMN backoff_until timestamptz;
ALTER TABLE finfolk.messaging_accounts ADD COLUMN provider_scope text;
