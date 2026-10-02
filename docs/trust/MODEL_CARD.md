# Model card: TRUST-2 contact-intent model

| | |
| --- | --- |
| Version | `trust2-intent-20261002-694ae1c39c9a` |
| Trained | 2 October 2026 (seed 20261002, dataset hash `694ae1811edbf908`) |
| Type | Multinomial logistic regression over hashed features, int8-quantised |
| Size | 32,768 feature buckets × 6 classes; about 258 KB as a source module |
| Calibration | Temperature 0.38, fitted on the validation split |
| Feature / normalizer contract | `trust2-feat-2` / `trust2-norm-1` (the model refuses to run on any other) |
| Code | `apps/api/src/services/trust/model.ts`, artifact `model/contactIntentModel.ts`, trainer `src/scripts/trainContactModel.ts` |

## What it does

It reads one message (after normalisation and detection) and gives probabilities for six labels:

| Label | Meaning |
| --- | --- |
| `NO_CONTACT` | Ordinary conversation about the property, price, viewing or tenancy. |
| `SHARE_CONTACT` | Shares a way to be reached outside RentOS. |
| `REQUEST_CONTACT` | Asks for the other person's number, email, handle or app. |
| `MOVE_OFF_PLATFORM` | Moves the conversation, viewing or payment elsewhere ("let's talk on the other app", "pay me directly"). |
| `DISCUSS_CONTACT_POLICY` | Talks about the rule itself ("why can't I share my number?"). |
| `BENIGN_CONTACT_REFERENCE` | Mentions contact words harmlessly ("the agent called yesterday", "my number of bedrooms"). |

It never decides alone. The policy engine (`policy.ts`) combines it with deterministic detectors and conversation context (ARCHITECTURE.md). On its own, the model can only block when its intent reading is strong and supported, and then only for the canary share of authors (`TRUST2_MODEL_ENFORCE_PERCENT`, default 0: recorded in shadow).

## Intended use

Screening messages and published text on RentOS (chat, enquiries, listings, websites, news, reviews, profiles, viewing notes) to keep deals on the platform, where tenants are protected. It is not a general toxicity, spam or fraud classifier, and it is not used to rank or profile people.

## Training data

45,179 synthetic and adversarial examples (36,149 used for training at evaluation time), generated reproducibly from the seed. There is no real user text. See DATASET_CARD.md. Reviewer-labelled examples can be added with `--labels` (masked excerpts only).

## Evaluation

Measured on **template families held out of training**, so the scores reflect unseen phrasings, not memorised templates.

### Test split

| Label | Precision | Recall | F1 | Support |
| --- | --- | --- | --- | --- |
| NO_CONTACT | 0.968 | 0.698 | 0.811 | 1,840 |
| SHARE_CONTACT | 0.859 | 1.000 | 0.924 | 1,357 |
| REQUEST_CONTACT | 1.000 | 1.000 | 1.000 | 573 |
| MOVE_OFF_PLATFORM | 0.931 | 0.910 | 0.920 | 597 |
| DISCUSS_CONTACT_POLICY | 0.749 | 0.712 | 0.730 | 385 |
| BENIGN_CONTACT_REFERENCE | 0.564 | 0.947 | 0.707 | 474 |

Accuracy 0.857; expected calibration error 0.063.

### Through the policy engine (what users experience)

| | Block precision | Block recall | False-positive rate |
| --- | --- | --- | --- |
| Test, as deployed (model-only blocks in shadow) | 1.000 | 0.979 | 0.000 |
| Test, with model-only blocks enforced (full canary) | 0.999 | 1.000 | 0.0007 |
| Validation, as deployed | 1.000 | 0.992 | 0.000 |

The label-level confusions (NO_CONTACT vs BENIGN_CONTACT_REFERENCE vs DISCUSS_CONTACT_POLICY) are between labels that the policy treats the same way (allow), which is why policy precision stays at 1.0.

### Release suite (CI)

`trust-release.test.ts` must pass on every change: the golden corpus (144 benign, 48 leaks, 28 intent; all correct), ≥ 99.5% of generated contact details stopped, ≥ 95% of off-platform requests without an identifier stopped (≥ 99% with model blocks on), < 0.5% of benign messages stopped, camouflage FN ≤ 1% / FP ≤ 0.5%, ≥ 99% of split contact details stopped across messages with ≤ 1% benign sequences stopped, and latency (mean well under 1 ms, p99 < 20 ms).

## Release gates

`trainContactModel.ts` will not write a model unless, on held-out families:

- enforced block recall ≥ 0.97
- enforced false-positive rate ≤ 0.005
- calibration error ≤ 0.15

## Limitations

- **Synthetic data only.** Real conversations will contain phrasings the generator does not. Model-only blocks stay in shadow until reviewed real-message labels confirm precision (RUNBOOK.md, "Canary").
- **English and Ghanaian English first.** Twi number words are covered in phone obfuscation; free-text intent in Twi, Ga, Ewe or Hausa is not modelled yet.
- **Text only.** Images, voice notes and files are not screened.
- **Benign-reference recall over precision.** The model over-predicts BENIGN_CONTACT_REFERENCE (precision 0.56), which can veto a weak model-only block. That trades a little recall for fewer false positives, by design.
- A determined user can still describe contact details in ways no system recognises. Strikes, reports and the Terms (suspension for taking deals off RentOS) are the backstop.

## Ethical considerations

Blocking legitimate messages harms users more than a missed leak, so the deterministic layers are tuned for very high precision, the model is shadowed by default, every block is explained to the author, and every block can be appealed to a person. An overturned decision lets the identical text through and removes the strike. No user text is used for training without masking, and no decision affects anyone without being recorded with its versions for audit.

## Retraining

See RUNBOOK.md ("Retraining"). Always: same seed for comparison runs, gates pass, release suite passes, versions bump automatically.
