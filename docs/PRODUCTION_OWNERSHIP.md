# Production and legacy hosting

Production FinFolk at https://finfolk.com.au is built and deployed from https://github.com/hoebat/finfolk-next using the Clojure-authored xt.substrate backbone. Cloudflare Worker `finfolk-next-site` serves static assets and forwards browser API requests to `finfolk-next-api`; `www.finfolk.com.au` redirects to the main domain. The former `next.finfolk.com.au` hostname is retired.

This repository publishes the legacy static frontend through GitHub Pages at https://old.finfolk.com.au. Its root CNAME and Pages workflow guard must remain `old.finfolk.com.au`; it must never claim the production hostname. The Cloudflare DNS record for `old` is a DNS-only CNAME to `hoebat.github.io`.

The legacy frontend retains its current shared Next Neon Better Auth and https://api.finfolk.com.au configuration. The API CORS allowlist and managed-auth trusted origins include the legacy hostname. This does not restore the retired legacy backend or copy legacy accounts/history. Survey acquisition and Git LFS archive jobs remain active.
