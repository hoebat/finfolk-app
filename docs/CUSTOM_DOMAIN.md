# finfolk.com.au

`finfolk.com.au` is the intended canonical domain. The root `CNAME` is included in the generated site for portability. **GitHub Pages ignores CNAME files for custom Actions deployments**, so the repository Pages setting and DNS records must also be configured. Adding the file does not change the current live URL.

## Activate the domain

When ready to switch, open [finfolk-app Pages settings](https://github.com/hoebat/finfolk-app/settings/pages). Under **Custom domain**, enter `finfolk.com.au` and save. At the domain's DNS provider, configure:

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | hoebat.github.io |

Use the four A records for the root domain, or an ALIAS/ANAME pointing to `hoebat.github.io` if the provider supports it. Do not point a DNS record at the repository path `/finfolk-app/`. Preserve mail-related MX/TXT records. Remove conflicting website A/AAAA/CNAME records only after checking the provider's existing configuration.

Optional IPv6 records at `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.

Wait for GitHub's DNS check and certificate provisioning, then enable **Enforce HTTPS**. DNS propagation may take up to 24 hours. With both root and www configured, GitHub redirects www to the canonical root domain. Domain ownership verification is available under the GitHub account's Pages settings using its generated TXT record.

## Firebase accounts and photos

When Firebase is activated, add `finfolk.com.au` and `www.finfolk.com.au` to Firebase Authentication's authorized domains. `storage.cors.json` already includes both HTTPS origins; apply it to the project's bucket as described in [Firebase setup](FIREBASE_SETUP.md). The existing `hoebat.github.io` origin remains available for the Pages address.

## Verify

```sh
dig +short finfolk.com.au A
dig +short www.finfolk.com.au CNAME
curl -I https://finfolk.com.au/
```

Check beach links, public session links and Firebase Google/email sign-in at the custom domain after cutover. All frontend assets use relative URLs, so the same artifact supports the project URL and the domain root.

Reference: [GitHub's custom domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
