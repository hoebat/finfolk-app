# TikTok API for Business setup

FinFolk's TikTok account is `@finfolk.com.au`, registered in Australia. The developer portal is https://business-api.tiktok.com/portal/apps. TikTok for Developers Login Kit is a separate product and does not grant Business Messaging access.

## Current status

On 1 November 2026, the FinFolk developer app was submitted successfully. The portal shows `Pending` and `--` for App ID; no app credentials are available yet. The saved read-only application view confirms the FinFolk name, intended use and redirect URL. Developer-profile review is also pending. Do not create duplicate apps to work around this review.

## Developer application

- Name: FinFolk.
- Intended use: FinFolk administrators connect the brand account, respond to user-initiated commands and link consenting members' own accounts. Videos remain hosted on TikTok; retain only required identifiers and command metadata.
- Advertiser redirect URL: `https://api.finfolk.com.au/v1/integrations/tiktok/oauth/callback`.
- Starter permission: Ad account management → Ad account information → Read ad account information. This requests a prerequisite developer app for the separate Business Messaging access review; it does not authorize an advertiser account or enable messaging.

The callback currently returns an explicit `503` setup page. It is available independently of the database, never exchanges or reflects incoming codes, never follows incoming redirect URLs, and uses private/no-store caching and no-referrer. Replace this setup guard with reviewed OAuth state, identity binding and encrypted credential handling before allowing authorization. The callback is not evidence of working OAuth or API approval.

## Approval sequence

1. Complete developer-profile review. The portal currently allows preparing an app while this review is pending; the published creation guide says approved developer profiles are required for submission. Record the actual submission outcome rather than inferring approval from the form.
2. Create and obtain approval for the FinFolk developer application. TikTok documents a 2–3 business-day app review; the portal reports up to three days for profile review.
3. After the application is approved and has an app ID, submit the Business Messaging access intake linked from [Access to Business Messaging API](https://business-api.tiktok.com/portal/docs/access-to-business-messaging-api/v1.3). TikTok says it will initiate the manual security/privacy review within ten working days of intake submission. Do not submit unsupported statements about certifications, security audits or legal business details.
4. Complete TikTok's account entitlement requirements: Advanced Access or a Verified Business Account. Australian registration is within the Rest of World review path. Do not request US access without a need for it and the additional review.
5. After approval, configure the TikTok account-holder redirect URL, authorize only the FinFolk brand, bind the returned account to the expected app and account, store credentials encrypted, and configure the `DIRECT_MESSAGE` webhook. App credentials stay server-side. Preserve the existing messaging encryption key.
6. Configure the brand to receive messages from everyone, then test signed real `/ping` and `/help` receipts and visible replies with consenting pilots. Keep personal features disabled until identity, follower and ownership checks pass.

## Confirmed protocol details

The [Business Messaging webhook guide](https://business-api.tiktok.com/portal/docs/subscribe-to-business-messaging-webhook-events-via-webhooks-api/v1.3) includes `is_follower` on incoming messages, sender-role/identity fields and the brand's `user_openid`. This is a follower signal at receipt; verify its freshness and support for rechecking before using it for redemption, comments or delayed private replies. Do not equate it with a proven on-demand follower lookup.

Business Messaging's documented authentication endpoint is `/open_api/v1.3/tt_user/oauth2/token/`, with a one-day access token and a one-year refresh token. Messaging limits use 48-hour windows and differ from Instagram. Implement these as a separate provider namespace with independent authorization, rollout and records.

Public TikTok links and manually reviewed TikTok videos already work in FinFolk. They do not prove ownership or grant verified messaging features.
