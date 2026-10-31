ALTER TABLE finfolk.instagram_dm_events ADD COLUMN owner_id text REFERENCES finfolk.members(user_id) ON DELETE CASCADE;
CREATE INDEX instagram_dm_owner ON finfolk.instagram_dm_events(owner_id) WHERE owner_id IS NOT NULL;
