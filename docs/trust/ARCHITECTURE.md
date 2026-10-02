# TRUST-2 contact protection: architecture

TRUST-2 stops contact details (phone numbers, emails, social handles, messaging links) and requests to move a deal off RentOS from reaching another person. It screens every outbound message and every piece of text that other people can read, before it is delivered or saved. It is a trust-and-safety system with independently versioned layers, not a regex filter.

Code: `apps/api/src/services/trust/`. Spec: TRUST-2 Contact Leakage Detection ML Development Specification v1.1.

## Data flow

```
text (+ the author's recent messages, chat only)
  │
  ├─ normalizer.ts      one input → many "views" (lowercase, spaced, compact,
  │                     number words → digits, symbol/leet → digits, wildcards,
  │                     verbal emails, homoglyphs, mixed scripts)
  ├─ detectors.ts       deterministic rules over every view → RuleHit[]
  │                     (phone, email, domain/link, handle, app names,
  │                      request / move-off / pay-outside phrases, lexicon)
  ├─ features.ts        hashed features (words, bigrams, skip-pairs,
  │                     char 3–4-grams, detector features), L2-normalised
  ├─ model.ts           int8 multinomial logistic regression → intent
  │                     probabilities over 6 labels (temperature-calibrated)
  ├─ context.ts         cross-message reconstruction (fragments within
  │                     20 messages / 15 min, reset after a 10 min gap)
  ├─ policy.ts          the only decision-maker: ALLOW or BLOCK, basis,
  │                     reason codes, risk score, user-facing reason
  └─ screen.ts          mode (enforce/shadow/off), canary, overrides,
                        audit record, strikes, author message
```

`evaluate()` (pure and synchronous) runs the pipeline; `screenOutbound()` adds mode, persistence and side effects.

## Policy (policy.ts, `trust2-policy-1`)

Rules, in precedence order (the first that applies decides):

1. **Structure**: a reachable identifier is recovered (exact, or after undoing a disguise with confidence ≥ 0.85). Always enforced.
2. **Context**: the author's recent messages together spell an identifier (context score ≥ 0.85). Always enforced.
3. **Phrase**: a high-precision contact or move-off phrase (confidence ≥ 0.8), unless the text is talk about the policy itself or the model's benign probability is ≥ 0.6. Always enforced.
4. **Model**: contact intent ≥ 0.75 with strong support (≥ 0.6), or ≥ 0.95 with only lexicon support, and benign < 0.35. Enforced only for the canary (`TRUST2_MODEL_ENFORCE_PERCENT`); otherwise recorded in shadow.

Reason codes (internal, never shown to users): `EXACT_PHONE`, `OBFUSCATED_PHONE`, `EXACT_EMAIL`, `OBFUSCATED_EMAIL`, `SOCIAL_HANDLE`, `MESSAGING_LINK`, `EXTERNAL_LINK`, `MESSAGING_APP`, `CONTACT_REQUEST`, `SHARE_INTENT`, `MOVE_OFF_PLATFORM`, `PAY_OUTSIDE`, `CROSS_MESSAGE_ASSEMBLY`, `SEMANTIC_CAMOUFLAGE`. Users only ever see one of two coarse reasons: `OFF_PLATFORM_CONTACT` or `CONTACT_ACROSS_MESSAGES`.

## Where it runs

| Surface | Channel | Call site |
| --- | --- | --- |
| Chat messages, enquiries (property interest, website contact form) | `chat`, `enquiry` | `services/conversations.ts` (`sendMessage`, `openEnquiryConversation`) |
| Listing title, description, rules | `listing` | `controllers/propertyController.ts` (`screenListing`) |
| Website text (name, tagline, about, hero, services, areas) | `website` | `routes/storefronts.ts` |
| News posts (title, excerpt, body, tags, SEO fields; ordinary links allowed) | `blog` | `routes/authoring.ts` (`postScreen`) |
| Reviews | `review` | `routes/reviews.ts` |
| Agency profile text | `profile` | `routes/agency.ts` |
| Viewing notes | `viewing` | `routes/agent.ts` |

