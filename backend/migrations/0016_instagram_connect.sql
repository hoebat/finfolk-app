CREATE TABLE finfolk.instagram_connect_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code_hash text NOT NULL UNIQUE,
 sender_id text NOT NULL, handle text NOT NULL, provider_scope text NOT NULL,
 generation integer NOT NULL,
 event_id text NOT NULL UNIQUE REFERENCES finfolk.instagram_dm_events(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 invalidated boolean NOT NULL DEFAULT false,
 consumed_by text REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 consumed_version uuid, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_connect_sender ON finfolk.instagram_connect_codes(provider_scope,sender_id);
CREATE TABLE finfolk.instagram_connect_limits (
 bucket text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL
);
ALTER TABLE finfolk.messaging_outbox
 ADD COLUMN body_ciphertext text,
 ADD COLUMN reply_kind text NOT NULL DEFAULT 'text' CHECK(reply_kind IN ('text','connect_code','connect_guidance')),
 ADD COLUMN connect_code_id uuid REFERENCES finfolk.instagram_connect_codes(id) ON DELETE SET NULL;
REVOKE ALL ON finfolk.instagram_connect_codes,finfolk.instagram_connect_limits FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='finfolk_api') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON finfolk.instagram_connect_codes,finfolk.instagram_connect_limits TO finfolk_api;
END IF; END $$;
