# Phase 1 release

What the `feat/phase-1-platform` branch delivers against the Product & Implementation Requirements brief, where it differs from the brief, and how to release it.

## Coverage by section of the brief

| § | Requirement | What is in place |
|---|---|---|
| 01–02 | Two active journeys; other account types inactive | Sign-up offers tenant and agent / agency / property manager only (`apps/api/src/config/signupRoles.ts`); other types show as "Coming later" and cannot be selected. Workers, Local Services and My Bookings are hidden and unreachable for tenants, landlords and property managers (`isPathPausedFor`, `packages/shared/productScope.ts`); service providers keep them. |
| 02 | Guided professional onboarding | Five-step website setup (`/onboarding`: Business, Look, Properties, About, Launch) prompted from the dashboard banner. |
| 03 | A website for every professional | The Storefront was repurposed into the website system: `name.userentos.com` by default, own domain with TXT verification and a canonical choice (Professional). Fixed template (Home, Properties, About, News, Contact); owners edit content only. |
| 04 | One property record, everywhere | Rent / sale / short let on every listing; the same record feeds the registry, the owner's website, `/property/<ref>` and search. Listings are reviewed by RentOS before publication. |
| 05 | Enquiries, messaging, SMS | "I'm interested", viewing requests and website enquiries open a RentOS conversation, create a lead and send the agent an SMS. Message alerts: in-app toast, browser notification, mobile push, then one email per conversation if unread after 30 minutes. |
| 06 | Simpler dashboards | Journey-first menus (agents: Properties, Leads, Messages, Website, Agreements, Business); Discover merged into Properties as "For you"; regulated widgets hidden unless offered. |
| 07 | News, images, AI Writer | Website posts syndicate to RentOS Real Estate News with the agency credited; cover images and inline image upload; AI Writer fixed (Claude Opus 5.5) and available inside text fields (✦). |
| 08 | GH₵150 subscription; GH₵5 per action | Professional plan at GH₵150 a month by mobile money. GH₵5 agreement signing/export and GH₵5 passport export are built and gated (see switches). Viewing agreements stays free. The mobile app shows notices instead of selling digital unlocks (store rules). |
| 09 | No duplicate systems | One property record and one website model serve every view. |

Also on this branch: TRUST-2 contact protection (`docs/trust/`), Terms and Privacy updates, per-page link previews, sitemaps and canonical URLs, one branded email layout, mobile app parity, and the end-user guide (`RentOS_User_Guide.pdf`, kept out of git like the brief).

## Where this differs from the brief

- **No agent contact details are shown to tenants.** Phone, email, WhatsApp and social links are not collected on websites (city and office hours only) and are stripped from public agency pages. Enquiries go through RentOS with an SMS to the agent. The brief's WhatsApp button exists but stays off behind `listings.direct_whatsapp`, because it hands over the agent's number. Sharing a listing link on WhatsApp is unaffected.
- **Plans:** Starter is free (3 listings, website, 5 posts); Professional is GH₵150 a month (unlimited listings, own domain, branding, analytics, unlimited posts). Enterprise is retired; its subscribers keep their terms.
- **GH₵5 fees are off** until mobile money collection is configured in production.
- **Model-only TRUST-2 blocks run in shadow** (`TRUST2_MODEL_ENFORCE_PERCENT=0`). Contact details and contact phrases are always enforced.

## Switches (Admin › Feature Flags, super administrators)

| Key | Default | Turn on when |
|---|---|---|
| `fees.agreement_signing` | off | Mobile money payment keys are set on the API. |
| `fees.passport_export` | off | Same. |
| `listings.direct_whatsapp` | off | Only by a deliberate decision to let tenants reach agents' own numbers. |

Regulated services (rent collection, wallet, financing, insurance, payroll, credit scores) are not flags: they stay off in production until `REGULATED_FEATURES` and the matching `REGULATED_BASIS_*` licence notes are set.

## Release checklist

1. Merge `feat/phase-1-platform` into `main`. Render (`rentos-api`) and Vercel (`userentos`) deploy automatically.
2. On Render, set:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (generate with `npx web-push generate-vapid-keys`) and `VAPID_SUBJECT` (for example `mailto:support@userentos.com`). Without them, browser alerts are not offered.
   - `ANTHROPIC_MODEL=claude-opus-5-5` (already set on 2 October 2026). The branch's default is the same model.
   - Optional: `MESSAGE_EMAIL_DELAY_MINUTES` (default 30).
3. Once the API deploy is live, run the migration as a one-off job, first without `--apply` (dry run), then with it:
   `node dist/scripts/migratePhase1.js --apply`
   It updates plans, backfills listing references and publish dates, removes stored website contact details, builds indexes and creates the three switches above (off). It is safe to re-run. One-off jobs run without a shell, so pass the command exactly as shown, without quotes.
4. Smoke test on production:
   - sign up as a tenant and as an agent;
   - set up and launch a website;
   - add a listing and approve it as an administrator;
   - check it on the website, in the registry and at its `/property/<ref>` link;
   - send "I'm interested" and confirm the agent's SMS and lead;
   - confirm the unread-message email;
   - check a link preview, `robots.txt` and `sitemap.xml` on `userentos.com` and on a website subdomain.

## Verification (2 October 2026)

- API: 240 test files, 2,310 tests passing.
- Web: typecheck, lint and production build pass; 31 mocked browser specs pass.
- Mobile: typecheck passes.
- Full browser suite against a local stack: 254 passed, 100 skipped (mobile specs that need the Expo web build), 1 timing flake (`payout-availability.spec.ts`, which passes 6 of 6 when run alone).

## Release log (2 October 2026)

Before pushing:
- **Builds:** a clean checkout built the API the way the Render Dockerfile does, and the pruned production build booted with `NODE_ENV=production`. `vercel build --prod` succeeded with the project's production settings.
- **Review:** the full diff was reviewed area by area. These fixes came out of it: fee unlocks are now idempotent and retried by a recovery job; RentOS's own hosts always count as the platform; moderation reports never go back to an older strike count; the page renderer ignores a relative API address.

Settings changed on Render (`rentos-api`):
- `ANTHROPIC_MODEL=claude-opus-5-5`.
- `PUBLIC_API_URL=https://api.userentos.com`, then `PUBLIC_BASE_URL=https://www.userentos.com`. `PUBLIC_BASE_URL` previously named the API host, so every emailed link pointed at the API. Payment callbacks use `PUBLIC_API_URL`.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` for browser alerts.

Settings changed on Vercel (`userentos`):
- `VITE_SITE_URL=https://www.userentos.com`, because the apex domain redirects to `www`.

Still open:
- An SMS provider for agent alerts: `ARKESEL_API_KEY` and `SMS_SENDER_ID`, or the Twilio variables. Without them SMS is skipped, and agents get the in-app and email alerts only.
- Paystack keys, before turning on the GH₵5 fee switches.
