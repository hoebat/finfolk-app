# FinFolk on Neon

The atlas remains on GitHub Pages. The active account client uses Neon Auth; the community API uses Postgres through Drizzle/node-postgres. Firebase code is retained only as legacy reference and is excluded from the static artifact and active CI.

## Provisioned services

- Organization: `org-lucky-feather-94178133`
- Project: `odd-voice-85400108` (FinFolk, AWS Sydney)
- Production branch: `production`
- Isolated test branch: `finfolk-regulars-dev`
- `neon.ts` declares managed Auth; Postgres already exists.

`neon deploy` succeeded and pulled Postgres and Auth variables into ignored `.env.local`. Never commit that file. `npm run build` reads `.env` if it exists, otherwise `.env.local`, and emits only the public Auth URL and `NEON_API_URL`. Database passwords and JWKS bearer tokens never belong in browser config.

Neon Functions are not available in Sydney. Keep this database and Auth in Sydney and deploy the small API on Cloudflare Workers with Hyperdrive. The Worker is declared in `wrangler.jsonc`. The API is deployed at `https://api.finfolk.com.au/` (also available at `https://finfolk-community.zcaudate.workers.dev/`). Production and localhost CORS, real Neon Auth sign-in/session flows, profile writes and private-session access were verified through the deployed Worker.

## Local development

```bash
neon env pull
npm ci --ignore-scripts
npm run db:migrate
npm run dev
```

In another terminal, set `NEON_API_URL=http://127.0.0.1:8787/`, run `npm run build`, then `npm run dev:web`. Open `http://127.0.0.1:8000/`.

For isolated testing:

```bash
neon env pull --branch finfolk-regulars-dev --file .env.test.local --services postgres,auth
node --env-file=.env.test.local scripts/migrate_neon.mjs
npm run test:neon
```

The end-to-end test creates two temporary users in the test branch, obtains real Neon Auth JWTs, exercises the protected API, and removes test users in `finally`. It refuses to run against production. It marks only those controlled test users email-verified in the test branch; production always reads real verification state.

To exercise a running server, start it with the test env file, then run:

```bash
NEON_TEST_API_URL=http://127.0.0.1:8787/ npm run test:neon
```

## Production API deployment

1. Run `npx wrangler login` and finish the browser authorization.
2. For a new Hyperdrive configuration, upload the public CA used by Neon with `npx wrangler cert upload certificate-authority --ca-cert /path/to/ca.pem --name finfolk-neon-ca`, then set its ID as `NEON_HYPERDRIVE_CA_ID` in the ignored env file (or the public `wrangler.jsonc` vars). The existing production configuration uses ISRG Root X1. Run `npm run provision:api`. It uses Wrangler's documented token command without printing the token, creates a least-privilege database role if needed, and provisions Hyperdrive over verified TLS. Credentials travel in HTTPS request bodies, not CLI arguments. The role can access the FinFolk schema and only the Auth user columns required to verify identity.
3. Hyperdrive query caching is disabled: privacy changes and expiring access must be evaluated against current rows. The script refuses an existing cached configuration.
4. The script writes public Auth URLs and the Hyperdrive binding into `wrangler.jsonc`, then deploys the Worker. Keep its private origin URL in ignored env only.
5. Set `NEON_API_URL` to the deployed Worker URL. Copy only the public Auth URL and API URL into `web/neon-config.json` (with `enabled:true`) for GitHub Pages builds that have no local env file. Leave Google disabled until production OAuth credentials are configured.
6. Confirm `/health` works, unauthenticated `/api` returns 401, cross-user data checks pass, and sign-in/profile saving works from `finfolk.com.au`. Then publish the enabled account config.

Auth trusted domains include `https://finfolk.com.au` and `https://www.finfolk.com.au`. Configure production SMTP and any production Google OAuth credentials in Neon before inviting members; email verification codes are implemented. Instagram/TikTok connections are profile links, not verified account ownership or follower-based authorization. Automatic Instagram imports remain disabled.

Migrations are versioned SQL under `backend/migrations`; their checksums are checked before application. Use the direct connection for migrations. `BEACH_CATALOG=/path/to/beaches.json npm run db:migrate` synchronizes the canonical beach catalogue in one batch without deleting historical beaches. Production was seeded from the currently published catalogue (2,307 beaches). Re-sync after publishing an expanded directory. IANA timezone overrides cover Lord Howe and the external island territories.

## Privacy and Regulars

- Check-ins are self-reported, one per beach-local day. Only today and the previous 29 local days qualify.
- Closed is the default. Both Open participants need 3 qualifying days for allowed activity fields, or 5 for allowed dive summaries.
- The Regular badge requires 3 qualifying days and drops automatically with inactivity. Suggestions require at least one recent day. Expiry is evaluated on every API request, not by a cron.
- Accepted buddies bypass visit counts but never field-level sharing preferences. Blocking and connection removal revoke access. Queries exclude blocked/declined pairs.
- Exact visit dates and private sessions are owner-only. Gated responses use `private, no-store` and are excluded from the offline cache. Only the viewer's own progress is returned; hidden visit counts are not leaked through the progress indicator.
- Reports are administrator-only database records. Project administrators review `finfolk.reports`; no public endpoint exposes them.
- Account deletion removes app data and tombstones the member, then uses Neon Auth's deletion API. If Auth deletion fails, Account offers a retry to finish deleting the sign-in.

## Browser storage

IndexedDB contains public datasets only. Shared metadata, per-file SHA-256 hashes and package dependencies come from `data/downloads.json`. Recent data defaults to 250 MB; 100 MB and 1 GB are available. Saved packages are pinned against app cleanup, but the browser can still evict storage. The System panel displays persistence status, completeness, updates and removal controls.

Large downloads start automatically with progress and Cancel. A failed update retains the previous complete package and manifest. Offline startup selects a complete saved package. The service worker caches only the public app shell; government imagery, shore tiles and social embeds are not promised offline. Browser support failures fall back to network loading.

## Verification

```bash
npm test
python3 -m unittest discover -s tests -v
npm run build
npx wrangler deploy --dry-run --outdir .cache/worker
npm run test:neon
npm run test:deployed
```

Live tests passed against Neon Auth and Postgres, including real signup/JWT issuance, session restoration, private-session denial, duplicate check-ins, reciprocal 3/5 gates, accepted buddies, Closed mode and blocking. HTTP tests also passed against the running local server. The deployed Cloudflare Worker also passed `npm run test:deployed` for production and localhost origins. Google OAuth and email delivery remain separate acceptance checks.
