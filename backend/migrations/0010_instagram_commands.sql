-- Comment actor IDs are not DM sender IDs. A one-time member challenge binds them.
CREATE TABLE finfolk.instagram_comment_identities (
 user_id text PRIMARY KEY REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 namespace text NOT NULL, actor_id text, sender_id text NOT NULL, handle text NOT NULL,
 challenge_hash text UNIQUE, expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(namespace,actor_id)
);
CREATE TABLE finfolk.instagram_commands (
 id text PRIMARY KEY, context text NOT NULL CHECK(context IN ('mention','owned')),
 actor_id text NOT NULL, namespace text NOT NULL, media_id text,
 owner_id text REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 command text NOT NULL, args jsonb NOT NULL DEFAULT '{}', source_url text,
 comment_at timestamptz, received_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'new' CHECK(state IN ('new','confirmation','done','cancelled','limited')),
 result text, beach_id text REFERENCES finfolk.beaches(id), visit_day date,
 reply text, send_state text NOT NULL DEFAULT 'pending' CHECK(send_state IN ('pending','sending','sent','uncertain','skipped')),
 reply_id text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_commands_owner ON finfolk.instagram_commands(owner_id,received_at DESC);
CREATE INDEX instagram_commands_sender ON finfolk.instagram_commands(namespace,actor_id,received_at DESC);
CREATE INDEX instagram_commands_post ON finfolk.instagram_commands(media_id,received_at DESC);
CREATE INDEX instagram_commands_send ON finfolk.instagram_commands(updated_at) WHERE send_state IN ('pending','sending','uncertain');
REVOKE ALL ON finfolk.instagram_comment_identities,finfolk.instagram_commands FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='finfolk_api') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON finfolk.instagram_comment_identities,finfolk.instagram_commands TO finfolk_api;
END IF; END $$;
