# Instagram comment commands

Comments must mention `@finfolk.com.au`. Either mention-first or command-first works; commands are case insensitive. One slash command per comment. Ordinary mentions retain the discovery/review workflow.

- `/help @finfolk.com.au`: fixed help.
- `/status @finfolk.com.au`: this post's public trip report or public beach listing; only a verified owner can receive their own pending status. No private draft contents.
- `/me @finfolk.com.au`: verified profile link when Open; private account controls when Closed. No statistics.
- `/publish Bondi Beach @finfolk.com.au`: sharing request. Only the independently verified media author, with sharing consent and one matched beach, is eligible for automatic publication. Other recommendations stay in review. Existing suppression and hidden-post rules apply.
- `/checkin Bondi Beach @finfolk.com.au`: today's self-reported visit.
- `/checkin YYYY-MM-DD Bondi Beach @finfolk.com.au`: an explicit visit date from local today minus 29 days through today. Never infer visit dates from media timestamps.

## Member experience

Account → Instagram comment commands contains examples, one-time verification and private pending check-ins. First connect and verify Instagram. Then generate a one-time `/me CODE @finfolk.com.au` command and post it from that account within 15 minutes. FinFolk binds the provider-fetched comment actor to the existing verified member using code possession **and** the provider-fetched account handle. Handles alone and DM sender-ID equality never authorize comments. Codes are stored as hashes and removed from persisted command arguments after use. Disconnect removes the binding and cancels pending work.

A check-in without one clear supported beach, or an undated request processed on another local calendar day, requires private location/date confirmation. Public replies never disclose beach, date, visit counts or live presence. Existing `(member, beach, local day)` uniqueness prevents repeated visits being counted twice. Visit records remain manageable in normal account controls.

## Delivery and operation

Signed webhooks persist event IDs before queueing. `mentions` retrieves external mentioned comments; `comments` retrieves brand-owned media comments and verifies media ownership. Explicit commands are intercepted before discovery and legacy actions, even when commands are paused. External mention replies use `/{brand}/mentions`; owned-media comments use `/{comment}/replies`.

Command execution, rolling-limit reservation, identity binding and check-in insertion run in a Postgres transaction. Sender limit: 5 comments / 10 minutes; post limit: 20 / hour; brand limit: 100 / hour. Duplicate comment IDs never execute twice. Reply claims use a conditional atomic update; ambiguous POST responses and interrupted sends become `uncertain`, never automatically resent. Cron recovers persisted pending replies. Admin activity exposes uncertain replies; after inspecting the Instagram thread, enter the actual reply ID or skip. No automatic resend control exists.

Separate Worker flags default to false:

```
INSTAGRAM_COMMAND_REPLIES_ENABLED=false
INSTAGRAM_COMMAND_CHECKINS_ENABLED=false
INSTAGRAM_COMMAND_PUBLICATION_ENABLED=false
```

Publication also requires the existing `INSTAGRAM_PUBLICATION_ENABLED` gate. Comment commands do not enable DM commands or the legacy statistics replies. Member API actions remain authenticated; confirmation checks the current connection, identity, active/email-verified member, command ownership, beach and rolling date window again.

## Activation checklist

Deployment alone does **not** activate Instagram responses. Keep flags false until:

1. A production token has the actual required Meta grants and access to the linked FinFolk professional account.
2. The app/account subscriptions include both `mentions` and `comments`; Meta app publishing/access requirements are satisfied. Dashboard sample callbacks alone are insufficient.
3. On designated test posts, prove retrieval of `from.id`, `from.username`, timestamp, media identity/owner and permalink for both contexts. Verify one-time binding without assuming namespaces match. If a field is unavailable, leave identity/automatic actions gated.
4. Prove an actual reply appears under the original comment from `@finfolk.com.au`, with the expected route, and repeated webhook delivery produces no second reply.
5. Test `/help`, `/status`, Closed `/me`, check-in/private confirmation and opt-in publication before opening each corresponding flag.

Official references: [mentioned comments](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/mentioned_comment/), [mentions replies](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/mentions/), [owned comment replies](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies/). Meta's reference pages may require a developer login. Provider behavior still requires the live acceptance checks above.

## Validation

```
node tests/test_instagram_commands.mjs
node tests/test_instagram_commands_ui.mjs
node --env-file=.env.test.local scripts/migrate_neon.mjs
npm run test:instagram-commands
npm test
npm run build
npx wrangler deploy --dry-run
```

The integration script refuses any branch other than `finfolk-regulars-dev`, creates synthetic members, uses mocked provider responses with real Postgres transactions, and cleans up. It covers namespace isolation, code binding, public privacy, rolling dates, duplicate concurrent delivery, private confirmation ownership, command interception, both reply routes, third-party publication review, durable limits and uncertain-send reconciliation. It does not certify live Meta access.
