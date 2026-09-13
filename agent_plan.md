# RentOS Agent Plan — Issue Fixes, AI Roadmap & Feature Pipeline

> **Date:** 2026-05-22  
> **Status:** Active  
> **Sprint Goal:** Close security gaps, fix performance issues, and define the AI/feature roadmap for v0.3.0–v0.5.0.

---

## Ghana and App Store Compliance — 2026-09-12

**Owner:** Codex. **Status:** IN PROGRESS. **Goal:** end-to-end compliance engineering, remaining feature completion and bug repair.

The live scope, source register, findings, verification and external obligations are maintained in [COMPLIANCE_AUDIT.md](COMPLIANCE_AUDIT.md). This work supersedes stale completion assumptions, without erasing earlier evidence.

Investment and insurance export checkpoint (13 September): reproduced missing investment holdings and insurance policies/claims. Added both groups scoped to authenticated userId, retaining maturity/return amounts, premium details and embedded claim outcomes. Real-Mongo HTTP tests verify ownership despite query impersonation, partner/property linkage and privileged claim-review roles. All 1,108 API tests across 116 files pass with two workers; the final two cases also pass after using actual admin/super_admin claim-review permissions. Typecheck/lint pass. Broader collection coverage, retention classification, regulated-service evidence and release gates remain open. Overall goal remains IN PROGRESS.

Borrower financing export checkpoint (13 September): reproduced missing financing applications, contracts, loans and credit-score history. Added these groups scoped to authenticated applicant/user identity; financier/admin roles and query parameters do not expand the personal export to other borrowers. Two real-Mongo HTTP checks verify income currency, repayment schedules, loan amounts, score history and cross-account exclusion. All 1,106 API tests across 115 files pass with two workers, plus typecheck/lint. The long store-lifecycle integration scenario now has an explicit 20-second budget after repeated default five-second timeouts, with assertions unchanged. Broader data inventory, business/financier data-rights classification and release gates remain open. Overall goal remains IN PROGRESS.

Audit history export checkpoint (13 September): reproduced silently truncated personal audit history at 1,000 records. Removed the cap, added deterministic newest-first ordering and declared an account/history index. A real-Mongo HTTP regression verifies all 1,005 owned fixture records, oldest/newest inclusion, no duplicates and other-account exclusion despite an impersonation query parameter. All 1,104 API tests across 114 files pass with four workers, plus typecheck/lint. Default-concurrency verification hit one unrelated store-lifecycle timeout; the bounded rerun passes without changed assertions or timeouts. Production index rollout, large-export resource limits and full data inventory remain open. Overall goal remains IN PROGRESS.

Google purchase export checkpoint (13 September): reproduced recovery leases/errors, token hashes, prepared grants and an unexpected nested provider field being included in personal export. Google journal queries now use an explicit top-level and nested-item allowlist while retaining owned product/order/renewal/access data. Two real-Mongo HTTP checks verify ownership, internal-field exclusion and authentication; all 1,103 API tests across 113 files plus typecheck/lint pass. Remaining export inventory and broader compliance requirements stay open. Overall goal remains IN PROGRESS.

Apple purchase export checkpoint (13 September): reproduced omission of the Apple purchase journal from account export. Added ownership-scoped applePurchases with an explicit product/date/renewal/access allowlist, excluding encrypted identifiers and recovery internals; updated API documentation. New real-Mongo HTTP tests verify inclusion, query-parameter impersonation resistance, private-field exclusion and authentication. All 1,101 API tests across 112 files pass, plus typecheck/lint. This closes the Apple journal omission; other collection coverage, retention classification and wider compliance gates remain open. Overall goal remains IN PROGRESS.

Mobile publication checkpoint (13 September): published `c305af8` (`feat(mobile): add compliance flows and resilient session recovery`) to origin/main. All 79 existing mobile checks pass. A new mounted regression reproduced deletion confirmation disappearing on logout; the persistent root notification fix passes its separate check, including visibility beyond the ordinary toast timeout. Independent-checkout typecheck/lint pass. After a clean cached lockfile install without lifecycle scripts, Android/iOS/web exports pass. The failed reused-symlink export and verification limits are recorded in docs/compliance/mobile-release.md. Native-device/provider/store approval and broader compliance gaps remain open. Overall goal remains IN PROGRESS.

Web publication checkpoint (13 September): published `9efdfdd` (`feat(web): connect compliance controls and isolate user sessions`) to origin/main. Independent staged-checkout production build and lint pass. Initial browser run passed 23/24 and exposed deletion confirmation lost on the session-provider remount. Fixed routing/history-state confirmation; final five privacy checks pass, including deletion from public and Settings entry points and old-token rejection. Scope and verification limits are in docs/compliance/web-release.md. Mobile publication and remaining compliance gates stay open. Overall goal remains IN PROGRESS.

Backend publication checkpoint (13 September): published `0acf455` (`feat(api): add compliance controls and durable payment recovery`) to `origin/main` and verified the remote head. This dependency-complete API/shared-contract batch includes erasure, moderation, session revocation, rent/receipt controls, durable collection/entitlement recovery and store billing. In a separate checkout of the published base plus staged changes, all 1,099 API tests across 111 files pass with opt-in MongoDB integration enabled; typecheck and lint pass. See `docs/compliance/backend-release.md` for scope and remaining release gates. Web/mobile consumers remain local and are next for publication. Overall goal remains IN PROGRESS.

AI publication checkpoint (13 September): published `3b449f1` (`fix(ai): bound provider requests and protect prompt privacy`) to `origin/main`. Verified the six-file batch in a separate checkout of the published base plus staged changes, with the repository prebuild generating shared types. All 569 API tests across 57 files, API typecheck and lint pass independently of remaining local changes. This publishes bounded provider transport, sanitized provider/retrieval logging and corrected blank-input batch embedding alignment. Broader consent and compliance work remains IN PROGRESS.

Incremental publication checkpoint (13 September): user authorized pushing verified fixes as each batch is ready. Published `2d74e3c` (`fix(mobile): preserve socket listeners across reconnects`) to `origin/main`; remote head verified. This batch contains the mobile socket manager, its production wiring and three passing regression checks. Remaining compliance work is still local and will be published in reviewed batches. Overall goal remains IN PROGRESS.

Web history overlap verification (13 September): strengthened the live reconnect test by holding the fetched history response while a new live message arrives. The existing web implementation passed the overlap check; no speculative cache merge was added. Multi-page catch-up and broader races remain open.

Mobile history race checkpoint (13 September): reproduced a live message disappearing when an older history response completed. Mobile chat now buffers updates during each history request, rejects superseded/canceled results and preserves pending sends until confirmation. The mounted race/pending-send check and two snapshot contracts pass; mobile typecheck/lint pass. Web cache races, multi-page gaps and native-device evidence remain open. Overall goal remains IN PROGRESS.

Mobile missed-message checkpoint (13 September): reproduced room reconnection without message-history recovery in the mounted Expo-web chat. Mobile chat now reloads messages/conversation details and requests presence on connect, removing the handler on cleanup. Five focused mounted recovery/room checks and mobile typecheck/lint pass. Native-device behavior, multi-page catch-up and snapshot/live-message ordering remain open. Overall goal remains IN PROGRESS.

Web missed-message checkpoint (13 September): expanded the real reconnect test to send a message while browser reconnection is held. It reproduced missing history despite restored live delivery. Web chat now refreshes the active message query, conversation list and unread query on connect. The final real socket/API test verifies offline and post-reconnect messages plus typing; web typecheck/lint pass. Mobile catch-up, multi-page gaps and snapshot/live-event ordering remain open. Overall goal remains IN PROGRESS.

Real chat transport checkpoint (13 September): added a Chromium/live Socket.IO/API test that interrupts the open chat transport, observes a new connection/room join, verifies peer typing and receives a new message without reload. It exposed stale outgoing typing state after reconnect; web/mobile chats now reset typing flags/timers on disconnect/connect. The final real reconnect test and web/mobile typecheck/lint pass. Mobile forced-transport/device verification and missed-message catch-up remain open. Overall goal remains IN PROGRESS.

Chat room reconnect checkpoint (13 September): web/mobile chats now rejoin their active conversation on every connection and dispose reconnect listeners on exit without buffering stale room commands. Seven room/recovery checks and web/mobile typecheck/lint pass. The browser chat-safety run exposed an E2E socket URL pointing at the dev API; the launcher now overrides it, and the real isolated chat/block/report flow passes. Forced-transport reconnect in a mounted chat and missed-message catch-up remain open. Overall goal remains IN PROGRESS.

Mobile socket lifecycle checkpoint (13 September): screens now share a socket while connection is pending; token rotation reconnects the same object and preserves listeners, while logout destroys it. Three connection contracts and a mounted Expo-web expiry/refresh/reconnect/notification test pass. All 69 mobile checks and mobile typecheck/lint pass, including the recent delayed-401 fix. Actual device recovery, initial-handshake expiry and broader release gates remain open. Overall goal remains IN PROGRESS.

