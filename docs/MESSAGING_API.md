# Instagram messaging API

For the staged operator runbook and cross-provider publication rules, see [Instagram activation](INSTAGRAM_ACTIVATION.md).

The API contract is [OpenAPI 3.0](openapi/messaging.yaml). The command bot serves only `@finfolk.com.au`. API availability, signed-webhook receipt, command completion, provider acceptance and visible Instagram delivery are separate states.

## Authentication and interfaces

All `/v1/me/instagram` routes require a Neon Auth bearer JWT and enforce member ownership. Creating claims requires verified email. `/v1/admin/messaging` additionally requires verified email and membership in server-only `INSTAGRAM_ADMIN_IDS`. OAuth callbacks authenticate the initiating administrator through single-use, ten-minute state plus a fresh server-side account/role check.

Mutating REST calls require `Idempotency-Key` (8–128 letters, digits, underscores or hyphens). The same actor/key/method/path/body returns the original response for 24 hours. Changed input returns `409 idempotency_conflict`; expired keys return `409 idempotency_expired`. Claim commands and authorization URLs in replay responses are encrypted with AES-256-GCM, bound to actor/key through authenticated additional data. Response ciphertext is erased at expiry; non-secret tombstones expire after 30 days. Keep the same key when retrying a lost response.

Success is `{data, requestId}`. Errors are `{error:{code,message,retryable},requestId}`. `X-Request-Id` correlates API requests; `Idempotency-Replayed: true` identifies replays. Body limits are enforced while streaming bytes, before JSON parsing. Errors never return provider response bodies, secrets or SQL. All account endpoints use `private, no-store` caching. See the contract for exact schemas and HTTP status codes.

There is no arbitrary recipient/message sending endpoint. Internal replies are bound to an accepted incoming event and its sender. Existing `/api` Instagram actions remain compatibility adapters to the same domain services; the legacy RPC interface does not offer REST idempotency guarantees.

Example profile linking:

```sh
curl https://api.finfolk.com.au/v1/me/instagram/profile \
  -X PUT \
  -H "Authorization: Bearer $FINFOLK_API_TOKEN" \
  -H "Idempotency-Key: $REQUEST_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"handle":"@chriszfree"}'
```

This saves a self-provided profile URL, not verified ownership. `DELETE /v1/me/instagram` removes it, disconnects verification, invalidates claim codes and cancels unsent member work. Uncertain or already in-flight replies cannot be retracted.

## Provider setup

Messaging uses **Instagram API with Instagram Login** at `graph.instagram.com`, pinned to `v26.0`. Comment/discovery integrations continue to use their existing Facebook Login configuration. Do not copy tokens or scoped sender IDs between stacks.

1. Apply migration `0013_messaging_api.sql` through the migration runner on the isolated Neon branch first, then production, using the direct connection. Existing tables are extended without rewriting prior migrations. Legacy verified connections retain their profile links but require a fresh Instagram Login claim before member commands are authorized.
2. Provision a stable, base64-encoded 32-byte `MESSAGING_ENCRYPTION_KEY` in Worker secrets. Keep an ignored, permissions-restricted copy and run `node scripts/backup_env.mjs .env.messaging.local` to create and verify an encrypted backup. Do not generate a different key on each deploy or discard it while credentials/replay records remain encrypted with it.
3. Set the Instagram Login client ID and secret as `INSTAGRAM_MESSAGING_APP_ID` and `INSTAGRAM_MESSAGING_CLIENT_SECRET`. Set the associated Meta app ID and webhook secret separately when they differ from existing app configuration. The client secret and webhook-signature secret are different concepts and must not be substituted for one another.
4. Register `https://api.finfolk.com.au/v1/integrations/instagram/oauth/callback` exactly. Register the stable webhook callback `https://api.finfolk.com.au/instagram/webhook`, with the existing verify token. App subscriptions and actual brand-account subscriptions are separate.
5. Configure the intended administrator's actual Neon member ID in `INSTAGRAM_ADMIN_IDS`. Find this from the intended signed-in account; do not grant administration based on a self-provided Instagram handle.
6. Open Settings → Instagram messaging → Authorize @finfolk.com.au. Authorize `instagram_business_basic` and `instagram_business_manage_messages`. The callback verifies the actual account username and optional configured expected ID, obtains a long-lived token, subscribes `messages`, verifies the recorded subscription, encrypts the token and leaves processing disabled.
7. Complete Meta access, app review/publishing and connected-message-tool requirements applicable to the account. OAuth success alone does not prove that real messages are delivered. The supported token refresh runs before expiry; failed refresh is reported in checks, and expired/invalid credentials block sends.

If messaging uses a different Meta app, configure its webhook signature secret explicitly. The common callback validates the correct app secret independently for messaging and existing discovery, preventing one app's events from being treated as another provider scope.

No user access token is returned to the browser. Encrypted credentials are authenticated against the provider/client/brand scope. Changing client IDs requires reconnecting, not reinterpreting old scoped identities.

## Receipt → command → reply

