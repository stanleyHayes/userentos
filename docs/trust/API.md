# TRUST-2 API

## 1. When a write is stopped (every screened endpoint)

Any endpoint that screens text (sending a message, an enquiry, saving a listing, website, post, review, profile or viewing note) answers a stopped write with **HTTP 422** and:

```json
{
  "success": false,
  "error": "This message wasn't sent because it looks like it shares contact details or moves the conversation off RentOS. Keep the conversation, the viewing and the payment on RentOS, where you're protected.",
  "blocked": true,
  "reason": "OFF_PLATFORM_CONTACT",
  "decisionId": "6abf72734892798f2f269be6"
}
```

| Field | Meaning |
| --- | --- |
| `error` | Show this to the author as it is. It explains what happened and what to do, never which pattern matched. A second recent strike appends a suspension warning. |
| `blocked` | Always `true` for a contact-protection stop. Other 422s do not have it. |
| `reason` | `OFF_PLATFORM_CONTACT`, `CONTACT_ACROSS_MESSAGES`, or `null` when the screen was unavailable (fail closed). |
| `decisionId` | Pass to the appeal endpoint. `null` when nothing was recorded. |

Clients must keep the author's text in the input (web: `lib/contactProtection.ts`, `ContactBlockedNotice`; mobile: `lib/contactProtection.ts`). Nothing was sent or saved.

## 2. Appeal

`POST /api/trust/decisions/:id/appeal` (signed in; only the author of an enforced block)

Body (optional):

```json
{ "note": "It's the price, not a phone number" }
```

`note`: up to 500 characters.

| Status | When |
| --- | --- |
| 200 `{ "status": "appealed" }` | Queued for a person. |
| 404 | Not your decision, not a block, or not enforced. |
| 409 | Already appealed, or already reviewed. |

## 3. Review queue (admins)

`GET /api/trust/admin/decisions` (permission: admin roles)

| Query | Values |
| --- | --- |
| `status` | `pending`, `appealed`, `upheld`, `overturned` |
| `decision` | `ALLOW`, `BLOCK` |
| `mode` | `enforce`, `shadow` |
| `channel` | `chat`, `enquiry`, `listing`, `website`, `blog`, `review`, `viewing`, `application`, `profile`, `other` |
| `page` | 1–500 (50 per page, newest first) |

Each item has the decision record (MASKED: `maskedExcerpt`, never the original text), `reasonCodes`, `basis`, `riskScore`, `scores`, `intentLabel`, `ruleHits`, `versions`, `latencyMs`, `degraded`, `review`, and `author { id, name, roles, suspended }`. `textDigest` is never returned.

`POST /api/trust/admin/decisions/:id/review`

```json
{ "outcome": "overturned", "label": "NO_CONTACT", "note": "Monthly rent, not a number" }
```

| Field | Values |
| --- | --- |
| `outcome` | `upheld` or `overturned` (required) |
| `label` | One of the six intent labels (LABELING_GUIDE.md); feeds `exportTrustLabels.ts` |
| `note` | Up to 1,000 characters |

Audited (`trust.decision_upheld` / `trust.decision_overturned`). If the author appealed an enforced block, they are notified of the outcome. Overturning lets the identical text from that author through and removes the strike.

## 4. Health (admins)

`GET /api/trust/admin/stats?days=7` (1–90)

Returns:

```json
{
  "days": 7,
  "config": { "mode": "enforce", "modelEnforcePercent": 0, "versions": { "model": "…", "normalizer": "…", "feature": "…", "policy": "…" } },
  "volume": { "messagesSent": 0, "enforcedBlocks": 0, "shadowBlocks": 0, "nearMisses": 0, "blockRate": 0 },
  "reasons": [{ "code": "EXACT_PHONE", "count": 0 }],
  "channels": [{ "channel": "chat", "count": 0 }],
  "reviews": { "upheld": 0, "overturned": 0, "overturnRate": null, "appealsOpen": 0 },
  "latencyMs": { "p50": 0.2, "p95": 0.6, "p99": 1.1 },
  "degraded": 0
}
```

`blockRate` is the share of chat sends stopped; `overturnRate` is overturned ÷ (upheld + overturned), `null` until something is reviewed.

## 5. Server-side contract (internal)

```ts
screenOutbound(input: ScreenInput): Promise<ScreenResult>
screenFields({ fields, authorId, channel, targetType, targetId, allowExternalLinks }): Promise<ScreenResult>
blockedBody(result: ScreenResult)  // the 422 body above
```

Callers act on `result.allowed` only. See ARCHITECTURE.md for the full types.

## 6. Related

- `GET /api/platform/features`: public; includes `directWhatsApp` (whether the direct WhatsApp button is on).
- `POST /api/reports` with `reason: "off_platform_contact"`: a user report of contact sharing (also opened automatically at 3 strikes in 30 days).