Mobile late-401 checkpoint (13 September): reproduced a delayed response causing a second refresh after another request already rotated credentials. The request coordinator now reuses the current token within the same login generation. Added regression coverage for delayed responses and retry after transient refresh failure; all 21 focused session/refresh/socket-recovery checks and mobile typecheck/lint pass. Native recovery walkthroughs and remaining compliance gates stay open. Overall goal remains IN PROGRESS.

Mobile refresh failure checkpoint (13 September): password and biometric refresh now distinguish explicit credential rejection from temporary failures. Network/429/5xx/malformed responses preserve the login; validated rotating pairs update credentials, and requests abort after ten seconds. Ten new checks cover failure disposition and timeout, and all 63 mobile checks pass. Mobile typecheck/lint pass. SecureStore/response-loss recovery, device verification and socket recovery retry remain open. Overall goal remains IN PROGRESS.

Browser socket recovery checkpoint (13 September): three real Chromium checks exercise mounted web hooks with controlled Socket.IO frames/HTTP responses. Expiry triggers exactly one refresh, reconnects with rotated credentials and displays a post-reconnect notification; logout and fresh same-account login during the held refresh prevent stale reconnection. All three pass. This adds browser client evidence; unmocked expiry-to-refresh integration and native-device recovery remain open. Overall goal remains IN PROGRESS.

Socket recovery wiring checkpoint (13 September): the server emits an explicit expiry event before disconnect; web/mobile hooks revalidate through their existing HTTP refresh path, with coalescing and originating-session/effect guards before reconnect. Four shared recovery checks pass; the real socket test confirms expiry-event delivery and all 1,099 API tests pass. API/web/mobile typecheck and lint pass. Actual hook-driven browser/native automatic reconnect, recovery after network failure and initially expired handshakes remain open. Overall goal remains IN PROGRESS.

Socket expiry checkpoint (13 September): socket admission now requires a finite safe expiry, schedules disconnection at that deadline and checks expiry again at private admission and incoming packets. Timers are canceled on disconnect and avoid overflow. Real socket tests cover idle expiry, fresh-token reconnect and missing-expiry rejection; timer regressions cover cancellation/long deadlines. All 1,099 API tests across 111 files, typecheck and lint pass. Client automatic recovery after server expiry and remaining deployment/privacy gates stay open. Overall goal remains IN PROGRESS.

Socket admission checkpoint (13 September): connections join revocation-only rooms and recheck account/biometric generations before private-room membership or handlers become available. Early client packets wait for admission. Four real socket/Mongo race cases cover each revocation type at the first and second auth checks; an early-packet check also passes. All 1,095 API tests across 110 files, typecheck and lint pass. Distributed adapters, token expiry on long-lived sockets, legacy biometric identification and broader compliance gates remain open. Overall goal remains IN PROGRESS.

Live socket revocation checkpoint (13 September): authenticated biometric sockets join an account-specific biometric room; revoke-all/replay disconnect that room after the generation increment. A real Socket.IO/Mongo test verifies targeted disconnect, ordinary/other-account continued event delivery, rejected reconnect and account-wide disconnect. All 1,090 API tests across 110 files, typecheck and lint pass. Connections crossing authentication/room admission, legacy untagged sockets and multi-instance behavior remain open. Overall goal remains IN PROGRESS.

Biometric-only revocation checkpoint (13 September): a separate biometric generation now advances before biometric revoke-all/replay cleanup. Enrollment/exchange preserve it, and biometric-issued access tokens are checked by HTTP auth and new socket handshakes. Five new regressions verify cleanup ordering, exchange binding and real-Mongo rejection while ordinary access remains valid. All 1,089 API tests across 109 files, typecheck and lint pass. Existing sockets, legacy untagged biometric access tokens, per-device rotation/revocation and native verification remain open. Overall goal remains IN PROGRESS.

Biometric generation checkpoint (13 September): biometric records now persist immutable account session versions. Enrollment requires the authenticated token and loaded account versions to match; exchanges reject old records and retain the originating generation in successors. Seven HTTP route regressions cover stale/current/legacy exchanges and enrollment version handling. All 1,084 API tests across 109 files, typecheck and lint pass. Biometric-only revocation/replay races, device verification and other recorded compliance gaps remain open. Overall goal remains IN PROGRESS.

Refresh generation checkpoint (13 September): refresh records now persist an immutable originating session version on registration, password/MFA login and rotation. Exchanges reject records from an older account generation. Three new real-Mongo regressions verify late stale insertion, refresh/logout-all overlap and valid nonzero-generation rotation; all 1,077 API tests across 108 files pass, with API typecheck/lint. Biometric credentials and in-flight request/socket/push races remain open. Overall goal remains IN PROGRESS.

MFA challenge revocation checkpoint (13 September): password-authenticated MFA challenges now carry the account session version, and completion rejects stale or malformed versions before TOTP verification or credential issuance. Eleven new regressions pass (nine failed against the original behavior), covering current/legacy acceptance and issuance binding. All 1,074 API tests across 108 files, typecheck and lint pass. Credential creation overlapping revocation and refresh/biometric generation binding remain open. Overall goal remains IN PROGRESS.

Access-token revocation checkpoint (13 September): account session versions are now embedded in password/MFA/refresh/biometric-issued access tokens and checked by required/optional HTTP auth and socket handshakes. Shared revocation increments the version before cleanup and disconnects currently joined sockets. Real-Mongo coverage rejects legacy/old tokens after logout-all, accepts the new version, and checks optional/suspended paths. All 1,063 API tests across 107 files pass; API typecheck and lint pass. Concurrent credential exchanges, socket connection races and download/share-token revocation remain open. Overall goal remains IN PROGRESS.

Push revocation checkpoint (13 September): the shared logout-all, password-change/reset and refresh-replay revoker now removes existing push registrations for the affected account. Three real-Mongo regressions verify logout-all/replay cleanup, account isolation, repeat safety and single-session logout preservation. All 1,062 API tests across 107 files, API typecheck and lint pass. Existing access tokens can still authenticate until expiry; session-bound enrollment, concurrent registration/delivery and native provider evidence remain open. Overall goal remains IN PROGRESS.

Push input validation checkpoint (13 September): register/unregister routes and service entry points now reject query objects, arrays, non-string/oversized/control-character tokens and unsupported platforms before database access. Caller-supplied ownership fields are rejected. Twenty-four new regressions and all 1,059 API tests across 106 files pass with the opt-in MongoDB suite enabled; API typecheck/lint pass. Web-push platform/transport mismatch and device-session revocation remain open. Overall goal remains IN PROGRESS.

Push permission/session checkpoint (13 September): mobile push registration now checks the originating session/effect throughout OS permission/token work, contains setup errors and reports only acknowledged enrollment. Cleanup cannot unregister using a replacement session; notification-tap listeners require an active login and discard stale callbacks. All 53 mobile checks pass, including four new enrollment regressions. Mobile typecheck/lint pass. Server device-token revocation/race recovery and native push evidence remain open. Overall goal remains IN PROGRESS.

Mobile notification session checkpoint (13 September): mobile login/logout/restoration clear notification banners and unread counts. Socket events, suspension updates and foreground/profile/unread callbacks now require the originating session and active effect; profile updates must match the captured user id. All 49 mobile checks pass, including three new callback regressions. Mobile typecheck/lint pass. Native socket/push lifecycle and broader compliance gates remain open. Overall goal remains IN PROGRESS.

Web private-store cleanup checkpoint (13 September): favorites and notification records now reset on auth-session generation changes instead of relying on header logout. Favorite load/toggle success, rollback and finalization callbacks ignore older sessions. Five browser regressions and web typecheck/lint pass. Mobile notification/socket state and other persistence/callback audits remain open. Overall goal remains IN PROGRESS.

Mobile cache isolation checkpoint (13 September): mobile query/mutation caches now clear on login generation, account, authentication or active-role changes. The navigation stack is keyed to that boundary while root credential hydration stays mounted. All 46 mobile regression checks pass, including five new cache cases. Mobile typecheck/lint pass. Authenticated device switching and other client stores remain open. Overall goal remains IN PROGRESS.

Session cache isolation checkpoint (13 September): reproduced cached wallet transactions surviving both same-account and different-account fresh logins. Query/mutation caches now clear synchronously on session identity/authentication/active-role changes; a keyed provider remounts observers and local form state. Seven session/notification checks and the additional role-change check pass, with web typecheck/lint. Other client stores, late mutation callbacks and wider compliance gates remain open. Overall goal remains IN PROGRESS.

Delayed profile persistence checkpoint (13 September): reproduced a profile response restoring stale account data after another tab logged out while storage events were suppressed. Restoration now checks persisted identity/session id/credentials before accepting responses, rehydrates newer state and discards the old result. Both baseline regressions failed; all twelve final tab/restoration checks and web typecheck/lint now pass. Other persisted-state writers and broader compliance gates remain open. Overall goal remains IN PROGRESS.

