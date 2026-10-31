# Instagram authorization investigation

Observed 31 October 2026 UTC.

## Recovery

The Facebook Page-based route successfully reads Page `1387107281155901` and its linked `finfolk.com.au` account `17841461601419539`, even though `/me/accounts` returns an empty list. A valid app-bound Page token has been obtained, retained encrypted, and activated through the shared account/subscription finalizer. Authorization and subscription checks pass. The connection remains paused until the real sender pilot completes.

The Instagram subscription readback for this Page token omits the app ID and returns only `subscribed_fields`. Verification now binds the token to the correct app using Meta's debugger and to the configured Page via `/me` before accepting exactly one subscription entry containing `messages`.

The evidence below records the unsuccessful Unified Login investigation, not proof that every Meta connection method is broken.

## Reproduction

App `1667613151655339`, business portfolio `2984759511923492`, configuration `2606242293176301`, Instagram account `finfolk.com.au` / `17841461601419539`.

1. Accept the Instagram Tester invitation and verify the role is active in Meta app roles.
2. Authorize only the brand account through the configuration. Both Facebook administrator login and direct Instagram login complete consent and token exchange.
3. Independently generate a token from Meta's Unified Login dashboard, with the same profile/message permissions.
4. With each token, call `GET https://graph.facebook.com/v26.0/me?fields=client_business_id`, `/me/permissions`, and `/me/assigned_instagram_accounts?fields=id,username&limit=100`.

Both dashboard and OAuth tokens identify a business integration system user and have granted `instagram_basic` and `instagram_manage_messages`. Account discovery returns HTTP 200 with `data: []` and no next page. Reading `/17841461601419539?fields=id,username` returns HTTP 400, error 100/subcode 33. Adding the client business ID as the `business` query parameter also returns an empty list.

## Independent checks

- App-authenticated `/debug_token` confirms the saved token is valid, belongs to the correct app, is a `SYSTEM_USER`, and has both permissions with no fixed expiry.
- Meta omits `target_ids` from its granular permission entries. That omission alone does **not** establish whether an account grant exists.
- Business Settings → Connected apps → FinFolk lists `finfolk.com.au`, account ID `17841461601419539`, and profile/posts plus message access.
- Configuration preview/editor shows General login, system-user token, no fixed expiry, required Instagram accounts, and only the two Instagram permissions. No missing task selection was identified. No configuration edits were saved.
- The tester account appears in the dashboard token table. Its account webhook subscription is Off; account access must be verified before subscription/activation.
- Business Settings → System users reports no system users. No regular system user was created to substitute for the business integration system user.
- The saved pending connection retains an older selector ID `1366239233247985`; the configured expected Graph account ID is `17841461601419539`. Diagnostics now distinguishes the stored ID from the configured expected ID. This discrepancy does not explain an empty discovery list; the verified finalizer replaces the stored ID only after real discovery succeeds.

## Requested Meta investigation

Explain why assigned-account discovery returns no accounts when Connected apps lists this Instagram asset and the app-authenticated debugger confirms the valid app/token/permissions. Determine whether this is an asset grant/configuration problem, an access-level limitation, or a Unified Login service defect. No confirmed cause is asserted.

FinFolk callback request IDs for correlation with application logs: `551fdc45-81b9-4435-bd34-e0f00386ff3a` and `b823bf97-46a7-440e-bc07-54a97e5a519f`. These are FinFolk request IDs, not Meta trace IDs. Never attach tokens, OAuth codes, app secrets, or raw authorization URLs to a report.

## Recovery acceptance

After a confirmed repair, use the saved-grant verifier first. Consent refresh is needed only if Meta requires a new grant. Require exactly the expected brand, subscribe to messages and verify readback, then test signed receipts and visible `/ping` and `/help` replies from the allowlisted real `chriszfree` sender. Public messaging stays disabled throughout investigation. This report is a draft and has not been sent to Meta.
