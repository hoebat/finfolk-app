ALTER TABLE finfolk.members ADD COLUMN invite_eligible boolean NOT NULL DEFAULT false;
ALTER TABLE finfolk.members ADD COLUMN joined_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE finfolk.invitations (
 code text PRIMARY KEY, inviter_id text NOT NULL UNIQUE REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE finfolk.invitation_joins (
 invitee_id text PRIMARY KEY REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 inviter_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 verified_sender_id text UNIQUE, rewarded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(invitee_id<>inviter_id)
);
