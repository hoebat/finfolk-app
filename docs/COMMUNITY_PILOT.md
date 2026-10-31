# FinFolk community pilot

FinFolk connects Sydney freedivers and snorkellers through shared beaches, recent regulars and reviewed public Instagram/TikTok posts. Social interactions remain on their original platforms. Maps and private logbooks support the experience. Check-ins never advertise live presence or expose exact visit dates to other members.

## First release

The account has Check In, Your posts, Profile & buddies and Settings tabs. Administrators also receive Review. Themes (Coastal, Sand and Night swim) persist on the device; depth-map colours retain their meaning. Followed beaches reuse the profile's beach selections and drive the personalised approved-post feed.

Members with verified email submit their own public Instagram posts/Reels or full TikTok video URLs, their platform username and one beach. They must confirm ownership, the `@finfolk.com.au` tag and public-listing permission. Instagram attribution and both platforms' tags are manually checked, not automatically verified. No platform scraping or media copying is performed.

Submissions move through pending, approved, rejected and removed states. Only approved, consented posts from undeleted accounts appear publicly. Public attribution uses the submitted social username, not private profile fields. Public-listing consent is separate from Open profile discovery. Signed-in personalised feeds exclude blocked members; approved public material remains accessible anonymously.

Rejected or removed posts can be corrected and resubmitted for fresh review. Existing posts start pending without public consent and must be resubmitted. Withdrawal immediately removes eligibility for every feed. Administrator actions record actor, decision, reason and time. Reports can be resolved separately from removing a listing. Members can report public listings after signing in and verifying email.

Original-post links work without loading an embed. Previews load only on request and include a fallback link. Shared links identify the beach and post; removed or unavailable posts produce an explanatory state. Community responses use `private, no-store` and are not saved by the offline service worker.

## API and configuration

- `GET /community/posts?beachId=...&cursor=...&postId=...`: anonymous approved posts, 20 per page; the returned cursor retains database timestamp precision. Optional postId resolves an approved shared post directly, including older posts. Returns an empty disabled feed before activation.
- `POST /community/referral`: aggregate outbound clicks for a listed post. Stores only a Sydney-local day, platform and count. Counts are referral indicators, not verified external interactions or unique people; bots can inflate them.
- Existing authenticated `/api` actions: `postStatus`, `post`, `myPosts`, `removePost`, `posts`, `followedPosts`, `reportPost`.
- Administrator-only actions: `reviewPosts`, `reviewPost`, `resolvePostReport`, `communityMetrics`. Uses the existing server-only `INSTAGRAM_ADMIN_IDS` allowlist. Never trust a browser-supplied role.
- `COMMUNITY_POSTS_ENABLED=true` enables submissions and public feed reads; it does not enable Instagram automation.
- `COMMUNITY_PILOT_BEACHES` is a comma-separated list of canonical beach IDs. When populated, submissions are restricted to those beaches. Check-ins and the national atlas remain available elsewhere.

## Verification and release

1. Start from current `origin/main`; preserve existing Instagram actions and invitation tracking.
2. Run `npm test`, `python3 -m unittest discover -s tests -q`, `npm run build`, and `npx wrangler deploy --dry-run`.
3. Test migrations 0006–0007 and real SQL/API behaviour on the isolated `finfolk-community-pilot-test` branch using `npm run test:posts:integration`. The script checks its dedicated endpoint, migrates the branch and removes its generated users. It never verifies real production members. The branch expires on 7 November 2026.
4. Apply committed migrations with the existing direct-connection migration runner, then deploy the API with `COMMUNITY_POSTS_ENABLED=false`. Do not change prior migration files.
5. Publish the frontend through the repository's GitHub Pages workflow. Validate account, submission and review views at desktop and narrow mobile sizes; validate real Instagram and TikTok original links, previews and unavailable-post fallbacks.
6. Confirm control of `@finfolk.com.au` on both platforms. Select 3–5 Sydney beach IDs, nominate the reviewer account and configure its existing Auth user ID in `INSTAGRAM_ADMIN_IDS`.
7. Set the pilot beaches and enable the feature only after browser acceptance. Recruit 20–30 participants for four weeks and review daily.

To pause, set `COMMUNITY_POSTS_ENABLED=false`; submissions and public/personalised feed reads stop without deleting review history. To remove one listing use Review. Keep schema additions during an application rollback; do not drop moderation data or restore the old unrestricted post reader.

## Four-week review and later phases

Review aggregate weekly check-ins, participants returning across multiple weeks, new memberships, existing invitation joins and outbound platform clicks. The admin activity panel reports counts without visit histories or external visitor identifiers. Ask participants whether they found local people and posts worth engaging with.

This release includes followed-beach discovery, shareable post links and reuse of invitation tools. Improve onboarding and ranking based on pilot feedback before expanding beyond Sydney. Later integrations must demonstrate supported provider access, attribution and consent before automating tag discovery; retain manual submission and review. Outings, clubs, commerce and in-app messaging are separate product decisions, not launch requirements.

## Browser acceptance progress

Desktop and a 390 × 844 viewport were inspected in Dia using local test data. Tab navigation, submission/consent layout, Night Swim contrast and saved-theme reload were checked. Visual QA fixed account-header/System contrast and radio placement. Real-account sign-in, reviewer actions and real external embeds remain launch checks. Local OAuth callbacks must use an explicitly permitted development origin; production trusted origins remain unchanged.

The account client uses the installed Neon SDK's session JWT before requesting `/token`, preserving OAuth verifier sessions in browsers that restrict cross-site cookies. Missing tokens return the account to sign-in. Regression checks cover session JWTs, opaque-token rejection, fallback and expiry.