Cross-tab refresh locking checkpoint (13 September): refresh acquires a browser lock scoped to the persisted login id, rehydrates latest credentials before collecting and before committing, and reuses a rotation already completed by another tab. Waiting is bounded; new logins have independent locks. Two focused real-browser checks and web typecheck/lint pass. All ten final tab/restoration checks pass. Unsupported-lock browsers, stale state writers and lost-response recovery remain open. Overall goal remains IN PROGRESS.

Cross-tab authentication checkpoint (13 September): web logins now persist an opaque session id; storage changes rehydrate other tabs, while logout/removal clears their session. Fresh same-account logins advance local generation across tabs, invalidating old requests; same-session credential updates retain it. Four real two-tab browser checks and web typecheck/lint pass. All five restoration regressions also pass. Refresh serialization across tabs and broader compliance gates remain open. Overall goal remains IN PROGRESS.

Shared web refresh checkpoint (13 September): API requests and restored-session verification now use one guarded refresh coordinator in the auth store. Same-session overlap shares the request; a late 401 can reuse already-rotated access credentials. Rotated credentials remain available during subsequent profile outages. Web typecheck/lint pass; six API boundary checks, five restoration/overlap checks and the additional late-401 reuse check pass across focused runs. Cross-tab coordination and wider compliance gates remain open. Overall goal remains IN PROGRESS.

API session-generation checkpoint (13 September): JSON, upload, checkout and AI-permission paths now check login generation, so fresh same-account logins invalidate old work. Uploads use the shared guarded request path with browser-generated multipart boundaries. API refresh promises are scoped to a generation; outages/malformed refreshes do not force logout. Eight browser regressions and web typecheck/lint pass; the additional cross-generation refresh isolation check also passes. Coordinating API and restoration refresh remains open. Overall goal remains IN PROGRESS.

Web restoration session checkpoint (13 September): restored-session verification and refresh now guard originating identity, credentials, login generation and effect lifetime before applying responses. Rotated tokens are retained before a fresh guarded profile check; temporary outages do not force logout. Five browser restoration checks pass. Earlier notification/checkout tests were corrected to import the actually loaded Vite auth module; all eight rerun checks pass, with web typecheck/lint. Broader concurrent refresh/recovery and compliance gates remain open. Overall goal remains IN PROGRESS.

Notification session cleanup checkpoint (13 September): existing notifications now clear on explicit login/logout and direct identity/authentication changes, including hydration. Token rotation and same-account profile updates retain messages. All five notification browser checks and web typecheck/lint pass. Late callbacks that create new notifications after a session transition and broader auth/provider/legal/store gates remain open. Overall goal remains IN PROGRESS.

Shared web notification checkpoint (13 September): routed legacy toastStore calls into react-hot-toast and installed one application-root renderer for public/dashboard routes. Errors persist until dismissed and render accessible alerts; notifications have labelled dismiss controls. Initial browser checks proved direct success delivery and found an aria-default override, now corrected. All five notification/payout browser checks and web typecheck/lint pass. Session-boundary notification cleanup and broader compliance gates remain open. Overall goal remains IN PROGRESS.

Web payout-account recovery checkpoint (13 September): failed/incomplete account loads now hide setup behind a retry state. Destination data is validated and retryable; saving requires a supported selection and a verified complete response. Persistent inline save/remove errors preserve actionable feedback. Three browser checks and web typecheck/lint pass. A mismatched toast implementation was identified for follow-up; broader provider/device/legal/store gates remain open. Overall goal remains IN PROGRESS.

Native payout-account setup checkpoint (13 September): added an in-app account screen reached from Profile and missing-account withdrawals. It loads provider destinations, validates responses, verifies/saves/replaces accounts through the API, displays provider-confirmed details and confirms removal inline. Loading and verification failures remain visible with retry/input preservation. Mobile typecheck/lint and all five focused setup/withdrawal checks pass, including replacement and withdrawal-to-setup navigation. Live provider and authenticated device evidence remain open. Overall goal remains IN PROGRESS.

Native withdrawal alignment checkpoint (13 September): mobile withdrawals now use verified server availability and the saved payout account, removing the unused payment-method selector. Missing account, existing payout, unavailable/incomplete data and amounts outside available/minimum limits disable requests; availability can be retried. All 40 mobile regression checks pass, including four withdrawal cases and invalid-amount boundaries; mobile typecheck/lint pass. Native payout-account setup and authenticated device/provider verification remain open. Overall goal remains IN PROGRESS.

Financial consumer recovery checkpoint (13 September): web withdrawal availability now validates required fields and exposes outage/incomplete-response retry states instead of claiming a payout account is missing. Insurance checkout distinguishes unavailable wallet data from insufficient funds and prevents purchase until valid data loads. Two withdrawal browser checks and one insurance check pass; web typecheck/lint pass. Native withdrawal presentation, complete response validation and broader legal/store gates remain open. Overall goal remains IN PROGRESS.

Wallet unavailable-state checkpoint (13 September): web/mobile wallet loading failures now show an explicit retry state instead of a fabricated zero balance/empty history. Incomplete wallet responses are rejected; mobile ignores superseded loads. Three web browser checks and four focused mobile checks pass, with web/mobile typecheck/lint. Full financial response-schema validation, native device recovery and broader compliance gates remain open. Overall goal remains IN PROGRESS.

Deposit form availability checkpoint (13 September): web/mobile deposit forms now use API-provided payment methods with loading, empty and retry states. Invalid/unavailable selections cannot submit; retry preserves the amount. Mobile deposit instructions remain visible until dismissed. The web form browser check and all 34 mobile checks pass; web/mobile typecheck/lint pass. Tests used mocked methods/collections. Native device deposit/cold-restart and real-provider verification remain open. Overall goal remains IN PROGRESS.

Wallet deposit checkout checkpoint (13 September): deposits now enforce rail availability and collectable amounts, resolve owner-scoped idempotent retries/races, preserve original instructions and use conditional initiation/uncertainty writes. Shared web/mobile checkout coordination now includes wallet deposits. All 1,035 API tests across 104 files, eight shared retry checks and API/web/mobile typechecks pass; API lint passes. A real local browser-client test lost an accepted simulated deposit response, retried the same key/payment and verified exactly one GHS 1 wallet credit. Native deposit UI/provider recovery and broader compliance gates remain open. Overall goal remains IN PROGRESS.

Collection source checkpoint (13 September): rent, subscription and wallet-deposit creation now save immutable server-selected rail identity. Verified callback routes/simulator bridge must match that identity, and scheduled verification selects the saved rail even after config changes. Ambiguous provider-reference-only callbacks are ignored. Direct-provider processing errors now return retryable 503 instead of acknowledging success. All 1,025 API tests across 103 files pass on final rerun; API typecheck/lint and the simulated browser payment/credit/receipt flow pass. One earlier invitation-test failure did not recur in focused/full reruns; cause unproven. Legacy untagged payments and provider-reference/outbox recovery remain open. Overall goal remains IN PROGRESS.

Pending webhook ordering checkpoint (13 September): pending callbacks now use conditional updates against nonterminal state and the observed provider reference. They cannot overwrite a concurrent completion or newly assigned reference. Unsupported normalized statuses are rejected before lookup instead of falling through to completion. Five new real-Mongo regressions pass; all 1,020 API tests across 101 files pass, with API typecheck/lint. Callback/rail ownership binding and broader recovery/compliance gates remain open. Overall goal remains IN PROGRESS.

Webhook currency checkpoint (13 September): provider adapters preserve reported currency and the finalizer requires confirmed GHS before settlement. Missing/foreign currency holds payment processing without wallet credit; a later valid confirmation can settle and clear obsolete failure/uncertainty metadata. All 1,015 API tests across 101 files and API typecheck/lint pass. The real local browser rent-payment, wallet-credit and receipt flow passed after explicitly verifying simulator mode. Live direct-provider currency contracts and broader recovery/compliance gates remain open. Overall goal remains IN PROGRESS.

Financial reconciliation checkpoint (13 September): scheduler settlement now requires provider-reported financial facts; Paystack verification supplies amount/currency/reference/paid time instead of the scheduler substituting expected amount and current time. Status-only adapters cannot finalize through reconciliation, and simulator polling no longer marks unfamiliar references completed. Finalization rejects non-finite/nonpositive amounts and mismatches at integer-pesewa precision. All 1,008 API tests across 101 files and API typecheck/lint pass. Direct-provider verification, lost references and live-provider evidence remain open. Overall goal remains IN PROGRESS.

Checkout timeout checkpoint (13 September): shared checkout coordination now aborts stalled requests after 30 seconds and retains the original retry key. Caller cancellation also retains the attempt; late responses cannot clear it. Eight shared regressions, three browser checkout checks (including a clock-controlled stalled response), and two focused mobile component checks pass. Web/mobile typecheck and lint pass. Edited-payload attempts and server/provider recovery remain open. Overall goal remains IN PROGRESS.

