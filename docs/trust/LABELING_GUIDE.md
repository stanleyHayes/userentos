# Labeling guide: reviewing contact-protection decisions

For moderators reviewing decisions in **Admin → Contact Protection** (`/admin/contact-protection`). Each review does two things: it decides whether the block stands (it changes what the author can send), and it adds a labelled example for the next model (DATASET_CARD.md).

## The question to answer

> Does this text give the other person a way to reach the author outside RentOS, ask for one, or move the conversation, viewing or payment off RentOS?

If yes, **uphold**. If no, **overturn**. When unsure, ask a second reviewer; do not overturn to clear the queue.

You see only a masked excerpt: digits appear as `#`, and emails, links and handles as `<email>`, `<link>`, `<handle>`. Masking is deliberate (PRIVACY.md). The reason codes and the rule hits show what the system found.

## Outcomes

| Outcome | Effect |
| --- | --- |
| **Upheld** | The block stands and counts as a strike (30-day window). If the author appealed, they are told it stays unsent. |
| **Overturned** | The identical text from that author will go through next time; the strike is removed. If the author appealed, they are told to send it again. |

## Intent labels

Pick the label that describes the text, not the outcome you chose.

| Label | Use when | Examples |
| --- | --- | --- |
| `SHARE_CONTACT` | The text gives a phone, email, handle, link or app username, however disguised or split. | "call me on ## ### ####", "zero two four…", "my IG is <handle>", "<link>" |
| `REQUEST_CONTACT` | The text asks the other person for theirs. | "send me your digits", "what's your WhatsApp?", "drop your email" |
| `MOVE_OFF_PLATFORM` | The text moves the deal elsewhere without giving an identifier, or asks to pay outside RentOS. | "let's continue on the green app", "text me outside here", "pay me directly, skip the app fee" |
| `DISCUSS_CONTACT_POLICY` | The text is about the rule itself. | "why can't I share my number here?", "is it allowed to call the agent?" |
| `BENIGN_CONTACT_REFERENCE` | Contact words, but harmless. | "the agent called me yesterday", "what number is the house?", "three bedrooms" |
| `NO_CONTACT` | Ordinary conversation with no contact meaning. | "is the flat still available?", "GH₵ 2,500 a month, 6 months advance" |

## Edge cases

- **Prices, dates, room counts, invoice or reference numbers** are not contact details: overturn, label `NO_CONTACT`. A 10-digit "price" that is a Ghana mobile number is a leak: uphold, `SHARE_CONTACT`.
- **Split across messages** (`CROSS_MESSAGE_ASSEMBLY`): judge the conversation, not the last message alone. If the pieces spell a number or handle, uphold and label `SHARE_CONTACT`.
- **Business names that look like handles** ("Appiah Homes"): not a handle unless it points somewhere ("find us on IG Appiah Homes" is `SHARE_CONTACT`).
- **Ordinary website links in news posts** are allowed. Messaging, social and short links are not.
- **Pay outside / cash on viewing / skip the fee** is `MOVE_OFF_PLATFORM` even without contact details: it is the scam pattern the policy exists to prevent.
- **Quoting the rule back** ("RentOS says don't share numbers") is `DISCUSS_CONTACT_POLICY`.
- **Abuse or scams with no contact details** are not this queue's job: overturn here and report through the usual content report.

## Acceptance metrics

Reviews are spot-checked weekly by a second moderator. Target agreement on outcome ≥ 95% and on label ≥ 85%. Disagreements are discussed and this guide updated. A rising overturn rate (Admin → Contact Protection, "Overturn rate") means the system is too strict: see RUNBOOK.md.

## Sign-off

This guide must be approved by the trust and safety owner before reviewer labels are used to retrain the model (spec §25, phase 0).

| Role | Name | Date |
| --- | --- | --- |
| Trust and safety owner | | |
| Product owner | | |
