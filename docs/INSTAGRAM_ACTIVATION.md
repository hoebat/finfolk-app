# Instagram activation and staged discovery rollout

PR #4 supplies the versioned DM API, encrypted credentials, Settings controls and durable processing. This release adds current-follower proof for personal comment actions and automatic publication, connection-generation binding, and admin operational health. Infrastructure and mocked integration tests are not live Meta acceptance.

## Operator configuration

Use the permissions-restricted, ignored `.env.local` as the canonical operator configuration. Preserve the existing `MESSAGING_ENCRYPTION_KEY`; never regenerate it during deployment. Keep encrypted backups verified. Store static messaging client/signature secrets and the encryption key in Worker secrets and protected GitHub Actions secrets. The rotating Instagram Login credential remains encrypted in Neon and is refreshed by the existing scheduler. The Facebook/Page token belongs to comments/discovery and must not be substituted for the Instagram Login credential.

Resolve the owner’s actual verified Neon member ID from their signed-in FinFolk account before configuring `INSTAGRAM_ADMIN_IDS`. Configure Instagram Login client ID/secret separately from the Meta app ID and webhook-signature secret. The callback is `https://api.finfolk.com.au/v1/integrations/instagram/oauth/callback`; the stable webhook is `https://api.finfolk.com.au/instagram/webhook`.

In Settings, authorize only `@finfolk.com.au`. Verify the actual account, app-level webhook configuration and brand subscription. Keep processing paused until these checks succeed. Account recovery, required security verification, Meta app access/review and real-user testing cannot be replaced by database flags or synthetic evidence.

## Acceptance sequence

1. **Paused receipt:** send a fresh message from `@chriszfree`. Inspect the signed receipt and observed scoped sender. Do not infer a sender ID from a handle or reuse a Facebook-scoped ID.
2. **Diagnostic pilot:** allowlist the observed sender, enable only `ping` and `help`, and send both commands again. Record each event ID, completed processing, Meta message ID, and an actual visible Instagram reply. Target 30 seconds in normal operation. Provider acceptance is not proof of delivered/read status.
3. **Small member pilot:** the operator selects 3–5 consenting divers from signed receipts. Enable claims, status, check-in and points after diagnostic acceptance. Test verified email, follow, claim, reload/resume, unlink/relink and private replies. Use Bondi first; check-ins are real visits, not fabricated diagnostics.
4. **Negative test:** use a consenting pilot before they follow; confirm no DM command effects/reply. After following, repeat successfully. Do not unfollow `@chriszfree` merely to manufacture the test.
5. **Comments:** independently verify Facebook Login subscriptions, mentioned-comment retrieval, owned-comment retrieval and correct public reply routes on owned test posts. Enable public `help` and post `status` first. Personal comment actions require the separately proven comment identity and a current follower check through the linked Instagram Login connection.
6. **Discovery before publication:** enable collection for pilot authors and inspect pending content around Bondi before enabling public publication. Automatic publication requires verified media ownership, explicit sharing consent, one clear beach and current follower eligibility. Ambiguous places, unknown authors and third-party suggestions stay reviewed; inaccessible posts use manual URL submission. Content stays on Instagram through links/embeds.
7. **Public release:** record real production-access and non-follower acceptance in Settings before selecting Public. Widen read-only messaging, personal commands, discovery and publication separately. Do not enable public features merely because a deployment completed.

Use the current Settings API and idempotency contract for rollout changes. Pausing cancels eligible unsent work; previously paused receipts do not replay when enabling. Inspect uncertain replies in the actual Instagram thread; never clear uncertainty to force a resend.

## Identity and publication rules

Migration `0014_instagram_connection_proofs.sql` adds a connection generation and records the DM provider scope/generation alongside each public-comment proof. Existing comment proofs require a fresh challenge; profile links are preserved. A completed fresh claim rotates the connection generation, clears stale media-owner evidence and resets automatic sharing consent. The member must verify the author proof and opt in again before automatic publication.

Follow lookup uses the Instagram Login sender belonging to the verified member, never the Facebook comment actor. Personal action preflight and send-time checks enforce the current messaging rollout and pilot list. `/help` and public post `/status` do not require a follower lookup. Follower proof is short-lived, bound to the exact sender/scope/generation, and checked again against the database before effects. Provider network requests stay outside SQL transactions. Consent and identity changes during the lookup prevent automatic publication or member placement.

## Health and validation

`GET /v1/admin/messaging/instagram` adds optional `health` metadata: `status`, `issues`, pending/uncertain/failed reply counts and stalled-command count. The additive OpenAPI schema preserves existing clients. Settings shows token expiry and actionable refresh/subscription/delay/uncertain-reply diagnostics without sender IDs or message content in general health. Paused mode remains visibly paused; no recent traffic alone is not an outage.

Run the full npm suite, actual workerd checks, versioned API/OpenAPI SQL integration, comment/discovery SQL integrations, static build and Worker dry-run. Regression cases include non-followers, unavailable follow lookup, separate provider namespaces, same-sender relinking, consent changes during lookup, concurrent duplicate delivery, private confirmations, uncertain sends and rollback. Real Instagram acceptance must be recorded separately.
