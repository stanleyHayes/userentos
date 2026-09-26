# Retention schedule

The schedule itself is code: `apps/api/src/config/retentionSchedule.ts` classifies every collection the API stores — the personal data it holds, how long it is kept, what enforces that, and what closing an account does to it. `apps/api/src/__tests__/retention-coverage.test.ts` fails the build if a collection is added without a rule, if a TTL index disagrees with its rule, or if a collection is neither in the data export nor excluded from it with a reason. The periods the Privacy Policy quotes come from `RETENTION_PERIOD_DAYS` in `packages/shared/types/index.ts`; the privacy page renders them, and the API enforces the same numbers.

## What enforces it

| Mechanism | Where | Runs |
| --- | --- | --- |
| TTL indexes | model schemas | continuously, in MongoDB |
| Retention purge | `services/retentionPurge.ts` | daily 03:00 Africa/Accra, plus catch-up |
| Account erasure and ledger replay | `services/accountErasure.ts`, `services/erasureReplay.ts` | daily 04:00, plus catch-up |
| Account closure | `services/accountClosure.ts` | at the moment of closure |

Daily jobs record their last success in the `jobruns` collection. After boot, and every hour, any job that has not succeeded within a day runs, so an instance that sleeps overnight (Render free plan) still purges. The purge deletes in bounded batches. `RETENTION_PURGE_DRY_RUN=true` counts what it would delete and deletes nothing. Every run writes a counts-only `retention.purge` audit entry.

## Periods set by engineering (published, may be changed by the owner)

| Data | Kept |
| --- | --- |
| Closed account: identity | scrubbed at closure; tombstone deleted after 30 days |
| Closed account: profile, preferences, photos, identity documents, payout destinations, messages sent, enquiries, unapproved applications | deleted (or anonymised where others keep the record) 30 days after closure |
| Listings, service-provider, business, storefront and agency profiles of a closed account | taken down at closure; deleted after 30 days, or kept without photos/contact details where a tenancy, payment or booking refers to them |
| Security and audit log, including sign-up consent with IP address and device | 2 years, also after account deletion |
| Read notifications / all notifications | 1 year after creation / 2 years after last update |
| Applications not approved | 12 months after last update |
| Enquiries, viewing requests, business enquiries | 12 months after last update |
| Denied or revoked profile-access requests | 12 months after the answer |
| Replaced profile photos | 30 days |
| Dismissed abuse reports | 1 year after handling |
| Provider webhook payloads / app-store notification ids | 90 / 30 days |
| Complaint classifier log / registry page views / storefront analytics / valuation log | 180 / 395 / 400 / 730 days |
| Erasure ledger entries | backup window (`BACKUP_RETENTION_DAYS`) + 30 days after the erasure completes |

## Pending the owner and legal review (kept, never purged meanwhile)

These rules have `periodDays: null` and `decision: 'owner_legal_pending'`. The records are kept and used for nothing else until the period and its legal basis are confirmed:

- **Tenancy records**: agreements with signature evidence, renewals, move-outs, maintenance requests, disputes and dispute evidence, approved applications, and tenancy documents (agreements, receipts, legal notices).
- **Financial records**: rent payments and receipts, payouts, wallet ledgers and credits, marketplace and booking payments, commissions, paid placements, app-store purchases, coupon use, affiliate commissions.
- **Regulated services**: loans, financing, investments, insurance, savings, payroll deductions, employment links, partner institution profiles.
- **Moderation**: reports that led to action, suspensions, listing review decisions.

Also pending: whether a closed account's sent messages should be redacted and kept where a tenancy or dispute relies on them (today they are deleted); a dormant-account policy; the production backup period; Cloudinary backup settings.