Checkout retry checkpoint (13 September): web/mobile provider checkouts now persist an account-and-payload-scoped retry key before sending, reuse it after a lost response/restart, and deduplicate concurrent matching requests. Local records contain hashes and UUIDs, not submitted phone numbers or amounts. Web delayed-401 account switching is guarded. Six shared regressions, two web browser checks and two Expo-web native-component checks pass; web/mobile typecheck and lint pass. Expo Crypto was added using SDK 55 documentation. All 32 mobile checks pass; the signed iOS simulator build succeeded, installed and rendered login without a missing-module error. Authenticated native checkout remains unverified. Changed-payload retries, cross-device coordination and provider-reference crash recovery remain open. Overall goal remains IN PROGRESS.

Collection initiation checkpoint (13 September): subscription transport exceptions now preserve uncertain payments as processing instead of marking them failed. Both rent and subscription initiation use conditional metadata writes that cannot overwrite a terminal webhook result; retries return saved provider instructions. Four real-Mongo ordering/recovery tests and updated controller regressions pass. All 986 API tests across 100 files pass; API typecheck/lint pass. Lost provider references, restart-safe initiation and live provider reconciliation remain open. Overall goal remains IN PROGRESS.

Property quota concurrency checkpoint (13 September): normal property creation now assigns immutable per-landlord slots enforced by a partial unique MongoDB index, rechecking effective quota after contention. Legacy properties still count; deletion frees capacity and validation failures consume none. Four real-Mongo regressions pass, including twelve competing requests for the final slot. Full API suite: 981 tests across 99 files pass; one subsequently added index-failure regression also passes with the seven-test service suite. API typecheck/lint pass. Deployment must establish the index; bypass/import writers and entitlement changes during in-flight creation need separate reconciliation. Overall compliance goal remains IN PROGRESS.

Latest checkpoint (13 September): agreement guards, account export/closure, retryable document/avatar erasure, tenant-profile save/currency fixes and bilateral blocking implemented. User/message reporting, moderator decision recovery, suspension/restoration and restricted access to owned tenancy obligations are now covered. 688 API tests pass; moderation and obligation browser checks pass, including the expanded delegated-access regression. API/web/mobile typechecks and lint pass. C01–C10 remain open as detailed in the audit; no production/store release claimed.

Apple status checkpoint (13 September): current owned subscription chain and both signed transaction/renewal payloads verified; active/grace eligibility and retry/expiry/revocation denial covered. All 783 API tests across 74 files pass; API typecheck/lint pass. Apple persistence/activation, native checkout/restore, notifications and sandbox evidence remain open. Overall goal remains IN PROGRESS.

Apple journal checkpoint (13 September): durable original-chain ownership, encrypted recovery identifier, renewal observations and revision-fenced concurrent restoration implemented. Ten real-Mongo cases pass; full API suite is 793 tests across 75 files, with typecheck/lint passing. Apple mapping/activation, recovery/notifications, native checkout/restore and sandbox evidence remain open; overall goal remains IN PROGRESS.

Apple entitlement checkpoint (13 September): captured product mapping, preparation/activation, read-time expiry/revocation and effective-plan selection implemented. Subscription responses identify app_store; native free-plan filtering handles both stores. All 796 API tests in 75 files pass, including real-Mongo entitlement checks; API/mobile typecheck/lint pass. Completion/recovery/notifications, native Apple checkout and sandbox evidence remain open. Overall goal remains IN PROGRESS.

Apple completion checkpoint (13 September): authenticated purchase/restore completion endpoint and OpenAPI added, with strict ownership/input handling and safe retry responses. All 815 API tests in 77 files pass, including HTTP boundary and real-Mongo interrupted-completion recovery. API typecheck/lint pass. Background recovery, notifications, bounded transport and native checkout/restore/sandbox evidence remain open. Overall goal remains IN PROGRESS.

Apple recovery checkpoint (13 September): scheduler-driven recovery with expiring row leases, encrypted original-chain verification, backoff and fenced release implemented. All 821 API tests in 78 files pass; API typecheck/lint pass. Real-Mongo tests cover competing/crashed workers and pending-to-active recovery. Provider deadlines, notifications, native checkout/restore/finishing and real sandbox evidence remain open. Overall goal remains IN PROGRESS.

Apple transport checkpoint (13 September): cancellable 15-second API response deadlines, redirect/body limits and 35-second signature caller deadlines added while retaining official SDK signing/validation. All 830 API tests across 80 files pass, including actual HTTP stall tests; API typecheck/lint pass. SDK certificate work retains its own timeout and is not directly cancellable. Notifications, native billing and sandbox evidence remain open; overall goal remains IN PROGRESS.

Apple notification verification checkpoint (13 September): signed v2 envelope and nested transaction checks added, with app/environment validation, delayed-delivery support and no direct access grant. All 845 API tests in 80 files pass; API typecheck/lint pass. Notification persistence/deduplication, HTTP delivery, owner reconciliation, native billing and real sandbox evidence remain open. Overall goal remains IN PROGRESS.

Apple notification processing checkpoint (13 September): HTTP delivery, immutable-owner reconciliation, durable deduplication and retry handling implemented. All 854 API tests across 81 files pass; API typecheck/lint pass. Real-Mongo evidence covers failure/retry, revocation, duplicates and renewed access. Outage-safe signed revocation overrides, missed-notification reconciliation, native billing and real sandbox evidence remain open. Overall goal remains IN PROGRESS.

Apple outage revocation checkpoint (13 September): signed refund/revocation overrides now persist before provider refresh and apply at preparation, activation and read time. Atomic signed-event ordering handles stale/concurrent delivery; reversal requires fresh verification and older refunded transactions do not block later renewals. All 855 API tests across 81 files pass; API typecheck/lint pass. Missed notifications, native billing and external sandbox/legal/store evidence remain open. Overall goal remains IN PROGRESS.

Native Apple billing checkpoint (13 September): iOS session listeners, account-bound checkout, verified transaction finishing, restore/foreground reconciliation and localized plan cards implemented. Four new pricing/completion contract checks and mobile typecheck/lint pass; iOS Hermes export succeeds. Full native UI/session/device/sandbox verification remains open, as do missed notifications and other legal/store gates. Overall goal remains IN PROGRESS.

Mobile session checkpoint (13 September): fixed cross-session API refresh/retry and late-response races for JSON requests/uploads; login/logout/hydration now advance a session version, and stale refresh/hydration results cannot replace current auth state. All 18 mobile checks and typecheck/lint pass. Xcode/runtimes are available but no simulator/device billing verification occurred. Native lifecycle/SecureStore review and legal/store gates remain open. Overall goal remains IN PROGRESS.

Mobile credential checkpoint (13 September): serialized auth/biometric storage and operation-generation checks prevent late writes from overtaking logout, new login or biometric disable. Partial/superseded biometric writes attempt cleanup; storage errors remain visible to callers. All 23 mobile checks and typecheck/lint pass. Native keychain/hardware/persistence-failure UX and billing evidence remain open, along with other legal/store gates. Overall goal remains IN PROGRESS.

Biometric UX checkpoint (13 September): local disable and confirmed server revocation now have distinct messages with retry; device management stays accessible while biometrics are off, and redundant enrollment login was removed. Six focused credential tests, a real Expo-web settings-navigation check and mobile typecheck/lint pass. Native prompt/keychain/offline-retry and billing verification remain open with other compliance gates. Overall goal remains IN PROGRESS.

Native build checkpoint (13 September): removed unused microphone/camera/background-audio permissions and verified generated iOS/Android configuration. Isolated iOS prebuild and installation of 110 pods succeeded. Original simulator xcodebuild in exec session 34704 has now SUCCEEDED; see the later native-launch checkpoint for the current follow-up build. Temporary root is recorded in /tmp/rentos-native-build-path. Privacy-manifest collected-data reconciliation and device/store evidence remain open. Overall goal remains IN PROGRESS.

Native launch checkpoint (13 September): simulator native build SUCCEEDED and native login screen rendered on dedicated iPhone 17 simulator CF9ACF95-0176-41C3-9038-7B46CB5CE620. The follow-up ad-hoc signing build (exec 48909) SUCCEEDED; reinstall and native launch no longer show the prior keychain warning. A temporary native ExpoSecureStore write/read/delete probe passed. Workspace Metro remains RUNNING in exec 26789 on port 8581. Native credentials/purchases, privacy declarations and legal/store gates remain open. Overall goal remains IN PROGRESS.

Apple restore and signed storage checkpoint (13 September): restoration/checkout inventory now includes and deduplicates unfinished StoreKit transactions, including expired transactions awaiting completion. Incomplete inventory prevents checkout. All 27 mobile regression checks and typecheck/lint pass. Signed simulator build and native SecureStore temporary-key write/read/delete pass; authenticated native lifecycle, sandbox purchases, privacy declarations and other Ghana/legal/store obligations remain open. Overall goal remains IN PROGRESS.

Privacy manifest checkpoint (13 September): added 17 confirmed app-level data categories and a source-linked native disclosure inventory at docs/compliance/mobile-data-disclosures.md. Expo introspection and isolated iOS prebuild pass; generated native privacy file matches the configured categories and retains dependency required-reason declarations. Final binary/archive, SDK/provider/sharing reconciliation, policy/retention and Ghana/legal/store gates remain open. Overall goal remains IN PROGRESS.

