# Instagram community indexing

The frontend stays on GitHub Pages. Firebase hosts the webhook, callable functions, scheduled reconciliation and private verification records. Both frontend and server switches default off. A public Instagram profile link remains distinct from verified ownership.

## Brand account and Meta setup

1. In Dia, convert `@finfolk.com.au` to **Business**, category **Community Organization**. Preserve its handle, biography, logo and posts; hide optional contact information. Instagram's public-content confirmation must be confirmed at action time before completing the conversion.
2. Link the Business account to a Facebook Page you administer. Configure a Meta app using **Instagram API with Facebook Login** for tagged media and caption mentions. The brand connects; individual divers can retain personal Instagram accounts.
3. Request the permissions required by the chosen Graph version for basic media, caption mentions, Page access and Instagram messages. Do not request publishing access. Complete Meta's applicable review/advanced-access requirements before accepting real members. Follow the official [mentions guide](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/mentions) and [Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).
4. Configure the Firebase HTTPS `instagramWebhook` callback and subscribe the brand account to caption mentions and messages. Supplying a callback alone does not establish the account subscription. The GET verification token must match the secret below.

Never store app secrets/access tokens in GitHub, Pages config, browser storage or command arguments. Use the Firebase CLI's interactive secret input:

```sh
npx firebase-tools@15.34.2 functions:secrets:set INSTAGRAM_APP_SECRET --project PROJECT
npx firebase-tools@15.34.2 functions:secrets:set INSTAGRAM_VERIFY_TOKEN --project PROJECT
npx firebase-tools@15.34.2 functions:secrets:set INSTAGRAM_ACCESS_TOKEN --project PROJECT
```

Create ignored `functions/.env.PROJECT` with non-secret settings:

```text
INSTAGRAM_ACCOUNT_ID=BRAND_INSTAGRAM_NUMERIC_ID
INSTAGRAM_PAGE_ID=LINKED_FACEBOOK_PAGE_NUMERIC_ID
INSTAGRAM_GRAPH_VERSION=vXX.0
```

Use the Graph version selected and tested in the Meta app, not the placeholder. The access token needs the correct brand/Page permissions and must be renewed when required. Provider failures are redacted; credentials never appear in activity labels or logs.

## Firebase rollout

Complete [Firebase setup](FIREBASE_SETUP.md) first, including a dedicated project, explicit billing setup, domain authorization, rules, indexes and authentication. Configure Application Default Credentials for the setup operator; these scripts do not read browser credentials.

```sh
node scripts/check_instagram_beaches.mjs
npx firebase-tools@15.34.2 deploy --project PROJECT --only firestore,functions
node scripts/configure_instagram.mjs PROJECT --admin ADMIN_UID --pilot PILOT_UID --enable
node scripts/configure_firebase.mjs /path/to/public-web-config.json --instagram finfolk.com.au --enable --enable-instagram
```

The admin claim is `instagramAdmin:true`. Sign in again after assigning it. The admin inbox appears inside the Instagram card in Logbook/Account. Server setup writes `system/instagram` with `enabled`, `pilotOnly:true`, `pilotUids`, and `autoVerification:false`. Only named pilots can request verification or be approved. Pause/resume/disconnect and removal require a verified email. Both the operator and member controls remain server-authorized. Disable server importing with `node scripts/configure_instagram.mjs PROJECT` and disable the frontend separately. Disabling the server also blocks public reads of indexed posts.

Keep automatic ownership/follow verification off until the live pilot confirms that the messaging profile endpoint returns a trustworthy matching `username` and `is_user_follow_business:true` for the selected API configuration. Missing, false or unavailable fields never auto-verify a member. The admin checks the sender's exact username and follow status in Instagram; a consumed webhook code or unexpired manually supplied code is required. Receiving a code alone cannot verify a claimed username. Approval records the administrator and check timestamps. Verification is an onboarding check, not continuous follower monitoring or a diving credential.

## Behaviour and data

- Members opt into version 1 public-indexing consent before requesting a 30-minute, single-use code. Code hashes are private. A new request invalidates the previous code and is limited to one per minute.
- Webhook messages are accepted only with a valid HMAC signature and expected brand/Page recipient. Only exact verification messages are processed; message bodies are not retained or sent back. No DMs are sent automatically.
- Caption-mention jobs are persisted before acknowledging delivery. The scheduler runs every 15 minutes and retries up to eight times before marking a job `needs-review`. Photo tags are reconciled in bounded pages, with cursors retained between runs. Comment mentions and Stories are excluded.
- Posts publish only for the uniquely claimed, verified, opted-in author and only for post dates after verification/resumption. This excludes historical backfill. Unmatched or API-redacted authors stay private in the administrator inbox; administrators must inspect the original before resolving authorship.
- Unambiguous full beach names in captions create a labelled caption-based location association. Unknown/ambiguous locations appear on the member profile only; the member can choose a listed beach. Associations selected by the member survive later syncs.
- `instagramConnections`, `instagramChallenges`, `instagramHandles`, `instagramMedia`, `instagramJobs` and `instagramSuppressions` are server-written. Members can read only their own connection. Only `instagramPosts` is public while the server feature is enabled.
- Removing a post deletes its stored media/public metadata and leaves a minimal suppression record keyed by media ID. Repeated provider events cannot republish it. Account deletion removes claims, connection, challenges and indexed content; suppression records contain no member ID.
- Pause/disconnect stops future imports. Existing posts remain visible until removed, as stated in the disconnect confirmation. Resume starts a new prospective import window. Private freediving sessions are never changed or created by this feature.
- Only attributed, click-to-load official Instagram embeds and original-post links are displayed. Photos are never downloaded/rehosted. Deleted/private posts may no longer embed; metadata is not a live visibility guarantee. Members can remove it at any time.
- Unmatched media expires after 30 days; expired challenges are cleaned up after a day, and completed jobs after 30 days. Cleanup continues while importing is disabled. No Instagram follower lists are stored.

## Pilot acceptance and monitoring

Use FinFolk plus two public personal Instagram accounts. Confirm code delivery, exact sender attribution, follow checks, caption mention and photo-tag delivery, deduplication, ambiguous locations, pause/resume, removal/retries, disconnect and account deletion. Do not advertise universal collection: Meta may omit private posts or author details. Do not enable automatic verification until the provider fields are demonstrated on real accounts. Promotion beyond pilots requires setting `pilotOnly:false` deliberately in the server runtime document after these checks pass.

Monitor scheduled function failures, pending/needs-review jobs, verification age, Firestore reads/writes and billing. The existing System callout tracks foreground operations without recording credentials, usernames, message bodies or post captions in activity labels. Repair expired tokens in Secret Manager and redeploy the secret-bound functions.

```sh
npm test
npx firebase-tools@15.34.2 emulators:exec --project demo-finfolk --only auth,firestore,storage,functions 'node tests/test_logbook_rules.mjs && node tests/test_logbook_functions.mjs && node tests/test_instagram_service.mjs'
```

When the beach directory changes, regenerate `functions/instagram-beaches.json` with `node scripts/check_instagram_beaches.mjs --write` before deploying Functions. CI checks the snapshot against the frontend catalog.
