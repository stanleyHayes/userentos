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

1. **Live Paystack test-mode run** — see above. Everything up to the network
   boundary is covered; the boundary itself is not.
2. **Storefront subdomain routing at the edge.** `resolveStorefrontByHost`
   resolves a hostname to a storefront, but the deployment still needs a
   wildcard DNS record for `*.userentos.com` and a matching Vercel domain
   config before subdomains resolve in a browser.
3. **TLS provisioning is marked `provisioning` and never advances.** It needs a
   hosting-provider adapter call (the spec's §4.3 implementation note) once the
   hosting layer is chosen.
4. **Admin dashboards (§14) are partial.** Plans/entitlements and property
   review have UIs; storefront moderation, sponsorship, promotions, affiliate
   and the audit-log viewer are API-only so far.
5. **Sponsored placement is not yet wired into search ranking.** Campaigns are
   modelled, purchasable and moderated, but no surface reads them to boost or
   label a listing.