AI permission checkpoint (13 September): web/native API clients now request per-send permission naming Anthropic and OpenAI; six external AI routes reject missing/stale acknowledgements before handler execution. Cancellation preserves legal-chat input; raw RAG query logging removed. All 866 API tests across 82 files and 28 mobile checks pass; API/web/mobile typecheck/lint and diff checks pass. Native prompt and standalone-web runtime evidence, background/indirect AI transfers, provider terms/retention and broader Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Semantic-search privacy checkpoint (13 September): added per-request OpenAI permission before cache/provider access, provider-specific client disclosures, query limits and hashed cache keys. Corrected OpenAPI route/contract. All 869 API tests across 83 files, focused Expo-web consent flow and API/web/mobile typecheck/lint pass. Indirect indexing/recommendation transfers, provider disclosures and broader Ghana/store requirements remain open. Overall goal remains IN PROGRESS.

AI failure privacy checkpoint (13 September): removed provider message/nested-cause leakage from AI failures and fixed batch embedding response alignment across blank inputs. All 877 API tests across 84 files, API typecheck/lint and diff checks pass. End-to-end transport limits, indirect transfer consent, provider obligations and remaining Ghana/store requirements remain open. Overall goal remains IN PROGRESS.

AI transport checkpoint (13 September): Anthropic/OpenAI calls now use a 30-second header/body deadline, response-size cap, caller cancellation, fixed provider origins and no automatic SDK retries. Actual local HTTP stall/redirect/size tests and both real SDK parser checks pass. All 884 API tests across 85 files and API typecheck/lint pass. Indirect AI permission, provider operational obligations and broader Ghana/store requirements remain open. Overall goal remains IN PROGRESS.

Short-tenancy checkpoint (13 September): obtained and visually inspected Parliament Act 220 sections 25(5) and 33. Shared agreement checks now flag advances above one month for dated tenancies of one calendar month or less, including legacy signing; receipt citation corrected to section 33. All 891 API tests across 85 files and API typecheck/lint pass. Periodic tenancy classification, receipt/rent-card coverage, other legal corpus/payment boundaries and Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Receipt audit checkpoint (13 September): confirmed receipt issuance/covered-period/snapshot data are missing. Corrected receipt legal corpus and public citation; added exact-match legacy correction preserving edits/activation and clearing stale vectors. Real-Mongo correction and isolated CLI checks pass; all 892 API tests across 86 files and API typecheck/lint pass. Receipt issuance, production corpus migration and other Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Rent-period checkpoint (13 September): new rent payments require payer-selected dates on web/native, validated against agreement dates and stored before collection. Model/field immutability and idempotent period/method checks added. All 901 API tests across 88 files, two Expo-web payment checks and API/web/mobile typecheck/lint pass. Live web/suspended-payment regressions, immutable receipt snapshots/issuance and other Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Receipt-context checkpoint (13 September): new rent payments capture server-owned party/premises/furnished details before collection, with immutable context fields. Missing historical data remains explicitly absent; client-forged context is ignored. All 904 API tests across 89 files, focused Mongo/controller rechecks and API typecheck/lint pass. Confirmed-payment receipt issuance, protected download, historical resolution and other Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Receipt issuance checkpoint (13 September): added party-authorized confirmed-rent receipt API with conditional single-record issuance and immutable financial/tenancy details. Concurrent retries converge; later refunds remain visible through current paymentStatus. All 918 API tests across 91 files and API typecheck/lint pass. Printable/protected downloads, web/native receipt controls, automatic settlement delivery and wider Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Printable receipt checkpoint (13 September): added private, read-only HTML copies of issued receipts with escaped content, no-store/security headers, current refund status and copy timestamp. Unauthenticated/outsider access is rejected; suspended parties retain access. All 919 API tests across 91 files passed before two additional endpoint cases; all eight endpoint cases then passed. Three Chromium rendering checks and visual inspection at 390/1000px passed; API typecheck/lint pass. Web/native controls, automatic issuance/delivery, historical resolution and wider Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Web receipt checkpoint (13 September): payment details now offer owner-only receipt retrieval, a sandboxed preview and browser print/save-PDF control for completed/refunded payments. Requests bind to the initiating session, have deadlines and are cancelled when the control closes; failures remain visible and retryable. Live simulated collection → confirmed receipt → refresh/print invocation passed, including a forced 409/retry. A delayed receipt after account change is discarded. Web typecheck/lint and diff checks pass. Native controls, automatic issuance/delivery, actual PDF output verification and wider Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Mobile receipt checkpoint (13 September): tenants/landlords can retrieve and refresh owned completed/refunded receipts in a native text modal and choose a share destination. Private POST requests use session fencing and cancellation; the UI stops waiting after 20 seconds and supports retries. Fixed first-page-only payment history, misleading page-only totals and silent load failures. All 31 mobile checks passed before final autoload/placement adjustments; the three affected receipt/pagination checks then passed at desktop and 390px widths. Mobile typecheck/lint and diff checks pass. Actual device sharing/printing, automatic issuance/delivery and wider Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Automatic receipt checkpoint (13 September): confirmed rent settlement now attempts issuance before subsequent side effects; a five-minute bounded recovery job uses expiring per-payment claims, retry delays and immutable issuance. Missing particulars remain deferred. All 928 API tests across 91 files pass, including 16 real-Mongo receipt cases. A live simulated-payment browser check confirms issuance before the receipt action; a web history failure/retry regression also passes after fixing misleading empty-state handling. API/web typecheck/lint and diff checks pass. Receipt delivery, device printing/sharing, settlement side-effect recovery audit and broader Ghana/store gates remain open. Overall goal remains IN PROGRESS.

Durable wallet-credit foundation checkpoint (13 September): confirmed the terminal-before-credit interruption gap. Added immutable-key credit journals and a bounded per-wallet prepared/applied marker; balance, transaction and applied marker move atomically on standalone Mongo. Retries, concurrent workers, lost completion writes and rolled-off history preserve one credit. All 940 API tests across 92 files (including 12 new real-Mongo cases), API typecheck/lint and diff checks pass. This foundation is not yet connected to payment finalization. Next: atomic intent on new completions, recovery of journals AND uncleared wallet slots, export/retention coverage and explicit historical reconciliation. Existing terminal payment credit failures are not yet repaired. Overall goal remains IN PROGRESS.

Payment credit integration checkpoint (13 September): new rent/deposit confirmations atomically capture immutable credit intents and use the durable wallet journal. Five-minute recovery handles unapplied intents and uncleared wallet slots; legacy completed payments without intents are excluded. Account exports include only the beneficiary's credit journals and use no-store. All 946 API tests across 94 files, live simulated-payment confirmation/receipt checks, API typecheck/lint and diff checks pass. Historical reconciliation, operational alerting, statutory retention/disposal, subscription activation and other financial flows remain open. Overall goal remains IN PROGRESS.

Subscription purchase-terms checkpoint (13 September): new paid web subscriptions now capture immutable price/currency, package/version/name, billing period, benefits and complete entitlement values before collection. Both recorded and provider amounts use those saved terms. Retry lookup precedes catalogue changes and validates purpose/package/method, including duplicate-key races. All 954 API tests across 95 files, API typecheck/lint and diff checks pass. Next: durable activation using saved terms and dates, ordering against newer subscriptions, and snapshot-backed entitlement/UI reads. Current legacy activation still reads the live package; that gap remains open. Overall goal remains IN PROGRESS.

Paid subscription activation checkpoint (13 September): saved terms now drive new paid activation, entitlements and subscription summaries. Coverage dates are prepared immutably from confirmed payment time with month-end clamping; recovery cannot restart or extend them. Conditional user updates fence older/equal-time completions, and refunded payments lose snapshot access on read. Five-minute bounded recovery is wired. All 963 API tests across 96 files, a live simulated checkout/activation/summary check, API typecheck/lint and diff checks pass. Legacy snapshot-less purchases, free/admin lifecycle cleanup, store/provider operational evidence, retention and wider compliance gates remain open. Overall goal remains IN PROGRESS.

Subscription lifecycle cleanup checkpoint (13 September): expiry now uses saved paid terms even when the catalogue package is absent, fences the observed purchase identity, and clears paid metadata on downgrade. Free/admin assignments use conditional atomic writes and clamped anniversaries, returning 409 after a concurrent renewal. All 967 API tests across 97 files, 13 focused expiry/assignment checks, a live isolated free-plan switch, API typecheck/lint and diff checks pass. Legacy financial reconciliation, catalogue/free-plan policy consistency, external store/provider evidence and broader compliance requirements remain open. Overall goal remains IN PROGRESS.

Free entitlement fallback checkpoint (13 September): expired/refunded saved purchases and expired/missing/invalid-date legacy subscriptions now resolve the configured active free plan and its versioned grants, matching no-subscription fallback. Fresh default features prevent paid grants carrying over. All 972 API tests across 97 files, API typecheck/lint and diff checks pass. Separate property-renewal restrictions and subscription-summary presentation still need reconciliation with fallback behavior; broader legal/store/product gates remain open. Overall goal remains IN PROGRESS.

