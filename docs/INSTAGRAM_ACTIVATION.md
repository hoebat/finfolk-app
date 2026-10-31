# Instagram activation and staged discovery rollout

PR #4 supplies the versioned DM API, encrypted credentials, Settings controls and durable processing. This release adds current-follower proof for personal comment actions and automatic publication, connection-generation binding, and admin operational health. Infrastructure and mocked integration tests are not live Meta acceptance.

## Operator configuration

Use the permissions-restricted, ignored `.env.local` as the canonical operator configuration. Preserve the existing `MESSAGING_ENCRYPTION_KEY`; never regenerate it during deployment. Keep encrypted backups verified. Store static messaging client/signature secrets and the encryption key in Worker secrets and protected GitHub Actions secrets. The messaging credential remains encrypted in Neon. Legacy Instagram Login user tokens are refreshed by the scheduler; Unified Login business tokens follow the configured business-integration lifetime and require reconnecting when revoked. The Facebook/Page token belongs to comments/discovery and must not be substituted for either messaging credential.

Resolve the owner’s actual verified Neon member ID from their signed-in FinFolk account before configuring `INSTAGRAM_ADMIN_IDS`. Choose the messaging provider explicitly. New Meta apps require Unified Login; older apps may retain their existing Instagram Login configuration. The callback is `https://api.finfolk.com.au/v1/integrations/instagram/oauth/callback`; the stable webhook is `https://api.finfolk.com.au/instagram/webhook`.

In Settings, authorize only `@finfolk.com.au`. Verify the actual account, app-level webhook configuration and brand subscription. Keep processing paused until these checks succeed. Account recovery, required security verification, Meta app access/review and real-user testing cannot be replaced by database flags or synthetic evidence.

## Unified Login for new Meta apps

Set `INSTAGRAM_MESSAGING_PROVIDER=instagram-unified`. In the Instagram API setup with Unified Login, create a compatible business-integration system-user configuration. Request only `instagram_basic` and `instagram_manage_messages` for this stage; omit ads, publishing and comments permissions. Keep the existing comment/discovery integration separate. Register the exact callback above and save its config ID as `INSTAGRAM_MESSAGING_LOGIN_CONFIG_ID`.

Set `INSTAGRAM_MESSAGING_META_APP_ID` to the Meta App Basic ID, and `INSTAGRAM_MESSAGING_META_APP_SECRET` to its server-side secret. When this ID matches `INSTAGRAM_APP_ID`, the existing `INSTAGRAM_APP_SECRET` is reused. Do not use the Instagram product client credentials for Unified Login. Select only @finfolk.com.au during authorization. The callback verifies a business-scoped system-user identity and exactly one assigned Instagram account before subscribing and storing the encrypted token. A Page or personal user token is rejected.

Unified authorization uses Facebook's dialog and `graph.facebook.com`; legacy Instagram Login continues using its own dialog and `graph.instagram.com`. Provider namespaces remain separate, so existing linked members need a fresh claim when changing providers. Migration `0015_messaging_oauth_flow.sql` binds pending OAuth intents to the provider, app, config and callback; previously started authorizations must restart. Never re-label an existing token or move it between namespaces.

Keep the current provider until the new config and deployment are ready. The successful callback always pauses processing, cancels pending replies and resets follow/delivery acceptance. A business token without a fixed expiry is still revocable; invalid authorization stops processing and requires reconnecting. Do not call the Instagram user-token refresh endpoint for this token. Standard access permits role-based tests only; production access and actual replies must be verified independently before public release.

The current FinFolk Messaging config is `2606242293176301`, with only basic and messaging permissions and the registered callback above. Its non-secret provider/config/account identifiers are pinned in Worker configuration; static secrets remain outside source control.

Official setup: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started

## Public help release

Public assistance (`help`, `ping`, unknown-command guidance and the welcome prompt) does not require following, registration or a profile lookup. Both processing and sending use this policy. It still requires signed receipts, an authorized brand, subscription, enabled command, matching rollout and the reply window. Do not mark follower verification or timestamps for public assistance. A deleted/unlinked member can still ask for public help.

Start with only `help` and `ping`. The help reply introduces FinFolk, lists enabled commands and links to the site; it never advertises disabled personal actions. Help-only readiness does not require follower verification. For public acceptance, submit `nonFollowerHelpEventId` alongside the diagnostic event IDs and confirmations: it must identify a successful help response to a separate unregistered sender. The operator must actually confirm that this person was not following and saw the reply. This sets public-help acceptance, never personal-command negative-test acceptance. Missing evidence blocks public activation.

