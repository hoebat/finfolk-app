# FinFolk Atelier on Goloka

This is the consolidated design workspace from the former
`finfolk-moodboard` worktree. The production application is maintained in
`hoebat/finfolk-next`; use this checkout for design and prototype development.

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone --branch handoff/atelier-goloka-2026-11-07 git@github.com:hoebat/finfolk-app.git finfolk-atelier
cd finfolk-atelier
git lfs install --local
git lfs pull
npm ci
npm run moodboard
```

The server is loopback-only and defaults to port 8770. Source artwork is in
Git LFS; pointer files are not usable images. Runtime dependencies and generated
previews are rebuilt locally. If raster preparation is needed, install Python
requirements in a local virtual environment, as described in the README.

The saved work includes the board, interactive sandbox, product navigation,
practice demonstrations, community/session views, source artwork and tests.
Prototype examples and rewards are demonstration data. They do not activate
production features or operate on real member accounts.

Do not use this historical repository's deployment commands for the production
site. Native Next frontend releases belong to `finfolk-next` on Netlify.
Private local configuration and caches from the original worktree are retained
only in the originating Mac's restricted consolidation archive.
