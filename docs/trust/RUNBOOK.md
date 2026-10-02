# TRUST-2 runbook

Operating contact protection in production: configuration, rollout, monitoring, incidents, rollback and retraining. Production API: Render service `rentos-api`.

## Configuration

| Variable | Values | Default | Effect |
| --- | --- | --- | --- |
| `TRUST2_MODE` | `enforce`, `shadow`, `off` | `enforce` | `enforce` stops messages. `shadow` records what would have been stopped and lets everything through. `off` skips screening entirely (emergency only). |
| `TRUST2_MODEL_ENFORCE_PERCENT` | 0–100 | `0` | Share of authors (stable per author) whose **model-only** blocks are enforced. Blocks resting on a contact detail, a cross-message assembly or a contact phrase are always enforced in `enforce` mode. |
| `TRUST2_DIGEST_KEY` | secret | falls back to `JWT_SECRET` | Key for the text digest that lets overturned text through. Changing it invalidates existing overturns. |

Render does not apply an env change to a running instance. After changing a variable, restart or redeploy `rentos-api`. Check the active configuration in Admin → Contact Protection (the stats panel shows the mode, the canary percentage and the versions).

## Rollout (canary for model-only blocks)

Rules that rest on structure are high precision and enforced from day one. The intent model's solo blocks go through a canary:

1. **Shadow (now):** `TRUST2_MODEL_ENFORCE_PERCENT=0`. Model-only blocks are recorded with `enforced: false`.
2. **Label:** review at least 200 shadow model-only decisions in Admin → Contact Protection (filter: mode = shadow, decision = BLOCK), using LABELING_GUIDE.md.
3. **Gate:** precision of model-only blocks ≥ 0.98 on those labels (upheld ÷ reviewed), with no harmful false-positive pattern.
4. **Canary:** set 5, then 25, then 100, waiting at least a week at each step. Watch the overturn rate and appeals.
5. **Stop** at any step where the overturn rate of enforced model-only blocks rises above 5% (step back one level).

## Monitoring

Admin → Contact Protection, or `GET /api/trust/admin/stats?days=7`:

| Signal | Normal | Act when |
| --- | --- | --- |
| Overturn rate | < 2% | > 5%: see "Too strict" |
| Appeals open | cleared within 2 working days | backlog > 50 |
| Block rate (chat) | < 1% of sends | sudden jump: possible false-positive pattern or spam wave |
| `degraded` | 0 | any: the pipeline threw and the fallback decided (check API logs for `[trust] screen failed`) |
| Latency p99 | < 20 ms | > 50 ms sustained |

## Incidents

**Too strict (legitimate messages stopped):**

1. Open the review queue; find the pattern (reason code, channel, wording).
2. If model-only: set `TRUST2_MODEL_ENFORCE_PERCENT=0` and restart. This takes effect immediately for every author.
3. If a deterministic rule: switch to `TRUST2_MODE=shadow` while a fix is made (contact details then go through, so keep this short), or fix forward (step 5).
4. Overturn the affected decisions so the authors can resend; they are notified if they appealed.
5. Add the failing texts to `fixtures/trustCorpus.ts` (BENIGN), fix the detector or threshold, run the release suite, deploy.

**Too loose (contact details getting through):**

1. Collect examples from content reports (`off_platform_contact`) and moderator findings.
2. Add them to the LEAKS or INTENT corpus and to the generator if they are a new disguise.
3. Fix the normalizer or detector, or retrain (below); the release suite must pass; deploy.

**Screen failing (`degraded` > 0):** the fallback still stops plain phones, emails and messaging links; everything else is allowed until fixed. Check the logs, roll back the last deploy if it introduced the failure. If even the fallback fails, messages are held back with "We couldn't check this message just now" (fail closed). A deploy rollback is the fix.

## Rollback

| What | How |
| --- | --- |
| The model | `git revert` the commit that changed `apps/api/src/services/trust/model/contactIntentModel.ts` (or restore the previous file), redeploy. The version in new decision records confirms which model runs. |
| The policy or detectors | Revert the commit, redeploy. Policy version `trust2-policy-1` is recorded on every decision. |
| Model-only enforcement | `TRUST2_MODEL_ENFORCE_PERCENT=0`, restart. |
| All enforcement | `TRUST2_MODE=shadow`, restart. Use `off` only if screening itself breaks the service. |

Render keeps previous deploys: "Rollback" on a known-good deploy restores code and model together.

## Retraining

1. Export reviewed labels (production, read-only):
   `node dist/scripts/exportTrustLabels.js --since 2026-10-01 > reviewed.json` (a one-off Render job prints to its log; or run locally against production with `npx tsx --env-file=.env.production src/scripts/exportTrustLabels.ts`).
2. Train and check without writing:
   `npx tsx src/scripts/trainContactModel.ts --labels reviewed.json --check --report`
   Read the per-family error report; all three release gates must pass.
3. Train for real (same command without `--check`). The artifact version changes automatically (date + dataset hash + weights hash).
4. Run the trust suites: `npx vitest run src/__tests__/trust-detectors.test.ts src/__tests__/trust-release.test.ts` and the integration test with the test database.
5. Commit the new artifact with the metrics from the trainer output in the message; update MODEL_CARD.md; deploy; watch the overturn rate for a week.

If the normalizer or feature code changes, bump `NORMALIZER_VERSION` / `FEATURE_VERSION` and retrain in the same change: the old model refuses to run against new features.

## Repeat offenders

Two enforced blocks in 30 days append a warning to the author's message ("Repeated attempts to take deals off RentOS can lead to your account being suspended."). At three, an `off_platform_contact` content report opens for moderators with masked excerpts of the recent attempts. Suspension is a moderator decision under the Terms ("Keeping deals on RentOS"), never automatic.
