# Instagram connection and commands

See [Messaging API](MESSAGING_API.md), [OpenAPI](openapi/messaging.yaml) and the [activation runbook](INSTAGRAM_ACTIVATION.md) for transport and operator controls.

## Connect an account

1. Follow **@finfolk.com.au** from the Instagram account you want to connect.
2. Send **`/connect`** to that account in an Instagram DM.
3. In signed-in FinFolk, open **Your FinFolk → Instagram → Connect Instagram** and enter the eight-character code from the reply.

Codes expire after ten minutes. Spaces, hyphens and lowercase are accepted. Sending `/connect` again replaces the previous unused code. Verify your FinFolk email before redeeming. The site displays the connected Instagram account when successful.

The sender and current follow relationship are verified by Meta at issuance and redemption. A code cannot transfer an existing connection to another member. Use **Remove link** to disconnect, then send a fresh `/connect` to relink. Removal invalidates old codes and cancels unsent member work. Established connections and profile/privacy settings are preserved by the retirement migration.

Self-provided profile links remain available when messaging connection is unavailable. A saved URL does not prove ownership or enable member features. Connecting does not grant public-post sharing consent.

## Retired workflows

`/claim` is retired immediately, including previously issued codes. Its reply directs the sender to `/connect`; it never consumes a code or establishes a link. Legacy claim creation, review requests, manual approval and `FINFOLK <code>` verification return `410 claim_retired`. Old cached success responses cannot reopen these mutation routes. Read-only connection status retains historical `claimed` values for compatibility.

## Commands

| Command | Result |
| --- | --- |
| `/ping` | Diagnostic response. |
| `/help` | Currently enabled commands and connection instructions. |
| `/connect` | A private, ten-minute connection code after a current follower check. |
| `/status` | Current connection or instructions to connect. |
| `/checkin <beach>` | Today's self-reported visit using the beach's local date and existing privacy rules. |
| `/points` | Participation and referral totals. |

Followers and nonfollowers can use public help and ping within the configured rollout. Connecting and personal features require following. A confirmed nonfollower receives **“Please follow @finfolk.com.au to use this feature.”** with retry instructions; no personal result or feature effect is produced. Missing or failed follower verification fails closed.

Commands are case-insensitive and use one line starting with `/`. Unknown commands return help. Ordinary messages receive at most one help prompt per sender per day. Member commands require a verified connection; check-ins and points keep their separate enablement controls. No free-form AI processing or arbitrary-recipient send API is provided.

## Security and delivery

The signed webhook records minimal command metadata, not a chat archive. Connection challenges store code hashes; the durable code reply is encrypted with AES-256-GCM and bound to its incoming event. Admin event APIs and operational logs never contain codes. Sending rechecks the active challenge, sender, scope, rollout generation, expiry and current following.

Issuance is limited to three codes per sender per ten minutes. Redemption permits ten attempts per member and trusted client IP per fifteen minutes; failed attempts count. Redemption is transactional, ownership-checked and idempotent. Duplicate receipts do not create extra codes, links or referral rewards. Disconnect and account deletion invalidate related codes.

An ambiguous provider send becomes uncertain and is never automatically resent. Meta acceptance does not establish delivered/read status. Pending work is bounded by the incoming messaging window and cancelled when its connection or rollout is invalidated.

## Rollout and verification

Apply additive migration `0016_instagram_connect.sql` before deploying the backend. `MIGRATIONS_THROUGH=0016_instagram_connect.sql` stages the normal migration runner at that boundary. After backend cutover, run the remaining immutable migrations to cancel old claim/manual challenges and remove `claim` from enabled commands. Then deploy the UI. The old auto-claim switch never enables legacy writes.

Enable `connect` through Settings in the existing pilot first, retaining its allowlisted signed senders and diagnostic commands. Do not widen public access or claim production acceptance merely because deployment succeeds. Pause messaging to roll back delivery; retain established connections and never reactivate `/claim`.

Run the repository test/build checks, `tests/test_instagram_connect.mjs` and the isolated real-SQL messaging integration. Coverage includes encryption, duplicate delivery, expired/replaced codes, failed follower lookup, email/ownership gates, replay, competing redemption, persistent limits and disconnect/reconnect. Confirm visible replies and the signed-in code dialog with consenting real accounts separately.
