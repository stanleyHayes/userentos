# TRUST-2 implementation plan

Tracked plan for the TRUST-2 specification (§24): what is built, how it was verified, what is left, and the assumptions and policy decisions behind it. Update this file whenever scope, data flow, contracts or policy change. Never reduce policy scope to make a test pass.

Last updated: 2 October 2026.

## Status by phase (§25)

| Phase | Scope | Status | Evidence |
| --- | --- | --- | --- |
| 0. Policy and data | Reason taxonomy, retention, review policy, labeling guide | Done, sign-off pending | policy.ts, LABELING_GUIDE.md (sign-off table empty), PRIVACY.md |
| 1. High-precision baseline | Normalizer, phone/email/domain/handle/app detectors, API, audit | Done | trust-detectors.test.ts (37), golden corpus 220/220 |
| 2. ML intent | Intent classifier, hard negatives | Done (model-only blocks in shadow) | MODEL_CARD.md; release gates pass |
| 3. Adversarial model | Character features, augmentation, homoglyph/mixed-symbol coverage | Done as character n-grams in the same model; no separate byte model | Per-transform suites ≥ 0.98; camouflage FN ≤ 1%, FP ≤ 0.5% |
| 4. Conversation context | Cross-turn assembly | Done | Mandatory §13 cases; generated sequences ≥ 99% stopped, ≤ 1% benign |
| 5. Production learning | Shadow/canary, review tooling, drift view, retraining | Done except drift dashboard and real-label canary | `TRUST2_MODE`, `TRUST2_MODEL_ENFORCE_PERCENT`, Admin → Contact Protection, exportTrustLabels.ts, RUNBOOK.md |
| 6. Voice (optional) | Transcript screening | Not started | Not required by current product policy |

## Acceptance criteria (§26)

| Criterion | Status |
| --- | --- |
| Nothing is persisted or delivered before a decision (or the approved fallback) | Met: screening runs before every save/send; failure falls back, then fails closed |
| Obvious phones, emails, handles, URLs and explicit off-platform requests blocked | Met |
| Number words, punctuation, confusables, mixed symbols, fragments covered by tests | Met (trust-release.test.ts) |
| Indirect requests ("digits", "DM", "continue elsewhere") detected | Met for the phrase layer; model layer in shadow pending real labels |
| Blocked messages not redacted or sent; author can edit and retry | Met (web and mobile keep the text) |
| Every block logged with versions and reason codes | Met (TrustDecision) |
| FP and adversarial-recall benchmarks meet owner thresholds | Met against the thresholds in MODEL_CARD.md; owners to confirm |
| Shadow, canary, monitoring, rollback | Met (RUNBOOK.md) |
| Model card, dataset card, labeling guide, API spec, ARCHITECTURE.md, privacy notes, runbook | Met (this folder) |

## Assumptions

- Market: Ghana. Phone formats cover Ghana mobile numbers (local, +233, 00233); foreign numbers only count with an explicit international prefix, so long IDs and coordinates are not mistaken for phones.
- Languages: English and Ghanaian English; Twi number words for phone disguises.
- Ordinary website links are allowed in news posts only; messaging, social and short links are never allowed.
- "Pay outside RentOS" counts as moving the deal off the platform.
- The direct WhatsApp button on listings is a separate admin switch (`listings.direct_whatsapp`, off by default); when on, it uses the agent's own number by design.

## Open policy decisions

1. Canary gate: confirm the precision bar (proposed ≥ 0.98 on 200 reviewed shadow decisions) and the step schedule (5% → 25% → 100%).
2. Strike thresholds: confirm 2 (warning) and 3 (moderator report) within 30 days, and the suspension policy that follows.
3. Retention: 180 days for decision records; confirm with legal.
4. Local languages: whether to label and model free-text intent in Twi, Ga, Ewe and Hausa.
5. Images and voice notes: currently not screened.

## Next tasks

- [ ] Get LABELING_GUIDE.md signed off (phase 0 exit).
- [ ] Review 200 shadow model-only decisions; decide on the canary.
- [ ] Add a drift view (weekly reason-code mix and risk distribution) to Admin → Contact Protection.
- [ ] Retrain with reviewed labels once there are enough (≥ 500), following RUNBOOK.md.
- [ ] Revisit local-language coverage after the first month of real traffic.
