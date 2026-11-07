# Substrate browser route coverage

The Next preview uses one application substrate node with public, application-state and replaceable member spaces. Production keeps the existing client path while `backbone` is false. The existing DOM interface, Neon Auth SDK, HTTP API contracts and server permissions remain in use.

| Area | Model coverage |
| --- | --- |
| Navigation | Maps, Discover (suggested/index), Account (all five tabs), Logbook and Trip, with existing deep links and history behavior |
| Atlas | Region/site selection and loading/error status; large geometry, raster chunks and offline packages stay in their existing storage |
| Public content | Community posts/referrals, trip lists/reports, Instagram feeds/report submission |
| Members and community | Profile preferences, visits/removal, buddies, blocks, reports and statistics |
| Logbook | Session lists/details, private saves, visibility changes and deletion |
| Posts and trips | Existing submission, moderation, draft, import, preview, publishing and reporting operations |
| Instagram and administration | Existing action endpoints and `/v1/me/instagram` and `/v1/admin/messaging` browser endpoints |
| Authentication | SDK lifecycle status only; passwords, verification codes, reset tokens and OAuth credentials are not cached in application state |

`client/operations.mjs` is the explicit browser registry. Each entry declares its domain, transport, read/write behavior and authentication requirement; administrative operations use an admin model group. Server checks remain authoritative. Unknown preview operations are rejected instead of falling through to a raw transport. The generated Clojure/Postgres contract remains the profile/check-in slice; this release does not rewrite the remaining server logic.

Reads use operation/argument keys, including record IDs, cursors and filters. Independent reads run concurrently. Writes are ordered per domain and invalidate related cached reads; mounted readers refresh. Mutation inputs/results are removed from substrate state after completion. If a committed mutation cannot refresh its dependent reads, callers receive `mutationCommitted: true` and further writes in that domain require reload. There is no automatic mutation replay.

Account changes clear member models, inputs, outputs, subscriptions and cache. Responses that arrive after closure cannot populate the replacement account. Public state and navigation survive sign-out. Screen epochs and disposed subscriptions prevent responses from reopening an earlier route. Account-tab changes update the navigation model without reloading every account section.

The preview Worker forwards browser API paths before static assets, including `/trips`, `/community/posts`, `/community/referral` and `/instagram/posts`. Provider webhooks remain separate. OAuth administration returns to the trusted preview origin in the Next environment. API responses retain their original methods, query strings, headers, bodies and status codes.

Existing feature switches remain unchanged. Disabled integrations display their unavailable state; this rollout does not enable Meta messaging, connect external accounts, perform checkout, or add the planned chat/plugin system.

## Verification and deployment

Run `npm test` for regressions and the substrate checks. `npm run test:backbone` separately covers generated SQL, the actual XTalk runtime, registry coverage, forwarding, navigation, keyed caching, subscriptions, identity changes, API/SQL integration and anonymous public transports. Controlled API fixtures exercise profile/check-in, buddies, sessions, posts, trips and messaging permission/disabled states without external provider requests.

Build with JDK 27 using `npm run build:next`, then deploy the preview API and site using `npm run deploy:next:api` and `npm run deploy:next`. No schema migration or SQL release-hash change is required for this route expansion. Check `/_next/health` and verify public browsing, account tabs, logbook, trip deep links, profile persistence and sign-out. Rollback uses the preceding preview Worker versions and their assets; production and member data are independent of these deployments.
