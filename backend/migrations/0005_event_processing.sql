ALTER TABLE finfolk.instagram_events ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
