-- FINFOLK <code> manual verification has no approval path after /connect.
-- Preserve every established connection and self-provided profile link.
UPDATE finfolk.instagram_connections
SET status='disconnected',challenge_hash=null,expires_at=null,updated_at=now()
WHERE status='pending';