`GET /instagram/webhook` returns the exact challenge after token verification and does not need Neon/Auth to be available. `POST` accepts only a valid HMAC over the exact raw bytes, bounded to 262144 bytes. It validates the account recipient and persists normalized, minimal records before returning `200`. Persistence failure returns a retryable `503`. Queue publication failure does not lose the persisted event: the independent recovery job publishes it later.

Message text is not retained as a conversation archive. Only command type, bounded check-in arguments, claim hash, scoped sender/recipient, timestamps, attribution and diagnostic state are retained. Echoes are ignored; unsupported message types with an ID are recorded as ignored. Malformed timestamps are never replaced with the current time. Disabled mode records paused receipts without executing or queuing them.

The command registry drives parsing and `/help`:

| Command | Claim required | Effect |
| --- | --- | --- |
| `/ping` | No | `Pong.` and a diagnostic reference. |
| `/help` | No | List currently enabled commands. |
| `/claim CODE` | No | Consume a valid member-bound claim after sender/follow checks. |
| `/status` | No | Explain the sender's connection or how to link it. |
| `/checkin BEACH` | Yes | Record the beach's local day at the incoming message timestamp; duplicates do not create another visit. |
| `/points` | Yes | Return participation and referral totals privately. |

Every command, including diagnostics, requires an authoritative current `is_user_follow_business=true` result. No command effects or replies occur for non-followers. Missing follow data fails closed. It can be retried or reviewed; it is never interpreted as successful ownership. Ordinary messages receive at most one help prompt per day and only after following is verified. Per-sender limits are 30 commands/minute; explicit provider rate limits create account-wide backoff.

Command effects, completion and the outbound record commit together. Duplicate provider IDs cannot create duplicate check-ins, rewards or replies. Queue delivery is advisory and may repeat. The one-minute recovery task retries persisted eligible work with leases, independently from the existing 15-minute discovery scheduler.

Processing states: `received`, `queued`, `processing`, `completed`, `ignored`, `blocked`, `paused`, `failed`.

Reply states: `pending`, `sending`, `provider_accepted`, `failed`, `uncertain`, `cancelled`, `expired`.

`provider_accepted` requires a Meta message ID and does not imply delivered/read. Every send rechecks current follow eligibility, rollout generation, cancellation and its 24-hour deadline. Disconnect or rollout changes cancel unsent work. Old paused receipts and work from an earlier rollout generation are not replayed after enabling.

Only explicit retryable provider rejection or a failed preflight is retried automatically, with bounded backoff and five attempts. A timeout, interrupted send, unreadable send response or ambiguous server error is `uncertain`; it is never automatically resent. Safe admin retries reuse the same command result and are audited. The API rejects retrying uncertain, accepted, pending, cancelled or expired sends. Inspect uncertain results in Instagram directly.

Events and outbound records expire after 30 days. Account deletion removes attributed records, claims, OAuth state and replay responses. General operational audit records expire after 30 days. Claim challenges expire after 24 hours.

## Pilot and acceptance

The readiness response also includes optional admin-only health metadata for pending/uncertain/failed replies, stalled commands, authorization expiry and subscription/refresh failures. No traffic alone is not considered an outage.

Settings shows token/setup blockers, brand subscription, follow capability, last signed receipt, last command, last provider-accepted reply and recent event metadata. Token refresh failures appear as a failed check. Lack of recent traffic alone is not proof of an outage.

1. With processing disabled, send a new message from @chriszfree. Verify a signed receipt and authoritative scoped sender ID; dashboard delivery by itself is insufficient.
2. Configure pilot mode for sender IDs observed in signed receipts and enable only `ping` and `help`. No other account can execute commands.
3. Send `/ping` and `/help` from @chriszfree. Verify each signed receipt, completed command, one provider-accepted outbound record and one actual visible reply. Target completion within 30 seconds under normal conditions.
4. Record the two event IDs and explicitly attest that their replies are visible. Then enable the remaining pilot commands and test claim, status and points. Check-ins require authorization to create an actual visit; synthetic integration tests cover effects before that authorization.
5. Complete the authorized non-follower test without unfollowing @chriszfree. Instagram's followers-only request setting has exceptions for existing chats/accounts the brand follows; the API follower gate must still block command processing.
6. Record the real Meta production-access/publishing check and non-follower acceptance. Public mode is rejected until all readiness and acceptance checks pass.

Rollback: select Paused. This cancels pending replies and blocks queued work. Keep signed receipts and completed links for diagnostics. Do not clear uncertain delivery states to force a resend.

## Verification

- `npm run test:messaging`: validate OpenAPI, encryption/AAD, provider contracts/error classification, command registry, body limits and admin UI separation. The actual workerd runtime test verifies encrypted replay, Unicode, scope binding and database-free webhook verification.
- `npm run test:messaging:integration`: migrate only the isolated `finfolk-community-pilot-test` endpoint; exercise the actual Worker database role with mocked Meta transport; validate real HTTP responses against OpenAPI; cover OAuth, replay/ownership, follower gates, claims/reviews, queue recovery, replies, uncertainty, rollout and deletion cleanup.
- `npm test`, Python tests, static build and Wrangler deployment dry-run retain existing account, trip, discovery and comment-command coverage.
- Real Meta acceptance remains a separate gate; mocked responses and dashboard tests never count as live delivery success.
