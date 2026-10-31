ALTER TABLE finfolk.instagram_commands ADD COLUMN send_started_at timestamptz;
CREATE INDEX instagram_commands_sent_recent ON finfolk.instagram_commands(send_started_at DESC) WHERE send_started_at IS NOT NULL;
