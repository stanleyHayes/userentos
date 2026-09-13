# Mobile compliance engineering batch

This batch connects the native client to the published API and shared contracts.
It includes privacy export/deletion, AI-sharing disclosure, tenant-profile field
changes, rent receipts, payout account setup/recovery, checkout retry keys,
Google/Apple subscription purchase and restoration flows, and app privacy
manifest declarations with a separate data-disclosure inventory.

Session work includes credential-operation serialization, refresh failure
handling, delayed-401 coordination, cache isolation, push callback guards and
chat reconnect/history recovery. Socket listener preservation was already
published in `2d74e3c`. The query-string compatibility bridge and dependency
lockfile changes are included with their rationale in the vendor README.

## Verification and findings

The mobile suite passed 79 checks using portable contracts and mounted Expo-web
components with controlled API/socket responses. A separate deletion regression
then reproduced success confirmation disappearing when logout redirected to
login. Closure now posts a persistent confirmation through the root notification
provider after logout; the mounted regression verifies it survives the redirect
and ordinary notification timeout. Local biometric cleanup no longer attempts
server revocation after the account has already been deleted; cleanup failure is
reported separately and is guarded against a replacement session.

The staged batch was copied onto a separate checkout of `9efdfdd` with locally
installed dependencies reused. Shared types were generated with the normal root
`sync-types` command before verification. Final typecheck and lint pass.
The first export attempt could not resolve the vendor bridge through reused
symlinks. A clean `npm ci --ignore-scripts --offline` installed 811 packages
from the cache, after which Android, iOS and web bundle exports all passed.
This validates the lockfile install without lifecycle scripts and JS bundling,
not a native binary build or a fresh online vulnerability audit.

## Remaining release gates

Expo-web checks do not establish native StoreKit/Google Billing, SecureStore,
push provider, share-sheet or device behavior. Final signed archives, store privacy/data-safety forms, purchase sandbox evidence,
production configuration and store review remain separate requirements.
Ghana registrations, regulated operator roles, retention classification and legal
review are still open. This publication is not a production deployment or a
claim of complete legal or store compliance.
