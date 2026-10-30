CREATE TABLE finfolk.instagram_connections (
 user_id text PRIMARY KEY REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 handle text NOT NULL, sender_id text UNIQUE, status text NOT NULL DEFAULT 'pending',
 challenge_hash text, expires_at timestamptz, public_points boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instagram_connected_handle ON finfolk.instagram_connections(lower(handle)) WHERE status='connected';
CREATE TABLE finfolk.instagram_events (
 id text PRIMARY KEY, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0, error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE finfolk.instagram_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text NOT NULL,
 owner_id text REFERENCES finfolk.members(user_id) ON DELETE CASCADE, sender_id text,
 kind text NOT NULL CHECK(kind IN ('reply','stats','dive','points')),
 state text NOT NULL DEFAULT 'review', data jsonb NOT NULL DEFAULT '{}',
 member_confirmed boolean NOT NULL DEFAULT false, session_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,kind)
);
CREATE INDEX instagram_actions_owner ON finfolk.instagram_actions(owner_id,created_at DESC);
CREATE TABLE finfolk.instagram_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, action_id uuid REFERENCES finfolk.instagram_actions(id) ON DELETE CASCADE,
 actor text NOT NULL, event text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE finfolk.points_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 action_id uuid NOT NULL UNIQUE REFERENCES finfolk.instagram_actions(id), day date NOT NULL,
 points integer NOT NULL DEFAULT 1 CHECK(points=1), reversed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,day)
);
