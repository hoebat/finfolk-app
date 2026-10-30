CREATE SCHEMA IF NOT EXISTS finfolk;
CREATE TABLE IF NOT EXISTS finfolk.members (
 user_id text PRIMARY KEY, profile jsonb NOT NULL DEFAULT '{}', deleted boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finfolk.beaches (
 id text PRIMARY KEY, name text NOT NULL, timezone text NOT NULL
);
CREATE TABLE IF NOT EXISTS finfolk.checkins (
 user_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 beach_id text NOT NULL REFERENCES finfolk.beaches(id), visit_day date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,beach_id,visit_day)
);
CREATE INDEX IF NOT EXISTS checkins_beach_recent ON finfolk.checkins(beach_id,visit_day,user_id);
CREATE TABLE IF NOT EXISTS finfolk.connections (
 a text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 b text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 requested_by text NOT NULL, status text NOT NULL CHECK(status IN ('pending','accepted','declined','removed')),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(a,b),CHECK(a<b), CHECK(requested_by=a OR requested_by=b)
);
CREATE TABLE IF NOT EXISTS finfolk.blocks (
 owner_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 target_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 PRIMARY KEY(owner_id,target_id),CHECK(owner_id<>target_id)
);
CREATE TABLE IF NOT EXISTS finfolk.reports (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, owner_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 target_id text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finfolk.sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 beach_id text REFERENCES finfolk.beaches(id), data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_owner_beach ON finfolk.sessions(owner_id,beach_id);
CREATE TABLE IF NOT EXISTS finfolk.posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 beach_id text NOT NULL REFERENCES finfolk.beaches(id), url text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_id,beach_id,url)
);
-- No browser-facing Data API. All access is authenticated and scoped in the API.
REVOKE ALL ON ALL TABLES IN SCHEMA finfolk FROM PUBLIC;
CREATE TABLE IF NOT EXISTS finfolk.request_limits (
 user_id text PRIMARY KEY REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 minute timestamptz NOT NULL, count integer NOT NULL
);