Personal commands continue to require current follower proof at processing and sending. In a future personal-command pilot, a signed `/status` receipt can verify the follower lookup before claim codes are issued. Enabling personal commands in live mode must independently satisfy personal follower and negative-test requirements.

## Acceptance sequence

1. **Paused receipt:** send a fresh message from `@chriszfree`. Inspect the signed receipt and observed scoped sender. Do not infer a sender ID from a handle or reuse a Facebook-scoped ID.
2. **Diagnostic pilot:** allowlist the observed sender, enable only `ping` and `help`, and send both commands again. Record each event ID, completed processing, Meta message ID, and an actual visible Instagram reply. Target 30 seconds in normal operation. Provider acceptance is not proof of delivered/read status.
3. **Small member pilot:** the operator selects 3–5 consenting divers from signed receipts. Enable claims, status, check-in and points after diagnostic acceptance. Test verified email, follow, claim, reload/resume, unlink/relink and private replies. Use Bondi first; check-ins are real visits, not fabricated diagnostics.
4. **Nonfollower tests:** first verify a consenting, unregistered sender receives `/help`. For personal commands, use a consenting pilot before they follow; confirm no personal command effects/reply. After following, repeat successfully. Do not unfollow `@chriszfree` merely to manufacture the test.
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

## Recover an approved grant awaiting account verification

For an initial connection, a successful Meta code exchange is retained encrypted with `pendingVerification=true` if the assigned-account or subscription checks fail. Messaging stays paused and both authorization/subscription checks remain false. A failed reconnect preserves an already verified credential. Provider verification stays outside the database transaction; the final update checks that a newer grant has not replaced it.

A privileged operator with the database connection, existing encryption key and matching provider configuration can run `node --env-file=.env.local scripts/verify_instagram_authorization.mjs --inspect` to read permission status, assigned-account counts and brand access without printing credentials or message content. After repairing the Meta asset assignment, use `--verify` to repeat the same account/subscription checks and save the verified connection. The command requires the original authorizing member to remain active and email verified, and rejects changed OAuth configuration. It never enables command processing.


## Inspect the token’s actual asset grant

Verified admins can open Settings → Instagram messaging → Authorization diagnostics → Inspect saved Meta grant. The read-only `GET /v1/admin/messaging/instagram/authorization/diagnostics` uses the existing server-side Meta app secret to inspect the encrypted saved grant. It returns app binding, token validity/type, permission names, per-permission target counts/expected-account matches, expiry, and assigned-account lookup metadata. It never returns credentials, token subject IDs, unrelated asset IDs or raw provider errors, and does not update authorization or rollout state.

Compare these results with the existing login configuration and Business Settings → Connected apps → FinFolk. Repair only confirmed missing Instagram asset/task selections, keeping profile and messaging permissions. A missing granular-scope entry alone does not prove that access was denied; verify the assigned-account endpoint too. Refresh consent once after a confirmed repair. If Meta confirms the expected grant but still returns no assigned accounts, retain sanitized request IDs and metadata for a Meta support report; never bypass account identity checks or enable messaging to work around it.

## Facebook Page-based messaging

`INSTAGRAM_MESSAGING_PROVIDER=instagram-facebook` uses the existing Meta app and the configured `INSTAGRAM_MESSAGING_PAGE_ID`. OAuth requests only `instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement` and `pages_manage_metadata`. Exchange the Facebook user token for a long-lived token, then resolve the configured Page directly and obtain its Page token. `/me/accounts` is not a mandatory discovery step: in the live FinFolk test it returned an empty list while the configured Page and linked Instagram account were readable.

Before saving or verifying a subscription, check that Meta's debugger binds the valid `PAGE` token to this app, `/me` identifies the configured Page, and that Page links to the expected `finfolk.com.au` account. Facebook's Instagram subscription response may return only `subscribed_fields`; accept that form only after the app/Page token checks and require exactly one result including `messages`. An explicit mismatched app ID or multiple results must fail. Page tokens use their own provider namespace and the earliest reported token/data-access expiry; never send them to Instagram user-token refresh endpoints. Reconnect through Settings before expiry.

Activation still finishes paused. Enable only `ping` and `help` for a real sender observed in signed webhook receipts, verify visible replies, and retain the usual public/personal-command acceptance gates. No other platform credentials or message routing settings are changed automatically.

Facebook Page mode also subscribes the configured Facebook Page to `messages` and verifies that the app appears in the Page subscription readback. Instagram-account subscription alone is insufficient. Missing `pages_manage_metadata` must keep the overall subscription check false. This permission lets the app manage Page settings/webhooks and requires explicit approval for the FinFolk Page.
