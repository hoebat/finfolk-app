# Instagram claiming and commands

The authoritative transport/API lifecycle and activation guide is [Messaging API](MESSAGING_API.md), with [OpenAPI](openapi/messaging.yaml). The versioned Instagram Login transport supersedes the older DM transport configuration and retry descriptions below; Facebook Login discovery/comment features remain separate.

## Member workflow

Instagram linking is managed in **Your FinFolk → Instagram**, with a **Manage Instagram** shortcut from Profile & buddies. While DM verification is unavailable, enter a username or profile URL and choose **Link profile**. The same screen shows **Profile linked · not verified**, **Change account** and **Remove link**. Saving changes only the Instagram profile field; it does not alter privacy, beaches or other profile settings. A saved profile link never grants DM commands, claim rewards or verified status.

When automatic claims are enabled, choose **Start linking**. The screen then shows two steps: follow the brand and send the generated command. Expiry, replacement and status retry controls are under **Need help?**. Claim controls and the command guide are hidden while verification is unavailable.

Open **Your FinFolk → Instagram**. Verify your FinFolk email if requested, then choose **Start linking**.

1. **Follow @finfolk.com.au.** Open the linked Instagram profile, tap Follow, then Message. Use the Instagram account you want to claim.
2. **Send `/claim <CODE>`.** Copy the complete generated command from FinFolk and send it as an Instagram DM. Each code is valid for 24 hours; generating a replacement invalidates the old one.
3. **See Account claimed.** FinFolk identifies the actual message sender, checks their username and follow relationship, and sends a private confirmation. The Instagram tab updates automatically. The verified profile link is updated without changing Open/Closed or statistics sharing.

The member never types their Instagram handle. Claiming does not permit public replies or post publication. Those retain their separate consent and rollout controls.

The page displays Ready to claim, Waiting for your message, Checking your account, Follow required, Account claimed, Code expired, Could not verify or Review requested. A non-follower is asked to follow, then resend the same command. Failed provider checks never imply success. A member can retry or explicitly request manual review after a matching signed message has been received. Reviewers must check the actual sender and follow relationship.

Codes are displayed only to the signed-in member, stored as hashes on the server, and retained in browser session storage scoped to that member so reloads can resume. The displayed command is cleared on successful claim, expiry and sign-out. If another browser generated a replacement, the old displayed command is discarded. Use **Remove link** in the Instagram tab to clear the profile link, disconnect the verified account and cancel old claim commands. You can then add a different profile link or generate a new claim command when claims are enabled. Removing the link does not delete the Instagram account or its posts.

## Commands

| Command | Result |
| --- | --- |
| `/help` | Commands, examples and the claim-page link; works before claiming. |
| `/claim <CODE>` | Automatically claim the Instagram account sending a valid code after sender and follow checks. |
| `/status` | The sender's current connection, or instructions to claim. |
| `/checkin <beach>` | Today's self-reported visit, using the beach's local date and existing privacy rules. |
| `/points` | The sender's participation and referral totals. |

Commands are case-insensitive, begin at the start of the DM and take one line. Unknown/malformed commands return help. Bare `/checkin` explains syntax and lists followed beaches. Ambiguous names return specific region/state choices to resend. Unique matches execute immediately. A duplicate daily visit reports that it already exists. Logbook commands are outside this release.

Ordinary messages receive at most one help prompt per sender per 24 hours. Command processing is bounded to 30 commands per sender per minute. No general-purpose AI or free-form chat processing is used.

## Processing and privacy

The existing signed Instagram webhook admits messages only for the configured brand recipient and ignores echoes. Slash-command records use a separate queue path from comment/discovery automation. Claim messages persist only the command type and challenge hash; arbitrary chat text is discarded. Other command arguments are bounded.

The provider adapter requests only sender ID, username and `is_user_follow_business` from the configured version of Meta's API. The returned ID must match the signed message sender and the follow value must be a boolean. Follow checks happen when claiming, not continuously. The first sender to present a code is pinned; another sender must obtain a new code.

Claims, profile updates, referral awards and event results commit transactionally under the restricted Worker role. Unique connection constraints prevent reassignment to another FinFolk member. Provider-scoped DM identities are not assumed to be interchangeable with public comment/media author IDs.

Message IDs deduplicate webhooks. Recorded results prevent repeated check-ins or awards. Reply delivery has a separate reservation: if a provider response is ambiguous or a send is interrupted, mark it uncertain rather than automatically sending a duplicate. Retrying the command with a new DM safely returns the current result. Commands older than 24 hours or for a changed brand recipient are skipped. No replies are initiated outside a member's incoming messaging window.

Account deletion cancels claim codes and deletes attributed DM records. Anonymous/unattributed command metadata expires after 30 days. No claim codes, tokens or raw DM bodies belong in operational logs.

## Configuration and activation

- Apply migrations 0008–0009 with the direct connection and existing migration runner. New grants are limited to the new FinFolk tables for `finfolk_api`.
- `INSTAGRAM_DM_ENABLED` controls incoming slash commands and private replies. It is independent of existing comment/discovery/publication switches.
- `INSTAGRAM_AUTO_CLAIM_ENABLED` additionally permits claim-code generation and automatic claim completion. Both default to false.
- Reuse the existing server-side `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, pinned `INSTAGRAM_GRAPH_VERSION` and signed webhook secrets. The adapter currently targets the existing `graph.facebook.com` integration. Do not silently switch API stacks or credentials.
- `INSTAGRAM_ADMIN_IDS` remains the server-only reviewer allowlist. Manual review actions require a verified administrator, an unexpired requested claim and evidence of a matching signed message.

Before enabling either switch, authorize the brand account, obtain applicable messaging permissions/access, complete Meta publishing/review requirements, subscribe the actual brand account, and test real follower and non-follower personal accounts. Verify the exact sender-profile fields and reply endpoint on the configured API version. Dashboard test deliveries and mocked transport prove implementation behaviour only; they do not prove live provider eligibility. If the selected API setup cannot return authoritative sender/follow data, automatic claims must remain off.

## Verification

- `npm run test:instagram-dm`: parsing, fail-closed identity validation, explicit UI steps, resume, claim/error/disabled states and prerequisites.
- `npm run test:instagram-dm:integration`: migrations plus signed webhook/API/queue processing on the isolated `finfolk-community-pilot-test` branch using the actual `finfolk_api` credentials and mocked Meta transport. Creates and removes synthetic fixtures; refuses any other endpoint.
- Run the full npm and Python suites, build the static site, and run Wrangler's deployment dry-run.
- Browser-check desktop and 390-pixel claim instructions, keyboard/copy behaviour, returning from Instagram, expiry/replacement, successful status polling and requested manual review.
- Deploy the compatible migration/API before the frontend, preserving disabled switches until real-account acceptance passes. Pause by switching off DM/automatic claiming; retain completed connections and audit history.
