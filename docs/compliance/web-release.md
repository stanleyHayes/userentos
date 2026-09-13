# Web compliance engineering batch

This batch connects the web client to the backend published in `0acf455`:
privacy export/deletion and public deletion instructions, moderation and contact
blocking, private rent receipts, per-send AI disclosure/consent, store-product
administration, and revised tenant-profile fields.

It also includes session-bound requests and caches, cross-tab refresh
coordination, chat reconnect/history recovery, checkout retry keys, and clearer
payout/wallet failure states. The E2E launcher explicitly points Socket.IO at the
isolated test server instead of inheriting a development API URL.

The publication excludes the pending native application batch. This is not
production deployment, store approval or evidence of completed Ghana legal
compliance. Legal/registration, provider configuration, retention inventory and
remaining release gates are still tracked in the working audit ledger.

## Publication verification

A separate checkout of `0acf455` plus only the staged web/shared/test batch was
used for the production build and lint; both passed again after the deletion
confirmation fix. Dependencies were reused locally.
Browser checks used the corresponding staged web source on port 5475 against
the isolated API on port 3402.

The initial 24-check run passed 23 cases and exposed a real regression: session
cache isolation remounted the deletion page on logout, losing its local success
message. Deletion now routes to the public page with confirmation in history
state before logout, so the confirmation survives the remount. All five privacy
checks then passed, including export/deletion from both the public page and
Settings and rejection of old access/refresh tokens. The earlier passing cases
cover real chat/blocking, checkout retries, payout recovery and session races.
These checks combine actual local API flows with controlled failure fixtures;
they do not verify live payment providers or every web route.