Subscription access parity checkpoint (13 September): property creation now follows the effective quota after paid expiry instead of a blanket renewal block. Subscription summaries use the same free-plan resolver and versioned grants, display effective free access, and separately identify an inactive previous subscription. OpenAPI documents the response. All 977 API tests across 98 files, focused summary rechecks, API typecheck/lint and diff checks pass. Full browser/native expiry journeys, concurrent quota reservations, legacy/operational reconciliation and broader Ghana/store gates remain open. Overall goal remains IN PROGRESS.

- [ ] C01 Rental agreements, statutory content and receipts — IN PROGRESS
- [ ] C02–C04 Privacy, erasure, consent, AI and user safety
- [ ] C05–C06 Store payments and native submission readiness
- [ ] C07–C08 Ghana regulated services, taxation and commerce
- [ ] C09 Reconcile and close remaining features and defects
- [ ] C10 Full quality/runtime verification and external release evidence

Message-safety checkpoint: incoming-message report controls added on web/native, private report authorization and moderator removal verified. 597 API tests and five focused browser tests pass. Next: admin report queue, account-level enforcement and filtering (see C04).

Admin moderation checkpoint: report queue and assigned-moderator resolution implemented; an additional real-browser test passes for claim, removal, persisted decision and access controls. Next: concurrent resolution/reassignment, account-level enforcement and filtering.

Decision-recovery checkpoint: claim release and durable decision reservations implemented; concurrent conflicting decisions and interrupted-removal retry verified against the local API/database. Remaining C04 work includes departed-moderator recovery, account enforcement and filtering.

Abandoned-claim checkpoint: super-admin takeover preserves pending decisions and revokes previous ownership; expanded browser/API regression passes. Next: account-level reports/enforcement and filtering.

Account-enforcement checkpoint: user reports, moderator suspension/restoration, restricted-session enforcement and web/native notices implemented. Privacy/security access remains available. Six focused browser tests pass, including expanded live-socket suspension checks; 611 API tests pass. Preventive filtering, appeal operations, obligation access and broader release gates remain open.

Existing-obligation checkpoint: suspended users retain owned agreements/PDFs, payment history and active-agreement rent payments, with global/delegated role access suppressed. Web/native notices link to these flows. Broader contractual obligations, preventive filtering and operational appeals remain open; see C04 evidence.

Native-payment checkpoint: C05 is IN PROGRESS. Corrected unavailable payment methods, discarded bank instructions, native subscription benefit/period mismatches and subscription API rail gating. 16 focused API tests and three Expo-web contract-flow checks pass. Native store billing remains a confirmed release gap; the audit records the purchase/verification/restoration work still required.

Store-billing foundation checkpoint: added immutable store-product mappings, package-editor administration, platform catalogue and concurrent-safe purchaser identifiers with privacy export coverage. Local browser/API/database regression, all 626 API tests and API/web quality checks pass. Next: verified store transactions and entitlement/restoration lifecycle; C05 remains open.

Google verification checkpoint: authenticated Publisher API adapter and account/state/test-environment checks implemented; 25 focused tests pass with mocked transport; all 651 API tests and API quality checks pass. It does not yet grant or acknowledge purchases. Durable entitlements, replacements/revocations, Apple verification, native billing and store sandbox evidence remain required.

Expiry-consumer checkpoint: fixed stale expiry updates overwriting concurrent renewals, required a free fallback, pinned its version and isolated retry failures. Nine focused tests, all 660 API tests and an isolated real-Mongo check pass. This prerequisite is complete; store purchase/entitlement persistence remains the next C05 work.

Store-journal checkpoint: verified Google observations now persist with immutable account ownership, encrypted tokens and revision conflicts requiring fresh verification. Thirteen focused tests, a real-Mongo concurrency test and all 674 API tests pass; API typecheck and lint pass. Entitlements remain pending; product/version resolution, activation, acknowledgement and reconciliation are still required before native purchase wiring.

Store-terms checkpoint: mappings now freeze complete entitlement/version/billing metadata and the catalogue reads those captured terms. Existing snapshot-less mappings require review. Browser/API mutation regression, 679 API tests and API/web quality checks pass; final fallback tightening passed focused regression. Journal activation remains pending.

Grant-preparation checkpoint: verified Google product/base-plan items now resolve to captured terms with account/application/environment and revision guards. New observations clear stale prepared grants. All 688 API tests, including nine focused preparation tests and the expanded Mongo integration, pass; API typecheck/lint pass. Access activation and acknowledgement remain separate pending work.

Store-access checkpoint: prepared Google purchases now activate through the entitlement engine and subscription summary using captured terms; replacement markers prevent older purchases regaining access after replacement revocation. Property creation honors effective store access while preserving expired-legacy restrictions. All 688 API tests pass with isolated Mongo integration, including quota enforcement, suspended-account denial and stale activation rejection; API typecheck/lint and diff checks pass. Google acknowledgement/recovery/reconciliation, native purchase/restore, Apple verification and external evidence remain open.

Google-completion checkpoint: verified purchases now follow persistence, preparation, activation and server acknowledgement in order. A retry re-verifies provider acknowledgement; stale local writes fail on revision conflict. Ten additional tests cover transport, interrupted stages, lost responses, non-active purchases and races. All 698 API tests, API typecheck/lint and diff checks pass. Automatic recovery/reconciliation, native checkout/restore, Apple and sandbox evidence remain open.

Google-recovery checkpoint: the scheduler now retries interrupted and unacknowledged purchases and pending payments using bounded batches, atomic expiring row leases, fenced release and capped backoff. Unit coverage and a real-Mongo competing-worker/expired-lease regression pass; all 704 API tests, API typecheck/lint and diff checks pass. Full renewal/refund/revocation reconciliation, account lifecycle handling, operational alerts, native/Apple and external release evidence remain open.

Google-lifecycle checkpoint: acknowledged subscriptions now receive scheduled provider re-verification for renewals, grace, cancellation, holds and pauses; terminal completed states stop polling. An isolated Mongo integration verifies renewal expiry, hold/pause removal and recovery, grace/cancellation access and expiration without duplicate acknowledgement. All 705 API tests, API typecheck/lint and diff checks pass. RTDN, refund/voided purchases, account lifecycle handling, native/Apple and external evidence remain open.

Google-RTDN checkpoint: added authenticated Pub/Sub subscription notifications with exact audience/service-account/subscription/application checks, fresh provider verification, completed-delivery deduplication and retry responses for unknown ownership or failed processing. Twelve HTTP/transport-boundary tests pass; all 717 API tests, API typecheck/lint and diff checks pass. Live Pub/Sub setup, refund/voided/review handling, account lifecycle, native/Apple and external evidence remain open.

Google-refund checkpoint: authenticated full subscription refunds persist order-specific evidence before refresh, and preparation/activation/access reads exclude matching voided orders. Later paid renewals remain eligible. Expanded HTTP and actual Mongo lifecycle checks prove failure recovery, immediate exclusion and delayed-refund isolation. All 718 API tests, API typecheck/lint and diff checks pass. Missed-refund reconciliation, pending chargeback review, account lifecycle, native/Apple and external evidence remain open.

Google-native API checkpoint: authenticated purchase/restore completion now accepts only an SDK token, uses signed-in ownership, enforces roles/account state and write limits, and exposes verified purchase/access/acknowledgement states with sanitized retry errors. OpenAPI documents the contract. Thirteen HTTP tests cover auth, strict input, pending states and failure handling; all 731 API tests, API typecheck/lint and final OpenAPI checks pass. Native SDK/UI, Apple, missed refunds/reviews, account lifecycle and broader Ghana/external release work remain open.

Android-native checkpoint: expo-iap now connects through a signed-in-session listener, restores on foreground, verifies through the server and displays exact Google base-plan pricing phases. Android offers purchase/restore/manage controls; paid native plans no longer route to Mobile Money. iOS checkout remains unavailable pending Apple implementation. Mobile quality checks, Android/web JS exports and all six mobile Playwright checks pass; API typecheck passes. Native build/sandbox evidence, replacements, Apple, dependency triage and remaining Ghana/release work stay open.

Mobile-dependency checkpoint: applied SDK 55 patch alignment and compatible security updates; unified Metro on 0.83.8 to remove the older vulnerable image-parser path. Audit package findings reduced from 38 to 21 (2 high, 19 moderate). Expo compatibility, mobile typecheck/lint, Android/web exports, six mobile regression checks and diff checks pass. Markdown/navigation/tooling advisories remain open, alongside native sandbox, Apple and broader compliance requirements.

Mobile-Markdown checkpoint: scoped the renderer to markdown-it 15.0.2/linkify-it 6.1.0 and verified actual article rendering, billing and pricing regressions. Audit now reports 18 moderate findings and no high/critical findings. Mobile typecheck/lint, Android/web exports, seven mobile checks and diff checks pass. The compatibility override, native-device validation, remaining dependency findings and broader compliance gates remain tracked in the audit.

