ALTER TABLE finfolk.instagram_connections ADD COLUMN share_posts boolean NOT NULL DEFAULT false;
-- DM sender IDs and media-owner IDs are different namespaces. Never infer equality.
ALTER TABLE finfolk.instagram_connections ADD COLUMN media_owner_id text;
CREATE UNIQUE INDEX instagram_media_owner ON finfolk.instagram_connections(media_owner_id) WHERE media_owner_id IS NOT NULL;
CREATE TABLE finfolk.instagram_discoveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), media_id text UNIQUE, url text NOT NULL UNIQUE,
 owner_id text REFERENCES finfolk.members(user_id) ON DELETE SET NULL,
 author_id text, author text, beach_id text REFERENCES finfolk.beaches(id),
 candidates jsonb NOT NULL DEFAULT '[]', caption text NOT NULL DEFAULT '',
 posted_at timestamptz, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','published','hidden','rejected','unavailable')),
 automatic boolean NOT NULL DEFAULT false, sources jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), checked_at timestamptz,
 CHECK(media_id IS NULL OR media_id ~ '^[0-9]{1,40}$')
);
CREATE INDEX instagram_discovery_feed ON finfolk.instagram_discoveries(beach_id,created_at DESC,id DESC) WHERE state='published';
CREATE INDEX instagram_discovery_owner ON finfolk.instagram_discoveries(owner_id,created_at DESC);
CREATE INDEX instagram_discovery_review ON finfolk.instagram_discoveries(created_at) WHERE state='pending';
CREATE TABLE finfolk.instagram_sources (
 key text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('tags','hashtag','recheck')),
 data jsonb NOT NULL DEFAULT '{}', checkpoint text, last_success timestamptz, next_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, failures integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'ready'
);
CREATE TABLE finfolk.instagram_discovery_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, discovery_id uuid REFERENCES finfolk.instagram_discoveries(id) ON DELETE CASCADE,
 actor text NOT NULL, event text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE finfolk.instagram_suppressed_sources (author_id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE finfolk.instagram_post_reports (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, discovery_id uuid NOT NULL REFERENCES finfolk.instagram_discoveries(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN ('wrong_location','inappropriate','removed','other')), day date NOT NULL DEFAULT current_date,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(discovery_id,reason,day)
);
INSERT INTO finfolk.instagram_sources(key,kind) VALUES('tags','tags'),('recheck','recheck');
INSERT INTO finfolk.instagram_sources(key,kind,data)
 SELECT 'hashtag:'||tag,'hashtag',jsonb_build_object('tag',tag) FROM unnest(ARRAY['portphillipbay','edithvale','morningtonpeninsula','portseabeach','bondibeach','maroubrabeach','gordonsbay','clovellybeach','jervisbay','hyamsbeach']) tag;
REVOKE ALL ON ALL TABLES IN SCHEMA finfolk FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finfolk_api') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA finfolk TO finfolk_api;
  GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA finfolk TO finfolk_api;
 END IF;
END $$;