Every call site refuses to save or deliver when `allowed` is false and answers `422` with `blockedBody(result)` (see API.md). Nothing is redacted: the text is not sent and not stored.

## Contracts

`screenOutbound(input: ScreenInput): Promise<ScreenResult>`

- `ScreenInput`: `text`, `authorId`, `channel`, optional `conversationId`, `history` (the author's own recent messages in the conversation, chat only), `targetType`, `targetId`, `now`, `allowExternalLinks`.
- `ScreenResult`: `allowed` (the only field a caller acts on), `decision`, `enforced`, `mode`, `userReason`, `message` (what to show the author), `decisionId`, `reasonCodes`, `riskScore`, `latencyMs`, `degraded`.

`screenFields()` screens several fields of one object as a single text.

## Model serving

The model is a generated TypeScript module (`model/contactIntentModel.ts`) with base64 int8 weights, per-class scales, biases, a temperature and its versions. It runs in-process (no network, no GPU). Weights are decoded lazily on first use. If the artifact's `featureVersion` or `normalizerVersion` does not match the running code, the model is not used (logged) and rules 1–3 still apply.

## Versions and deterministic replay

Every recorded decision stores `versions` (`model`, `normalizer`, `feature`, `policy`). Given the same text, context and versions, `evaluate()` returns the same decision: no randomness, no clock except the context window, no network. Current versions: normalizer `trust2-norm-1`, features `trust2-feat-2`, policy `trust2-policy-1`, model `trust2-intent-20261002-694ae1c39c9a`.

## Training pipeline

`src/scripts/trainContactModel.ts` (see MODEL_CARD.md and DATASET_CARD.md):

1. Generate synthetic and adversarial examples from a seed (`services/trust/training/generator.ts`), plus reviewed examples from `exportTrustLabels.ts`.
2. Split by template family, so test phrasings are never seen in training.
3. Featurize with the same code the live screen uses.
4. Train with AdaGrad, L2 regularisation, label smoothing and class weights.
5. Fit a temperature on validation; quantise to int8.
6. Evaluate through the real policy engine; refuse to write the model if a release gate fails.
7. Retrain on all data and write the artifact.

## Failure modes

| Failure | Behaviour |
| --- | --- |
| Pipeline throws | A small set of independent high-precision patterns (Ghana phones, emails, messaging links) decides; `degraded: true` is recorded. |
| Fallback also throws | The message is held back ("We couldn't check this message just now…"): fail closed. |
| Model artifact version mismatch | Model skipped; rules 1–3 continue. |
| Audit write fails | Logged; the decision still applies. |
| Overturn lookup or strike count fails | Logged; the block still applies. |
| Database unavailable | The decision is still made in memory and applied; recording it is skipped (logged). The caller's own save then fails as usual, so nothing is delivered. |

## Performance

The whole pipeline is pure CPU work. The release suite asserts a mean of well under 1 ms per message and p99 under 20 ms (`trust-release.test.ts`), and live decisions record `latencyMs` (Admin → Contact Protection shows p50/p95).

## Observability

- `TrustDecision` records: every block, and allowed messages with risk ≥ 0.6 (near misses), all masked (PRIVACY.md).
- `GET /api/trust/admin/stats`: outcomes, reasons, channels, appeals, overturn rate, latency, mode and versions.
- Admin → Contact Protection (`/admin/contact-protection`): review queue and appeals.
- Repeat attempts: 2 enforced blocks in 30 days add a suspension warning; at 3 an `off_platform_contact` content report opens for moderators (`strikes.ts`).

## Tests

- `trust-detectors.test.ts`: every normalizer transform and detector.
- `trust-release.test.ts`: the golden corpus (`fixtures/trustCorpus.ts`: 144 benign, 48 leaks, 28 intent), generated adversarial suites per transform, camouflage, cross-message cases, model and version checks, latency.
- `trust-flow.integration.test.ts`: API → policy → audit → appeal → review, end to end.