Xcode-tooling checkpoint: scoped UUID to 11.1.1, verified Xcode ID generation and completed isolated iOS prebuild with the current Expo plugins. Mobile typecheck/lint and diff checks pass. Audit is down to eight moderate findings in the navigation URI-decoding chain; its ESM/CommonJS compatibility gap remains open. No CocoaPods install, native compilation, signing or store submission occurred; Apple and broader compliance requirements remain unfinished.

Navigation-dependency checkpoint: a thin named-export bridge now supplies upstream query-string 9.5.1/decode-uri-component 0.5.0 to navigation. Runtime and clean-install checks verify actual patched dependencies are present; mobile npm audit reports zero findings. Mobile quality/Expo compatibility, Android/web exports, nine mobile checks and diff checks pass. The bridge remains a maintained compatibility dependency; native/Apple/Ghana and external release requirements remain open.

Apple-verification checkpoint: official server API/JWS verification adapter now enforces server-owned roots, app/environment/account binding and transaction chronology, preserving refund/upgrade facts without prematurely granting access. All 754 API tests (23 new Apple cases), API typecheck/lint and diff checks pass. Apple current-status/persistence/native/recovery and real sandbox evidence remain open; backend dependency audit findings are recorded for triage.

## Role Capabilities — Full Completion (2026-07-29, takeover lane)

- [x] Reconciled Kimi's in-flight P2 work without discarding unrelated shared-worktree changes.
- [x] Tenant: mobile passport/share flow, neighborhood-review insights, rental-history export.
- [x] Landlord: renewal offers, Ghana Card verification/badge, subscription-aware bulk property import.
- [x] Agent/property manager: public agency profile, scoped delegation enforcement, performance analytics.
- [x] Service provider: portfolio media, recurring jobs, wallet payout requests, verification-tier ranking.
- [x] Local business: orders, campaigns/new-mover targeting, featured subscriptions, stock and image catalogs.
- [x] Financier: decisioning context, offer-targeting analytics, scoped BoG contract export.
- [x] Employer: bulk employee import, housing-benefit workflows, processed-payroll compliance export.
- [x] Government/admin: housing-demand dashboards, consent-gated tax aggregation, fraud watch, anonymized national export.
- [x] Developer: dedicated role/registration, market and anonymized demographic analytics, off-plan workflows and public listings.
- [x] Cross-cutting: web/mobile navigation, role typing, authorization, scoped workflow ledger, financial reversal safety, CSV auth, public routes, i18n, and focused capability-logic tests.
- [x] Mobile redesign parity: retained the 59-screen neumorphic redesign, upgraded the tenant-passport capability surface, replaced raw role-route slugs with polished navigation titles, and aligned the responsive auth experience with web through Outfit typography, RentOS watermarks, raised/inset neumorphic surfaces, and reduced-motion-aware interaction animation.
- [x] Auth action hierarchy: preserved a compact secondary Back action and a dominant Continue/Create action across web and mobile registration breakpoints.
- [x] Verification: shared-type sync; server/client/mobile typechecks and lint; 61/61 server tests; client/server production build; Expo dependency compatibility; fresh web and Android mobile exports; `git diff --check`.
- [x] Release E2E: 30/30 Playwright tests passed in one uninterrupted run, including role-capability authorization/workflows and post-splash mobile-auth visual gates at 390×844 and 1280×900 with explicit Outfit and zero horizontal overflow.
- [x] Live runtime: configured MongoDB connected; health and public off-plan endpoints returned 200; protected workflows returned 401 without a session; developer market analytics returned 200 for a developer session and 403 for a tenant.

**Coordination note:** This lane preserved the existing dirty worktree and Kimi's committed/uncommitted capability work, then completed and audited the shared server, web, mobile, type, and ledger surfaces in place.

**Native runtime note:** Android and iOS bundles were verified through production exports. Local device capture was blocked below the app layer by a hanging Android emulator and an unavailable Xcode 26.5 simulator runtime; the responsive Expo-web auth runtime was therefore used for the two rendered viewport gates.

## Role Capabilities — P1 Complete (2026-07-28, kimi lane)

- [x] P1.1 Local business depth: inquiries pipeline, verified-customer reviews, analytics (server+web+mobile).
- [x] P1.2 Service provider: /workers/me + /workers/me/earnings, availability editor, quote accept/decline flow (server+web+mobile).
- [x] P1.3 Agent: leads pipeline, viewing scheduler, commission tracking (server+web+mobile; property-page "I'm interested" + "Book viewing" CTAs).
- [x] P1.4 Financier: portfolio analytics + collections queue (web pre-existing; mobile added).
- [x] P1.5 Landlord: expense tracking with summaries, vacancy dashboard (server+web+mobile).
- [x] P1.6 Employer: per-run payroll reports, per-employee deduction history, CSV export (server+web+mobile).
- [x] P1.7 Tenant: move-in checklist driven by agreement city, persisted per agreement (web+mobile).
- [x] Central wiring: web routes + Portfolio sidebar group + i18n (4 locales); mobile profile-menu links.
- [x] Verified: tsc+eslint clean in server/client/mobile; 58/58 server tests; live curl + Playwright smoke on all new surfaces.

- [x] Add renter-to-business inquiries for general and listing-specific quote requests.
- [x] Add a business-owned inquiry pipeline with new, contacted, won, and lost states.
- [x] Notify business owners when a new inquiry arrives without blocking inquiry creation.
- [x] Restrict ratings and reviews to verified customers with a won inquiry; keep one updatable review per customer.
- [x] Surface aggregate ratings in the local-services directory and review details in the business view.
- [x] Track profile/listing views and expose inquiry totals, open leads, wins, conversion, and 30-day trend data.
- [x] Replace the brochure-only business dashboard with analytics and an actionable sales pipeline.
- [x] Add focused analytics unit coverage and verify client/server typecheck, lint, tests, and production builds.

**Coordination note:** Implemented around the existing mobile neumorphic-polish lane; unrelated mobile changes were preserved.

**Coordination note (kimi session):** Adopted and live-verified the above (inquiry→won→review pipeline, analytics). Continuing with P1.1 mobile UI + P1.2–P1.7 in this lane. Shared registry files (client App.tsx/Sidebar/useApi, server index.ts, mobile profile.tsx) are edited CENTRALLY by this lane to avoid concurrent-edit conflicts.

## UI Delivery — Theme Depth & Landing Redesign (2026-07-26)

- [x] Reworked the shared light/dark backgrounds with cleaner layered gradients and removed the heavy checkerboard feel in dark mode.
- [x] Added theme-aware neumorphic elevation to shared cards, buttons, icon wells, dashboard metrics, and admin primitives.
- [x] Expanded decorative RentOS/logo/icon watermarks across the landing page and authenticated dashboard shell.
- [x] Added animated landing-page headline treatment while preserving reduced-motion support.
- [x] Rebuilt the landing composition with an editorial split hero, layered rental-journey visualization, asymmetric capability bento, and role-based workspace narrative.
- [x] Replaced repetitive equal-card grids with varied section rhythms and purpose-specific watermark scenes.
- [x] Verified the marketing landing page at desktop and mobile widths with no horizontal overflow.
- [x] Verified compiled light and dark card/background/shadow tokens; client lint and production build pass.

### Authentication & CI follow-up

- [x] Persist safe user context so returning sessions render immediately while token validation continues in the background.
- [x] Replace the blank auth-hydration return with a branded, explicit session-check state and shorten the network timeout.
- [x] Show the full splash only once per browser session instead of replaying it on every route load.
- [x] Redesign login and registration with responsive neumorphic form cards, route-specific story panels, and layered RentOS watermarks.
- [x] Repair clean-runner type generation for client, server, and E2E workflows by creating destination folders and syncing shared types before typecheck.
- [x] Verify client lint/typecheck/build and server lint/typecheck/tests/build locally.

---

## Phase 1 — Critical Fixes (This Sprint)

### 1.1 Auth & Security
- [x] ~~JWT secret fallback removed~~
- [x] ~~Reset token leak fixed~~
- [ ] `POST /auth/change-password` — add `authenticate` middleware (currently manually parses JWT, bypassing standard chain)
- [ ] `GET /properties/:id` — add `optionalAuth` + filter draft/pending properties for unauthenticated users
- [ ] `GET /payments/:id` — add authorization check (only tenant, landlord, or admin can view)
- [ ] `propertyController.list` — remove manual JWT re-parse, use `req.user` from `optionalAuth`

### 1.2 Performance & Stability
- [ ] `analyticsController.platform` — replace `Model.find().lean()` with MongoDB aggregation pipelines to prevent OOM
- [ ] `analyticsController.me` — add date-range filtering (default 90 days) to limit dataset size
- [ ] Scheduler N+1 queries — batch `Property.findById` lookups using `$in` queries inside loops
- [ ] Add MongoDB indexes on high-cardinality query fields (see Index List below)

