CREATE TABLE finfolk.instagram_claims (
 user_id text PRIMARY KEY REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 code_hash text UNIQUE,
 state text NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','checking','follow_required','failed','review_requested','claimed','cancelled')),
 sender_id text, handle text, error text NOT NULL DEFAULT '',
 expires_at timestamptz NOT NULL, follow_checked_at timestamptz,
 review_requested_at timestamptz, verified_by text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE finfolk.instagram_dm_events (
 id text PRIMARY KEY, sender_id text NOT NULL, recipient_id text NOT NULL,
 command text NOT NULL, args text NOT NULL DEFAULT '', challenge_hash text,
 message_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','done','error')),
 attempts integer NOT NULL DEFAULT 0, lease uuid,
 reply text, send_state text NOT NULL DEFAULT 'pending' CHECK(send_state IN ('pending','sending','sent','uncertain','skipped')),
 error text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_dm_pending ON finfolk.instagram_dm_events(status,created_at);
CREATE INDEX instagram_dm_claim ON finfolk.instagram_dm_events(challenge_hash,sender_id);
CREATE TABLE finfolk.instagram_dm_limits (
 sender_id text PRIMARY KEY, minute timestamptz NOT NULL DEFAULT date_trunc('minute',now()),
 count integer NOT NULL DEFAULT 0, prompted_at timestamptz
);
REVOKE ALL ON finfolk.instagram_claims,finfolk.instagram_dm_events,finfolk.instagram_dm_limits FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finfolk_api') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON finfolk.instagram_claims,finfolk.instagram_dm_events,finfolk.instagram_dm_limits TO finfolk_api;
 END IF;
END $$;
ALTER TABLE finfolk.beaches ADD COLUMN area_name text NOT NULL DEFAULT '', ADD COLUMN state text NOT NULL DEFAULT '';
