# Instagram connections, Actions and invitations

The active implementation uses Neon Postgres, Neon Auth and the `finfolk-community` Cloudflare Worker. Legacy Firebase Instagram functions are not used. The brand account is `@finfolk.com.au`.

## Meta setup status

Meta app **FinFolk**, ID `1667613151655339`, has been created with the Instagram use case. Its domain is `finfolk.com.au`. The Instagram callback `https://api.finfolk.com.au/instagram/webhook` is verified, and `mentions` and `messages` are subscribed on **v26.0**. Both dashboard test deliveries passed. These demonstrate webhook transport, not live account association or draft creation.

The app is **unpublished**. Meta's current dashboard states that unpublished apps receive dashboard tests only, including for app administrators. Brand account authorization, a production access token, required publishing/review prerequisites and real-account acceptance tests remain incomplete. No FinFolk admin identity has been configured yet.

The app secret and verification token are saved in the ignored `.env.local`, uploaded to Worker secret storage, and included in verified encrypted local backups. See [local secrets backup instructions](SECRETS_BACKUP.md). No app secret, token or recovery key is committed.

Facebook Login for Business configuration **FinFolk Instagram Actions** (`1823789635502060`) is saved using user access tokens and scopes `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_read_engagement` and `pages_show_list`. Creating this configuration does not authorize an Instagram account or issue an access token. The ID is also stored locally as `INSTAGRAM_LOGIN_CONFIG_ID`.

A Facebook Page **FinFolk** (Page ID `1387107281155901`, public profile `61596205344691`) has been created with category Community, the supplied logo and website `https://finfolk.com.au`. The existing Instagram brand account still needs to be linked; Meta currently lists no Instagram accounts in the authorization flow.

## Current controls

`INSTAGRAM_ENABLED=false` is intentional. No provider requests or public replies are sent until acceptance tests pass. With no `INSTAGRAM_ADMIN_IDS`, connection challenges are also disabled so members do not wait for an unconfigured reviewer. Public profile links remain available separately.

Members connect by entering a handle and sending a 24-hour challenge code to the brand through Instagram. Only the challenge hash is stored. A configured administrator checks the actual received message, sender and provider sender ID, then verifies the connection. There is no follower-list check or claim of verified mutual follows. Signed messaging webhooks match the challenge hash and provide the actual sender ID to the review inbox. Administrators still check the declared handle against the actual received message before approval. Fully automatic verification is not enabled; manual review is the initial fallback.

The social menu exposes Instagram & actions, private draft confirmations, public-stats reply consent, points privacy and invite statistics. Administrators see a separate inbox only when their server-verified Neon identity is allowlisted.

## Deployment

1. Apply migrations with `npm run db:migrate`. They add connection, event, action, audit, points and invitation tables. Existing members are not eligible to retroactively claim signup referrals; new members can claim one invite within seven days.
2. Queues `finfolk-instagram-actions` and `finfolk-instagram-dead-letter` are declared in `wrangler.jsonc`. The hourly trigger reconciles interrupted work and cleans up expired challenges and 30-day event payloads/comment text.
3. Set the following using Cloudflare Worker secrets, never browser config or Git commits:
   - `INSTAGRAM_ADMIN_IDS`: comma-separated Neon user IDs, resolved from the intended administrator's FinFolk sign-in.
   - `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`.
4. Set public provider configuration as Worker environment variables: `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_GRAPH_VERSION`. Pin the Graph version tested for this Meta app.
5. Configure the professional brand account and its linked Facebook Page in a Meta app using Instagram API with Facebook Login. Obtain applicable advanced access/app review before enabling public use. Subscribe the brand account to comment `mentions` and the messaging events approved for the app; setting a callback alone does not subscribe the account.
6. Configure `https://api.finfolk.com.au/instagram/webhook` as the callback. GET verifies the token; POST verifies `X-Hub-Signature-256` before storing events and enqueueing IDs.
7. Keep `INSTAGRAM_ENABLED=false` until the actual mention payload, comment lookup fields, sender attribution, permission scope and reply endpoint have passed real-account tests for the pinned Graph version. Provider field/version compatibility has not yet been demonstrated on live accounts.

Official contract: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/mentions . Private-media mentions are not delivered, and API limitations may prevent access to a source.

## Actions

Every comment yields a review item. Keywords `stats`, `log`, and `points` add independent action types. Explicit `depth 8` and `duration 30` are suggestions only; no dive is inferred from somebody else's post. Unique source-comment/action keys prevent duplicate effects.

- Stats proposals use opted-in fields and an unambiguous beach match for Open profiles. The member confirms the exact public text; an administrator must approve it before sending. Editing text invalidates consent.
- Dive drafts require the requesting member to confirm their own dive, date and beach. Administrator approval atomically inserts one private session. Posts from other people remain attributed source recommendations.
- Participation awards require review and are capped at one point per member per Australia/Melbourne calendar day. No awards depend on depth, duration or breath holding. Administrators can reverse a ledger entry.
- Reply sending first claims the action. An interrupted or ambiguous provider response remains `uncertain`; there is no blind retry. Administrators must inspect the actual Instagram thread before marking it sent or returning it to review. In-flight replies cannot be reset within 20 minutes.
- Members can cancel pending actions or disconnect. Disconnect cancels pending work and hides public points. Approved/sent history is retained for review; account deletion removes the member's connection/actions/invitations and ledger.

## Invitations

Each verified FinFolk member can get a unique invite link and view aggregate join/verified counts. The new member explicitly accepts the invitation after sign-in. One inviter is credited per new member. The inviter receives one referral point only after the new member's Instagram sender identity is verified. A sender identity can unlock only one referral award, including after handle changes. Referral points are separate from the daily participation cap. Public totals are opt-in and displayed in eligible beach community cards; there is no leaderboard.

The initial default rewards the inviter only. These records represent FinFolk invitations, not a verified Instagram mutual-follow graph. No monetary rewards or redemption are implemented.

## Tests and activation checklist

`npm test` includes Actions UI and animated walkthrough checks. Run `npm run test:instagram-actions` only with the isolated `finfolk-regulars-dev` env file; it tests against actual Postgres rows with synthetic members and no external Instagram messages. `npm run test:neon` checks account/community regression.

Before activation, use the real brand plus two public test accounts to verify own-post and third-party comment mentions, connection code ownership, private/deleted sources, duplicate deliveries, unknown senders, exact stats consent, private dive logs, admin-only replies, pause/disconnect, points limits, referral attribution and token expiry. Test uncertain-reply reconciliation explicitly. Inspect the Cloudflare dead-letter queue and pending event inbox. Do not advertise automatic Instagram connection, follower gating or universal mention coverage.