### 1.3 Code Quality
- [ ] Replace hardcoded Anthropic model name with env-configurable `ANTHROPIC_MODEL`
- [ ] Replace `console.log/warn/error` in scheduler, payments, achievements with Winston `logger`
- [ ] Make loan interest rate and min credit score env-configurable
- [ ] Add `apiVersion` response header middleware

#### Index List
```js
// Properties
Property.schema.index({ status: 1, listingStatus: 1 })
Property.schema.index({ type: 1 })
Property.schema.index({ createdAt: -1 })
Property.schema.index({ 'address.city': 1, 'address.region': 1 })
Property.schema.index({ rentAmount: 1 })

// Agreements
Agreement.schema.index({ status: 1, endDate: 1 })
Agreement.schema.index({ landlordId: 1 })
Agreement.schema.index({ tenantId: 1 })

// Payments
Payment.schema.index({ status: 1, createdAt: -1 })
Payment.schema.index({ tenantId: 1, status: 1 })
Payment.schema.index({ landlordId: 1, status: 1 })

// Maintenance
MaintenanceRequest.schema.index({ status: 1, createdAt: -1 })
MaintenanceRequest.schema.index({ propertyId: 1 })
```

---

## Phase 2 — AI Features Roadmap (v0.3.0)

### 2.1 RAG Legal Assistant
**Goal:** Move from static prompt to retrieval-augmented generation.

- **Vector Store:** Pinecone or Weaviate (starter tier is free)
- **Documents to ingest:**
  - Rent Act, 1963 (Act 220)
  - Ghana Constitution (property rights chapter)
  - CHRAJ complaint procedures
  - Rent Control Department guidelines
  - Sample tenancy agreements and case law
- **Pipeline:**
  1. Chunk documents into ~500-token segments
  2. Generate embeddings via `text-embedding-3-small` (OpenAI) or Cohere
  3. Store in vector DB with metadata (law, section, year)
  4. On chat: embed user query → retrieve top-5 chunks → inject into Claude prompt
- **Fallback:** If vector DB unavailable, fall back to static prompt
- **Benefit:** Reduces hallucinations, cites specific laws and sections

### 2.2 Document AI / OCR
**Goal:** Auto-extract data from uploaded tenant documents.

- **Provider:** Google Document AI or AWS Textract (or open-source EasyOCR)
- **Use cases:**
  - Parse Ghana Card / passport → auto-fill tenant profile
  - Parse pay slips → auto-verify income
  - Parse existing tenancy agreements → auto-fill agreement fields
- **Storage:** Extracted text saved to `DocumentModel.extractedText` field
- **Privacy:** PII redaction before storage; processing happens in-memory only

### 2.3 AI Credit Scoring v2
**Goal:** Enhance rule-based scoring with behavioral ML.

- **Current:** 5-factor deterministic (0–100)
- **v2 additions:**
  - Payment velocity (days early/late, not just binary)
  - Application acceptance rate
  - Message response time
  - Dispute language sentiment (NLP on dispute descriptions)
  - Property view-to-apply conversion rate
- **Model:** Simple logistic regression or XGBoost on tabular data
- **Deployment:** Train monthly on aggregate data; model served via lightweight ONNX runtime
- **Explainability:** Every score change comes with a human-readable reason

### 2.4 Smart Property Recommendations
**Goal:** Replace rule-based matching with a learned recommender.

- **Approach:** Two-tower neural network (tenant tower + property tower)
- **Features:**
  - Tenant: budget, preferred cities, amenities, credit score, family size, pets
  - Property: rent, location, amenities, landlord responsiveness, review score
- **Training data:** Implicit (views, favorites, applications) + explicit (leases signed)
- **Cold start:** Fall back to rule-based for new users
- **Output:** Ranked list with "Why recommended" explanation

### 2.5 NLP-Powered Search
**Goal:** Semantic search across properties, blog, and legal docs.

- **Embedding model:** `text-embedding-3-small` or `BAAI/bge-small-en`
- **Hybrid search:** Combine vector similarity with MongoDB filters (price, city, type)
- **Query understanding:**
  - "2-bedroom in East Legon under GHS 3000" → structured filters
  - "quiet area with good security" → semantic vector search
- **Auto-suggest:** LLM-generated search suggestions based on trending queries

---

## Phase 3 — Platform Enhancements (v0.4.0)

### 3.1 Refresh Tokens & Auth Improvements
- Add `/auth/refresh` endpoint (HTTP-only cookie with refresh token)
- Add client 401 interceptor for silent refresh
- Reduce access token TTL to 15 minutes
- Add "Log out all devices" functionality

### 3.2 Maps & Geospatial
- Integrate Mapbox or Google Maps
- Property detail page: interactive map with pin
- Property search: "Near me" radius filter using GPS coordinates
- Neighborhood overlays: transit, schools, safety scores
- Geofencing: notify landlords when tenant moves in/out of property radius

### 3.3 General Webhooks
- Webhook subscription model (`WebhookSubscription` schema)
- Events: `application.created`, `agreement.signed`, `payment.completed`, `lease.expiring`, `maintenance.escalated`, `dispute.filed`
- Retry logic with exponential backoff
- HMAC signature verification
- Admin dashboard for webhook management

### 3.4 GDPR / Data Privacy
- `DELETE /users/me` — soft delete with 30-day grace period
- `GET /users/me/export` — JSON export of all personal data
- Privacy policy and cookie consent banner
- Data retention policy (auto-purge audit logs after 2 years)

### 3.5 Redis Caching Layer
- Cache property search results (TTL: 5 minutes)
- Cache analytics aggregations (TTL: 1 hour)
- Cache feature flags (TTL: 60 seconds, with pub/sub invalidation)
- Session store for refresh tokens

### 3.6 API Documentation (OpenAPI)
- Auto-generate OpenAPI 3.1 spec from Zod schemas
- Serve Swagger UI at `/api/docs`
- Generate TypeScript client SDKs for web and mobile

---

## Phase 4 — Scale & Intelligence (v0.5.0)

### 4.1 Multi-Model AI Fallback
- Primary: Anthropic Claude
- Fallback 1: OpenAI GPT-4o (for legal assistant)
- Fallback 2: Local Llama 3.1 (via Ollama) for offline/text-generation tasks
- Circuit breaker pattern: if primary fails 3× in 60s, switch to fallback

### 4.2 Predictive Analytics
- **Rent pricing optimizer:** Suggest optimal rent based on location, seasonality, and demand
- **Churn prediction:** Flag tenants likely to move out 60 days in advance
- **Fraud detection:** Anomaly detection on payment patterns and application behaviors
- **Demand forecasting:** Predict property demand by region for government analytics

### 4.3 White-Label / Multi-Tenancy
- `Organization` schema with branding config (logo, colors, domain)
- Subdomain routing: `acme.rentos.gh`
- Isolated data per org (shared DB, org-scoped queries)
- Admin dashboard for org management

### 4.4 Mobile Parity
- Complete landlord dashboard on mobile
- Payment initiation and wallet management
- Document upload and e-signing
- Push notifications for all major events
- Biometric auth (already started)

### 4.5 Advanced Messaging
- AI-suggested replies for landlords ("Approve maintenance?", "Schedule viewing")
- Message summarization for long conversation threads
- Auto-translation between Twi/Ga/Ewe and English in chat
- Moderation: flag abusive language before sending

---

## Appendix A — Quick Wins (Can ship this week)

1. **Add `data-testid` to client components** → Enable all 5 E2E specs
2. **Config-driven AI model** → `ANTHROPIC_MODEL` env var
3. **MongoDB indexes** → One-liner per model, massive query speedup
4. **Analytics date filter** → Add `?startDate=&endDate=` to `/api/analytics/me`
5. **Request logging cleanup** → Replace console logs in scheduler with Winston
6. **Property getById auth** → Add `optionalAuth` + `listingStatus` filter

---

## Appendix B — Tech Stack for New Features

| Feature | Suggested Tech | Cost |
|---|---|---|
| RAG Vector DB | Pinecone (free tier) or Weaviate | $0–$25/mo |
| Embeddings | OpenAI `text-embedding-3-small` | $0.02/1M tokens |
| OCR | AWS Textract or Google Document AI | $0.0015/page |
| Maps | Mapbox (free tier: 50k loads/mo) | $0–$50/mo |
| Redis | Upstash Redis (free tier) or Redis Cloud | $0–$10/mo |
| ML Training | Python + scikit-learn/XGBoost, run monthly | $0 (batch) |
| Search Engine | Meilisearch (self-hosted) or Algolia | $0–$29/mo |
| Webhook Infra | BullMQ on Redis | $0 (uses Redis above) |

---

## Appendix C — Definition of Done

For each phase:
- [ ] All new code has TypeScript strict mode compliance
- [ ] Unit tests cover business logic (Vitest)
- [ ] E2E tests cover critical user paths (Playwright)
- [ ] API docs updated (if endpoint changes)
- [ ] Env vars documented in `.env.example`
- [ ] Feature flags added for gradual rollout (if user-facing)
- [ ] Performance benchmarked before/after (if applicable)
