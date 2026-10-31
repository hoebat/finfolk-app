# Instagram discovery operations

FinFolk stores Instagram links and minimal metadata in Neon. Photos and videos stay on Instagram. Public beach galleries load embeds on request, provide original links and reporting, and show the original post date. These are historical posts, not live conditions.

## Rollout gates

All gates default off in `wrangler.jsonc`:

- `INSTAGRAM_DISCOVERY_ENABLED`: read mentions, poll tags and reconcile sources.
- `INSTAGRAM_PUBLICATION_ENABLED`: permit new public publication, including administrator approvals. Existing approved links remain available while publication is paused.
- `INSTAGRAM_HASHTAGS_ENABLED`: allow hashtag polling after the actual app has the required access and tested quota behavior.
- `INSTAGRAM_ENABLED`: existing reviewed outbound Actions; leave off while discovery is piloted. Discovery does not send public comments or DMs.

Before enabling collection, verify the final Meta app grant, current token scopes, linked brand ID `17841461601419539`, account-level webhook subscriptions, app publishing/review requirements and real-account deliveries. Dashboard test webhooks alone are insufficient. Keep tokens in Worker secrets and ignored `.env.local`, run `npm run env:backup` after changes. Do not put credentials in static client config. Configure `INSTAGRAM_ADMIN_IDS` using intended administrators' Neon IDs.

Apply `0006_instagram_discovery.sql` using `npm run db:migrate`. The migration is additive and includes grants for `finfolk_api`. Existing reviewed Instagram/TikTok community posts keep their own moderation and rollout gate. Imported Instagram controls appear alongside manual submissions in Your posts; the profile retains connection and Actions controls. GitHub Pages still serves the static frontend; Cloudflare handles public feed and authenticated controls.

## Collection

The existing queue now accepts `{id}` mention events and `{kind:'discovery-source',key}` source jobs. The 15-minute scheduler claims up to four due sources with leases, uses persisted pagination cursors, and recovers expired leases. Tagged media is scheduled hourly; hashtag media every two hours. Each job reads at most two pages of 25 posts and resumes its checkpoint later. No unrestricted scraping or bulk historical backfill.

The seeded pilot hashtags are portphillipbay, edithvale, morningtonpeninsula, portseabeach, bondibeach, maroubrabeach, gordonsbay, clovellybeach, jervisbay and hyamsbeach. A conservative 20-tag budget includes Meta's recently searched tags, including use outside FinFolk. Verify actual app quotas/access before activation. Broad region tags do not determine a beach. The matching catalogue is curated from the canonical VIC/NSW beach directory in `backend/instagram-places.json`.

Posts deduplicate by provider media ID or canonical Instagram permalink. Repeat collection adds provenance without undoing hidden/rejected states. Provider backoff is stored in Postgres; token/access errors pause a source for a day, quota errors for at least an hour, and transient errors use exponential backoff. Administrator retry schedules a fresh attempt. No provider response bodies or credentials appear in the public feed.

Published media is checked daily where readable. Only an explicit provider unavailable-object response hides it; auth/rate/transport errors preserve existing visibility. Private/removal changes cannot be detected instantly. Captions and raw events expire after 30 days; link/state/provenance records remain for deduplication.

## Ownership, sharing and sessions

DM sender IDs are not media-owner IDs. Verification records have a separate `media_owner_id`, bound by an administrator after checking an actual post against the verified member. The API also requires matching provider username and owner evidence. If Meta does not expose usable evidence, leave the post reviewed; never infer ownership from a commenter, hashtag, matching handle alone or equivalent-looking IDs.

All verified members qualify once they explicitly enable public post sharing; there is no additional trust tier. Automatic publication requires a verified provider author binding, sharing opt-in, one unambiguous beach and the publication gate. Explicit post sharing is independent of the member's private logbook/profile visibility. Missing identity/location sends a post to review. Known members choose a beach for their pending posts; other creators require admin approval.

Turning sharing off pauses future publication. Members can hide individual posts or remove all imported posts. Disconnect/re-verification hides automatically published posts and clears author binding/consent. Account deletion hides and anonymizes the member's discovered posts. Suppressed authors are excluded from the public feed and further ingestion. Hidden/rejected rows cannot be resurrected by polling.

An explicit `log` caption from an identified member creates one private dive draft; comment requests keep the existing Actions workflow. Sessions require member confirmation plus existing review. Discovery never creates check-ins or Regulars statistics and never infers dive details from photographs or someone else's post. Replies, statistics and points retain existing consent/review controls.

## Interfaces

- Public `GET /instagram/posts?beachId=…&cursor=…`: 20 approved links per page, opaque keyset cursor and coarse collection status. No caption, private member fields or access tokens. No server cache so removals apply on the next read.
- Public `POST /instagram/posts/:id/report`: fixed reason `wrong_location`, `inappropriate`, `removed` or `other`; deduplicated per post/reason/day. No free-text or anonymous user tracking.
- Authenticated `/api` actions: `instagramMyPosts`, `instagramSharing`, `instagramChoosePostBeach`, `instagramHidePost`, `instagramRemoveAllPosts`, `instagramDiscoveryStatus`.
- Administrator-only actions: `instagramDiscoveryInbox`, `instagramReviewPost`, `instagramSuppressSource`, `instagramDiscoveryRetry`, `instagramBindMediaOwner`. Public listing never exposes the admin inbox or connection evidence.

The Instagram panel includes opt-in, pending/published states, beach selection and removal. Admins get source status/retries, review, reports and author-evidence controls. The existing System callout shows last collection and paused/enabled status; detailed source states are admin-only. Feed failures leave map and depth data usable.

## Validation

Run `npm test`, `npm run build`, `npm run test:instagram-actions`, `npm run test:instagram-discovery`, `npm run test:neon` and `npm run test:deployed`. Database tests require `NEON_BRANCH=finfolk-regulars-dev`; they create and clean synthetic fixtures and mock Meta transport, never send live Instagram messages.

Real-provider acceptance remains a separate activation requirement: two public test accounts, captions/comments/photo tags, authored vs third-party posts, identity binding, ambiguous beaches, private/deleted sources, token expiry and hashtag eligibility. No promise of complete Instagram coverage, Stories ingestion, follower/mutual verification or automatic reposting.
