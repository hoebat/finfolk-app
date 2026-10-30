# FinFolk logbook deployment

The atlas remains on GitHub Pages. Accounts use a **new, dedicated Firebase project** with Authentication, Firestore, Storage and callable Functions. `web/firebase-config.json` defaults to disabled; navigation/account actions stay hidden until setup is complete. Public session links then use `?view=logbook&session=ID`, and profiles use `?view=logbook&profile=UID`.

## Project setup

1. Run `npx firebase-tools@15.34.2 login`. Create a dedicated project in Firebase Console (or `firebase projects:create PROJECT_ID --display-name FinFolk`). Do not reuse another application's project.
2. Enable Blaze billing explicitly in the console. Set budget alerts (for example AUD $5/$15/$30); alerts **do not cap costs**. Storage and Functions require billing. Choose `australia-southeast1` for Firestore and Storage when creating them; functions use this region. Location choices are difficult to change later.
3. Enable Google and Email/Password in Authentication. Set the public app name to **FinFolk**, configure a support email and a minimum 8-character password policy. Add `hoebat.github.io`, `finfolk.com.au` and `www.finfolk.com.au` to Authorized domains. For local development, also add `localhost` and `127.0.0.1`. The default Firebase auth domain hosts the OAuth handler; the app uses user-initiated Google popups so Pages does not require a reverse proxy for redirects.
4. Register a Web app and save its public SDK configuration as a temporary JSON file. Do not put Admin SDK keys, OAuth secrets or service-account files in the frontend or repository.

## Deploy backend before enabling the frontend

```sh
npm ci --ignore-scripts
npm ci --prefix functions --ignore-scripts
npx firebase-tools@15.34.2 deploy --project PROJECT_ID --only firestore,storage,functions
```

Grant the Storage rules service agent permission to read Firestore when Firebase prompts for cross-service rules access. Set the bucket's CORS policy using `storage.cors.json`:

```sh
gcloud storage buckets update gs://BUCKET_NAME --cors-file=storage.cors.json
```

The project owner must perform this command if Google Cloud CLI is not installed/authenticated. Add a custom website origin to CORS and Authentication authorized domains if the Pages URL changes.

Enable only after backend deployment and emulator/access checks pass:

```sh
node scripts/configure_firebase.mjs /path/to/public-web-config.json --instagram YOUR_HANDLE --enable
```

Commit the public config to trigger the existing Pages workflow. No Firebase Admin credential is needed by the Pages build. Backend deployments remain a separate explicit Firebase CLI operation. Disabling accounts only changes the UI; it does not revoke public content or change server rules.

## Access and uploads

Sessions start private, and publishing requires a verified email. Public profiles contain only display name, bio and a user-provided Instagram handle. Session documents include location, date, optional duration/depth, notes, visibility and fixed photo slots. Emails stay in Firebase Authentication.

Six JPEG photo slots per session, each at most 2 MB and 2048 pixels on the longest side. The browser compresses images and strips metadata; the upload callable validates and re-encodes them again with Sharp. Storage denies direct client writes. Admin-created image objects have `private,no-store` caching and no permanent Firebase download token. Clients use `getBlob`, with Storage rules consulting current Firestore visibility. Already downloaded public photos cannot be recalled.

Publishing/unpublishing and profile/session edits use Firestore rules. Session/account deletion uses authenticated callables so documents and photos are removed together. Deletion marks sessions private first and can be retried. Account deletion uses recent authentication and a server-only tombstone to block writes from older tokens during cleanup. If cleanup is interrupted, sign in again and retry account deletion.

## Checks and monitoring

Java 21 or newer is required for emulators:

```sh
npm test
npm run test:rules
npx firebase-tools@15.34.2 emulators:exec --project demo-finfolk --only auth,firestore,storage,functions 'node tests/test_logbook_functions.mjs'
```

For manual development, use a local public config with project `demo-finfolk`, `enabled:true`, and `emulators:true`; emulator connections are allowed only on localhost/127.0.0.1. Never commit emulator configuration as the production config. The static build bundles the Firebase SDK lazily; `node scripts/bundle_firebase.mjs` builds it independently.

Check Authentication sign-ins, callable errors, Storage bytes/operations, Firestore reads/writes and billing after launch. Functions cap at three instances. The app's System callout shows logbook operations without logging email addresses, notes or photo contents. Keep profiles/session content user-editable; owners can unpublish or delete their sessions from their logbook.

Instagram is a public profile link and follow invitation, not verified ownership or follower-based authorization. Configure the FinFolk invitation handle once supplied; individual divers may add their own handles in Account.

The optional [Instagram indexing integration](INSTAGRAM_SETUP.md) adds verified ownership and follow checks, with automatic public post indexing after explicit opt-in. It has separate disabled frontend/server switches. Plain profile links remain self-reported.
