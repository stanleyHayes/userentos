# Backend compliance engineering batch

Publication scope: API implementation and shared contracts. This is an engineering
checkpoint, not a certification of Ghana legal compliance or store approval.
The matching web and mobile changes are being published separately; this commit
alone is not the complete release candidate.

The batch includes:

- Account export and closure, retryable related-record/upload erasure, and current
  account checks on HTTP and socket access.
- Bilateral contact blocking, user/message reports, moderation recovery and
  suspended-account restrictions with access to owned tenancy obligations.
- Account and biometric credential generations, stale MFA/refresh rejection,
  socket admission rechecks, explicit expiry and push-input validation.
- Server-side agreement validation, rent-period validation, durable receipt
  snapshots and private receipt access.
- Collection-source and settlement-evidence checks, durable wallet credits,
  subscription assignment/recovery and property quota enforcement.
- Google Play and Apple purchase verification, encrypted purchase journals,
  signed/authenticated notification processing, and recovery of interrupted
  entitlement assignment.
- Per-request AI-sharing consent and bounded semantic-query caching.

## Independent verification

The staged API/shared-contract changes were applied to a separate checkout of
`3b449f1`. After the normal shared-types prebuild, the suite passed all 1,099
checks across 111 test files, including opt-in MongoDB integration tests using
`RENTOS_TEST_MONGO_URI=mongodb://localhost:28018/rentos_compliance_e2e`.
API typecheck and lint also passed in that checkout.
Installed local dependencies were reused. This does not establish a fresh
package installation, production migration, or live provider verification.

## Remaining release work

Publish and verify the web/mobile consumers, including AI consent, revised rent
checkout and receipts, privacy controls, moderation and native store billing.
Configure store credentials/products and webhook identities from the API
`.env.example`; production store and payment tests still require separate evidence.
Review existing data and required indexes before any production rollout.

Full retention/export coverage, legal corpus and amendment review, regulated
business roles, DPC/licensing/tax obligations, native-device behavior, store
labels and submission outcomes remain open. Distributed socket revocation and
remaining financial concurrency/provider-recovery cases also need further work.
The ongoing evidence ledger is `COMPLIANCE_AUDIT.md` in the working project.
