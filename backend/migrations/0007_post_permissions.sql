-- The Worker uses finfolk_api, not the schema owner's credentials.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finfolk_api') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON finfolk.post_reviews,finfolk.post_reports,finfolk.community_referrals TO finfolk_api;
  GRANT USAGE,SELECT ON SEQUENCE finfolk.post_reviews_id_seq TO finfolk_api;
 END IF;
END $$;
