# Marketplace / Storefront / Moderation / Payments — implementation audit

Audited against `Rentos_Marketplace_Storefront_Moderation_Payments_Implementation_Spec.docx`
(7 September 2026). Status is per the spec's own phase and acceptance definitions.

## Phases (§16)

| Phase | Scope | Status | Evidence |
|---|---|---|---|
| P0 | Repair super-admin moderation | **Done** | `routes/propertyModeration.ts`, 12 tests in `property-moderation.test.ts` |
| P1 | Plans / entitlements | **Done** | `services/entitlements.ts`, `models/PlanEntitlement.ts`, 11 tests |
| P2 | Storefronts, isolation, domains | **Done** | `routes/storefronts.ts`, `services/storefront.ts`, 11 tests |
| P3 | Paystack subaccounts + splits | **Done (test mode unverified)** | `services/marketplace/*`, 12 tests |
| P4 | Blogs | **Done** | `routes/authoring.ts`, storefront-scoped feed |
| P5 | Sponsorship | **Done** | `routes/marketplaceCommerce.ts`, `models/Sponsorship.ts` |
| P6 | Promotions / coupons | **Done** | `services/marketplace/coupons.ts`, 9 tests |
| P7 | Affiliate | **Done** | `services/marketplace/affiliate.ts`, 6 tests |
| P8 | External reviewer orgs | **Done** | `services/reviewRouting.ts`, 6 tests |

## Acceptance matrix (§18)

All 25 checks pass against a running API and a real database
(`apps/api/scripts/spec-acceptance.sh`).

| Scenario | Result |
|---|---|
| Super admin opens submitted property | Review actions visible and authorized |
| Super admin requests update | Moves to CHANGES_REQUESTED, owner sees reasons |
| Owner resubmits | New cycle traceable (reviewVersion 2), prior review preserved |
| No government reviewers configured | Routing returns rentos_only |
| Government review enabled | Only scoped routing changes; super admin still intervenes |
| Seller exceeds property limit | Backend denies with an entitlement error |
| Seller without storefront plan | 402 from the API, not just a hidden button |
| Storefront A request | Never returns storefront B's properties |
| Custom domain not verified | Cannot become canonical (409) |
| Paystack account setup succeeds | Subaccount code + ready status persisted |
| Eligible payment | Fee snapshot applied, split metadata persisted |
| Duplicate webhook | No duplicate financial effect |
| Seller creates coupon without entitlement | Backend denies (402) |
| Sponsored property loses approval | Campaign stops serving, billing history kept |
| Affiliate self-referral | Rejected and recorded with a reason |
| Plan updated | New version published; historical fees unchanged |

## Definition of done (§19)

- [x] Migrations are additive and backward-compatible — new collections plus
      optional fields on Property/BlogPost; existing documents keep working.
- [x] Super-admin review bug reproduced by test, then fixed; tests kept.
- [x] Authorization and tenant-isolation tests cover the new privileged paths.
- [x] Admin can configure price, platform percentage, limits and entitlements.
- [x] Storefront subdomains contain only that seller's listings.
- [x] Custom domain verification lifecycle operational for entitled plans.
- [ ] **Paystack test-mode flow not exercised against Paystack.** The adapter is
      written to the documented contract and unit tested with the transport
      mocked, but no live test-mode transaction has been run — that needs a
      real `PAYSTACK_SECRET_KEY`.
- [x] Blogs publishable by eligible users and correctly scoped.
- [x] Sponsorship, promotions/coupons and affiliate foundations implemented.
- [x] External review can be turned off entirely without breaking publishing.
- [x] Audit logs on moderation, payouts, domains, plan changes and overrides.
- [x] Env examples and `render.yaml` updated with the Paystack keys.
- [x] Typecheck, lint, 217 unit tests and both production builds green.

## Known gaps

Re-checked 7 September 2026, after the admin-dashboard and abuse-reporting work.

### Closed since the first audit

- **Live Paystack test-mode run.** Verified against the live sandbox: 34 banks
  listed, subaccount `ACCT_k8o0o4ay2tg2e1w` created, a GHS 1000 charge split
  50/950, and idempotency confirmed on a repeated reference.
- **Storefront hosts in the browser.** `detectStorefrontSlug` reads the slug off
  a platform subdomain and `useStorefrontHost` asks the server only for a
  possible custom domain. The middleware also 301s GET/HEAD to the canonical
  host, and the page sets `rel=canonical` plus `noindex` on a non-canonical
  storefront host.
- **Admin dashboards (§14).** All nine now exist and are wired: storefronts,
  transactions, sponsorships, promotions, affiliates, reviewer organisations,
  the audit log, the author dashboard and storefront analytics.
- **Abuse reporting and takedown (§6, §15).** `models/ContentReport.ts`,
  `services/contentReports.ts`, `routes/contentReports.ts`, 9 tests.
- **Sponsored placement in search ranking.** This entry was wrong when it was
  written: `controllers/propertyController.ts` already calls
  `getSponsoredPlacements`, `applySponsoredPlacements` and `recordImpressions`
  on the list path, skipping admin views and a seller's own listings, and
  labels each promoted item. Corrected rather than carried forward.
- **Scheduled posts.** `scheduledFor` and the `scheduled` status existed but
  nothing ever published them; a cron job now does, every 10 minutes.
- **Blog publishing quota.** Was counted over drafts at create time, which both
  blocked saving work and let pre-downgrade drafts publish past the new limit.
  Counted over published + scheduled and enforced on publish.

### Still open

1. **TLS provisioning stays `provisioning` and never advances.** Needs a
   hosting-provider adapter call (spec §4.3) once the hosting layer is chosen.
   This is a deployment decision, not missing code.
2. **Wildcard DNS.** `*.userentos.com` needs a DNS record and a matching Vercel
   domain entry before storefront subdomains resolve for a real visitor. The
   application side is done and verified locally against `*.localhost`.
3. **Paystack Settlements API.** Reconciliation verifies transaction by
   transaction rather than reading the settlements endpoint, so a settlement
   that never lands is not detected as such.
4. **Reporting a user.** `ContentReport` deliberately omits the `user` target
   because there is no account-suspension mechanism to action it with. Adding
   one means touching the auth path, which is its own piece of work.
5. **Audit log vocabulary is inconsistent.** Writers use bare verbs
   (`upload`, `update`) in `routes/documents.ts` and dotted names
   (`storefront.domain_verified`) everywhere else, and `entityType` is
   lowercase in some places and a PascalCase model name in others. The viewer
   reads its filter vocabulary back out of the data rather than assuming a
   fixed enum, so this is cosmetic — but it makes the log harder to read than
   it should be.
