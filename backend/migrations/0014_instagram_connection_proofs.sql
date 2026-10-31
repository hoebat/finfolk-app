-- A relink to the same sender must invalidate proofs from the previous connection.
ALTER TABLE finfolk.instagram_connections ADD COLUMN identity_version uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE finfolk.instagram_comment_identities
 ADD COLUMN connection_scope text NOT NULL DEFAULT 'facebook-login:legacy',
 ADD COLUMN connection_version uuid;
-- Existing bindings lack cross-transport evidence and require a fresh comment challenge.
CREATE INDEX instagram_comment_connection ON finfolk.instagram_comment_identities(user_id,connection_scope,connection_version);
