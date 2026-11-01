# Legacy custom domain: old.finfolk.com.au

This repository serves the legacy frontend at https://old.finfolk.com.au. Production https://finfolk.com.au and https://www.finfolk.com.au are owned by the Cloudflare Workers deployment in [hoebat/finfolk-next](https://github.com/hoebat/finfolk-next). The retired `next.finfolk.com.au` hostname stays removed. See [production ownership](PRODUCTION_OWNERSHIP.md).

In [this repository’s Pages settings](https://github.com/hoebat/finfolk-app/settings/pages), keep the source as **GitHub Actions** and the custom domain as **old.finfolk.com.au**. The root `CNAME`, static-build assertion and Pages workflow guard must use that same legacy hostname. Actions deployments also require the repository Pages setting; the CNAME alone does not configure it.

Cloudflare DNS for the `finfolk.com.au` zone:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | old | hoebat.github.io | DNS only |

Do not change the managed Worker records for the root, www or api, or the mail MX/TXT records. Do not point DNS at the repository path `/finfolk-app/`.

After GitHub validates DNS and issues the certificate, enable **Enforce HTTPS**. The existing legacy frontend configuration uses the Next managed Neon Better Auth realm and `https://api.finfolk.com.au/`. Keep `https://old.finfolk.com.au` in that auth service’s trusted origins and API CORS allowlist; do not reactivate Firebase or the retired legacy backend.

Verify:

```sh
dig +short old.finfolk.com.au CNAME
curl -I https://old.finfolk.com.au/
curl https://old.finfolk.com.au/neon-config.json
```

Check beach links, account sign-in and API preflight handling on the legacy hostname. Confirm the main site still serves its substrate-backed Worker configuration and that www redirects to the main site.

Reference: [GitHub custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
