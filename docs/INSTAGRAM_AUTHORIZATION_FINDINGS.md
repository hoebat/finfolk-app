# Instagram authorization investigation

Observed 31 October 2026 UTC.

## Verified pilot result

The Facebook Page route now works end to end, verified on 1 November 2026 AEDT (31 October UTC). Both `pages_manage_metadata` and `pages_messaging` are granted for the configured FinFolk Page. The Page subscription readback identifies this app and `messages`; the linked Instagram subscription also includes `messages`.

A fresh `/ping` from the signed-in `@hoebat.km` account produced a real signed webhook while processing was paused. Its actual scoped sender was then allowlisted through Settings, with only `ping` and `help` enabled. Fresh tests completed with Meta-confirmed reply IDs, and both “Pong” and the welcome/help response were visibly verified in the Instagram conversation. Diagnostic event IDs: ping `66675eb4-1684-440d-b2e6-a8ae763445c5`; help `9b753cfd-81e8-4d56-ba16-a7c3c5d50cc4`.

Settings recorded the signed event IDs and visible-reply confirmation through the normal acceptance API. Authorization, subscription and live-delivery checks pass, with no diagnostic-pilot readiness blockers. Mode remains `pilot`, limited to the single observed sender. Public production access, nonfollower acceptance and personal-command follower lookup remain unverified; no public rollout is claimed. The investigation below records the earlier failures and the steps that resolved them.

## Recovery

The initial Facebook Page-based recovery could read Page `1387107281155901` and its linked `finfolk.com.au` account `17841461601419539`, even though `/me/accounts` returned an empty list. A valid app-bound Page token was obtained and retained encrypted through the shared account/subscription finalizer. Account authorization and the Instagram-account subscription passed; missing Page permissions initially kept overall subscription readiness false and processing paused. Those permission gates are now resolved as recorded above.

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

## Page webhook permission and pilot follow-up

The first hoebat.km ping was rejected by Instagram because FinFolk blocks new message requests from nonfollowers. After following the brand, a new ping was accepted by the Instagram UI, but no signed webhook arrived. Do not treat the initial rejection as a webhook transport failure.

`GET /1387107281155901/subscribed_apps` with the valid Page token returns HTTP 403, error 200: `Requires pages_manage_metadata permission to manage the object`. A Page-based messaging connection must subscribe and verify both the Page and the linked Instagram account. The overall subscription flag was set false on this evidence; messaging remains disabled.

The Meta app initially rejected this scope as invalid. Adding the **Manage everything on your Page** use case makes `pages_manage_metadata` available as **Ready for testing**. The consent request is restricted to the current FinFolk Page and finfolk.com.au Instagram account; new permission approval is required before saving. The Threads API use case was also enabled at the user's request; no Threads account authorization or publishing is claimed.

## Permission grant and publication follow-up

FinFolk's Meta app is now **Published**, confirmed after reloading the dashboard. Public privacy and deletion URLs are configured. Meta's Page webhook screen warns that unpublished apps receive only dashboard tests, including for admins/developers/testers; this is separate from app-role permission access.

`pages_manage_metadata` is now granted. App-authenticated token inspection confirms a valid app-bound `PAGE` token, with this permission targeted to the configured FinFolk Page. `/me` matches the Page, and its linked Instagram account matches the canonical brand. Page subscription readback now returns HTTP 200 with an empty list.

The next actual Page subscription POST returns HTTP 403/error 200: `To subscribe to the messages field, one of these permissions is needed: pages_messaging`. Instagram-account subscription still succeeds. The Facebook Page OAuth request now includes `pages_messaging`; its broader Page-conversation access needs separate approval. Overall subscription readiness remains false until that grant, Page POST/readback and the shared finalizer succeed. Real DM delivery has not been verified.
