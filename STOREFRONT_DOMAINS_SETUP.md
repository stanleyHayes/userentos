# Storefront domains — one-time setup

Storefronts are reachable three ways, and the application side of all three is
built and tested. Two of them need DNS and hosting configuration that only an
account owner can do. This is that list.

| Address | Example | Needs setup? |
|---|---|---|
| Path | `userentos.com/s/ama-homes` | No — works today |
| Subdomain | `ama-homes.userentos.com` | **Yes** — wildcard DNS + wildcard domain |
| Custom domain | `amahomes.com` | **Yes** — a Vercel token, then self-serve per seller |

---

## 1. Wildcard subdomains — `*.userentos.com`

Every storefront gets `{slug}.userentos.com` for free, but only once one
wildcard record exists. The app already resolves the slug from the hostname
(`detectStorefrontSlug`) and the API already resolves it server-side
(`storefrontHost` middleware) — nothing in the code is waiting on this.

**DNS** — at whoever hosts the `userentos.com` zone:

```
Type   Name   Value                        TTL
CNAME  *      cname.vercel-dns.com.        3600
```

If the zone is on Vercel DNS, add the wildcard as a domain on the project
instead and Vercel writes the record itself.

**Vercel** — Project → Settings → Domains → Add:

```
*.userentos.com
```

Vercel issues one wildcard certificate covering every subdomain, so no
per-storefront certificate work is needed.

**Check it worked** — any slug should return the storefront, not the
marketing page:

```bash
curl -sI https://demo-homes.userentos.com | head -1
curl -s https://api.userentos.com/api/storefronts/resolve/host \
  -H 'Host: demo-homes.userentos.com'
```

The second should answer with that storefront's `slug` and `canonicalUrl`.

**Note on the API host.** `api.userentos.com` is deliberately excluded from
storefront resolution (`isPlatformHost` in `middleware/storefrontHost.ts`), so a
wildcard record does not accidentally turn the API into a tenant.

---

## 2. Custom domains — per seller, self-serve

A seller adds their own domain in Storefront → Settings. The flow is:

1. Seller enters `amahomes.com`. The app stores a verification token and shows
   the DNS to publish.
2. Seller publishes it and presses Verify. The API checks the TXT record
   (`checkDomainOwnership`), and only then attaches the domain to the hosting
   project and starts certificate issuance.
3. A cron job polls every 5 minutes until the certificate is live, then flips
   `tlsStatus` to `active`. If it is still pending after
   `TLS_PROVISION_TIMEOUT_HOURS` (default 24), it is marked `failed` with a
   message telling the seller to check DNS and verify again — recoverable, since
   re-verifying re-attaches.

**What you have to configure**, on the API service (Render):

| Key | Value |
|---|---|
| `HOSTING_PROVIDER` | `vercel` |
| `VERCEL_API_TOKEN` | a token with access to the web project |
| `VERCEL_PROJECT_ID` | Vercel → Project → Settings → Project ID |
| `VERCEL_TEAM_ID` | only if the project is under a team |
| `TLS_PROVISION_TIMEOUT_HOURS` | `24` |

Leave `VERCEL_API_TOKEN` empty and nothing breaks: domain verification still
works, and the UI says TLS is not managed by this deployment rather than showing
a wait that will never end. That is the point of the fallback — the previous
behaviour reported "provisioning" forever with nothing behind it.

**Moving off Vercel** is one new file implementing `HostingProvider`
(`services/hosting/types.ts` — three methods) plus a branch in
`services/hosting/index.ts`. Nothing else in the codebase knows who issues
certificates.

---

## 3. Canonical URLs

A storefront reachable on both its subdomain and a custom domain would otherwise
be indexed twice and split its own ranking. Once a seller promotes a domain to
canonical:

- the API 301s GET/HEAD on any other host to the canonical one (POST is left
  alone so a request body is never dropped);
- the page sets `rel=canonical` to the canonical URL and `noindex` on a
  non-canonical storefront host, because an in-app navigation never reaches the
  server to be redirected.

No setup needed — it follows from the seller's choice.
