# Atelier source-only handoff

This branch carries the authored code and a complete inventory of omitted new media, for immediate source work over a slow connection. New display media and source artwork are intentionally omitted, including their LFS pointer files. Use GIT_LFS_SKIP_SMUDGE=1 when cloning to avoid hydrating historical survey inputs.

Use handoff/atelier-goloka-2026-11-07 for complete, runnable visual previews once its media transfer finishes. That full branch preserves unchanged source and media at faf621571a08464f2c119c637680bbee0266999f. The native application is already complete on hoebat/finfolk-next main and can be developed independently.

SOURCE_ONLY_MEDIA.json records the original size and SHA-256 of each omitted file. Original files remain in the standalone local Atelier checkout and verified private recovery archives. Switch to the full branch for previews; this source-only branch intentionally omits their media.
