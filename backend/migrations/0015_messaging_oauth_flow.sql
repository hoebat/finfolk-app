ALTER TABLE finfolk.messaging_oauth_states ADD COLUMN flow_key text;
-- Pending authorizations without a transport/config binding must be restarted.
