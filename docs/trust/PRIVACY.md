# TRUST-2 privacy notes

Contact protection reads every message and every piece of published text. These notes say what it keeps, for how long, who can see it, and how people's rights are met. The public Privacy Policy (web: `/privacy`, "Contact protection") summarises the same points.

## What is processed

The text being sent or saved, the author's own recent messages in the same conversation (chat only, to catch contact details split across messages), and the author's id. Processing happens in memory inside the RentOS API; no text is sent to a third party for screening.

## What is stored

A record (`TrustDecision`) is kept only for messages that were stopped or nearly stopped (risk ≥ 0.6). It contains:

| Field | Content |
| --- | --- |
| `maskedExcerpt` | Up to 500 characters with every digit replaced by `#` and every email, link and handle replaced by `<email>`, `<link>`, `<handle>`. Contact details are never stored. |
| `textDigest` | A keyed HMAC of the text (key: `TRUST2_DIGEST_KEY`, falling back to `JWT_SECRET`). It lets an overturned decision let the same text through. It cannot be reversed and is never returned by any API. |
| Decision data | Channel, conversation or target id, decision, enforcement, mode, reason codes, risk scores, intent label, masked rule hits, versions, latency. |
| Review | Appeal note, reviewer, outcome, label, note. |

Messages that were allowed with low risk are not recorded at all. The original text of a stopped message is never stored anywhere: it was not sent and is not saved.

## Retention

Records are deleted automatically 180 days after creation (TTL index; retention rule `moderation.trustDecision` in `config/retentionSchedule.ts`). Strikes look back 30 days.

## Who can see it

- The author: what they were told, and their appeal, in their data export.
- Moderators and admins: the masked record, in Admin → Contact Protection.
- Nobody else. Other users never learn that a message was stopped.

## People's rights

- **Access:** the account data export includes `contactProtectionDecisions` (channel, outcome, what the author was told, masked excerpt, appeal and review dates).
- **Erasure:** closing the account deletes the person's TrustDecision records with the rest of their data (`services/accountErasure.ts`).
- **Objection and review by a person:** every enforced block can be appealed; a person decides.

## Logs and metrics

Logs never contain message text: only ids, versions and failure messages. Aggregate statistics (counts, rates, latency) contain no personal data.

## Training data

The shipped model is trained only on synthetic examples. Reviewer-labelled examples, if used, are exported from masked excerpts (`exportTrustLabels.ts`) and are subject to the same 180-day retention at the source.
