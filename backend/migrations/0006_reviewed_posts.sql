-- Legacy posts remain pending and unconsented until their owners resubmit.
ALTER TABLE finfolk.posts
 ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','removed')),
 ADD COLUMN public_consent boolean NOT NULL DEFAULT false,
 ADD COLUMN creator_handle text NOT NULL DEFAULT '',
 ADD COLUMN platform text NOT NULL DEFAULT '',
 ADD COLUMN rejection_reason text NOT NULL DEFAULT '',
 ADD COLUMN reviewed_by text,
 ADD COLUMN reviewed_at timestamptz,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX posts_public_feed ON finfolk.posts(beach_id,created_at DESC,id DESC) WHERE status='approved' AND public_consent;
CREATE INDEX posts_review_queue ON finfolk.posts(status,created_at DESC);
CREATE TABLE finfolk.post_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 post_id uuid NOT NULL REFERENCES finfolk.posts(id) ON DELETE CASCADE,
 actor text NOT NULL, decision text NOT NULL, reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE finfolk.post_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES finfolk.posts(id) ON DELETE CASCADE,
 reporter_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 resolved_by text, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(post_id,reporter_id)
);
CREATE TABLE finfolk.community_referrals (
 day date NOT NULL DEFAULT (now() AT TIME ZONE 'Australia/Sydney')::date,
 platform text NOT NULL CHECK(platform IN ('instagram','tiktok')),
 clicks bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(day,platform)
);
REVOKE ALL ON finfolk.post_reviews,finfolk.post_reports,finfolk.community_referrals FROM PUBLIC;
