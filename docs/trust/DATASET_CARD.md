# Dataset card: TRUST-2 training and evaluation data

## Summary

| | |
| --- | --- |
| Name | TRUST-2 synthetic contact-intent dataset |
| Generator | `apps/api/src/services/trust/training/generator.ts` |
| Released model's dataset | 45,179 unique examples, seed 20261002, hash `694ae1811edbf908` (48,000 generated, duplicates removed) |
| Labels | 6 intent labels (MODEL_CARD.md), plus `leak` (contains a reachable identifier) and `block` (what the policy must decide) |
| Real user data | None in the shipped model. Optional reviewed examples come from masked excerpts only. |
| Languages | English and Ghanaian English (pidgin and everyday phrases), Twi number words |

## Why synthetic

The spec (§8) requires adversarial coverage that real data cannot provide on day one: every disguise of a phone number, every way of asking to move a deal off the platform, and hard negatives that look like contact details but are not (prices, dates, room counts, invoice numbers, populations). The generator is deterministic from its seed, so every model can be reproduced and every change compared like for like.

## Composition

Default label mix (relative weights per generated example):

| Kind | Weight | Label |
| --- | --- | --- |
| Ordinary conversation | 30 | NO_CONTACT |
| Shares contact (phone ×3, email, handle, link) | 26 | SHARE_CONTACT |
| Asks for contact | 10 | REQUEST_CONTACT |
| Moves off platform / pays outside | 10 | MOVE_OFF_PLATFORM |
| Discusses the policy | 5 | DISCUSS_CONTACT_POLICY |
| Harmless contact words | 7 | BENIGN_CONTACT_REFERENCE |
| Camouflage, positive (a real number hidden in "population", "invoice", "score" talk) | 6 | SHARE_CONTACT |
| Camouflage, negative (a genuine population, invoice or score) | 6 | NO_CONTACT |

Label support on the held-out test split of the released model: NO_CONTACT 1,840; SHARE_CONTACT 1,357; MOVE_OFF_PLATFORM 597; REQUEST_CONTACT 573; BENIGN_CONTACT_REFERENCE 474; DISCUSS_CONTACT_POLICY 385.

### Identifiers

- **Phones:** Ghana mobile numbers with valid network prefixes (020, 023, 024, 025, 026, 027, 028, 029, 050, 053, 054, 055, 056, 057, 059), local or +233/00233. Digits are random, so a generated number may coincide with a real one; generated data is never used to contact anyone.
- **Emails:** generated names on common providers (gmail.com, yahoo.com, outlook.com and others), written plainly or verbally ("kofi dot mensah at gmail").
- **Handles and links:** social and messaging handles (@name, "IG: name", "snap name") and links (wa.me, t.me, instagram.com and others).

### Disguises (composed 1–3 at a time)

- Digit maps: digits, English number words, mixed words and digits, homophones ("oh", "to", "for", "ate"), Twi number words (hwee, baako, mmienu…), leetspeak (O/o, l/I/|, Z, S/$, B, g), full-width digits, homoglyphs (Cyrillic О).
- Joiners: none, spaces, grouping, a separator, random separators (`- . / _ : ; • | ~ *`), emoji between digits, line breaks.
- Noise: Ghanaian openers and closers ("chale", "abeg", "massa", "boss", "pls", "🙏").

### Cross-message sequences (§13.5)

`generateSequence` builds conversations that spell a phone, email or handle across turns (single digits, groups, words, symbols, mixed), with filler turns ("ok", "network is bad") and timing, alongside negatives that send numbers which are not contact details (answers, prices, dates, counts). The release suite uses 1,500 sequences, 60% positive.

### Golden corpus

`apps/api/src/__tests__/fixtures/trustCorpus.ts`: hand-written cases reviewed by a person: 144 benign messages (prices, viewings, directions, everyday talk about calling and numbers), 48 leaks, 28 indirect requests. All must be decided correctly.

## Splits

Examples are grouped by **template family** (`family`, e.g. `share_phone:7`). Families are hashed into train, validation and test, so no phrasing in the test set was seen in training (§8.3). After evaluation the released model is retrained on every family.

## Reviewed examples (optional)

`src/scripts/exportTrustLabels.ts` exports decisions a reviewer closed with an intent label (LABELING_GUIDE.md) as extra examples for `trainContactModel.ts --labels`. They carry only the masked excerpt (digits as `#`, `<email>`, `<link>`, `<handle>`), so they teach wording, not identifier formats. Family `reviewed-<channel>`; `block` is the reviewer's verdict.

## Lineage and privacy

- Inputs: the generator code and its seed. No scraped or purchased data, no user messages.
- Each model artifact records its seed, example count and dataset hash; the version string includes the dataset and weights hashes.
- Reviewed examples are masked before they leave the database and are covered by the TrustDecision retention period (PRIVACY.md).

## Known gaps

- No free-text intent in Twi, Ga, Ewe or Hausa yet.
- No image, voice or file content.
- Generator phrasings are written by engineers; real-message reviews are needed to find the phrasings they did not think of.
