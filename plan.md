# Plan: AI Writing Assistant + FairRent Pricing Engine

## Goal
Add the two highest-value, lowest-effort features from the audit: (1) AI property writing assistant integrated into the property creation flow, and (2) a comparable-based pricing engine for landlords and tenants.

## Approach 1: AI Writing Assistant (Recommended)

**Backend changes:**
- Extend `POST /api/ai/generate` with a new `context: "property_description"` flow that accepts structured property fields and returns:
  - `description` — full property description
  - `title` — catchy listing title
  - `shortDescription` — card/preview text
  - `socialCaption` — WhatsApp/Instagram caption
  - `qualityScore` — listing quality score (0-100) with feedback
  - `tone` — optional tone parameter (professional, luxury, simple, friendly, urgent, student, family, commercial)
- Add `POST /api/ai/translate-property` for English/Twi/Ga/Ewe/Fante/French translation of listing text.
- Add `POST /api/ai/formalize` to rewrite rough Ghanaian English/pidgin into polished text.

**Client changes:**
- Add an "AI Writer" tab to `AddPropertyPage.tsx` alongside the manual form.
- The AI tab lets the landlord enter bullet points (location, type, bedrooms, amenities, price, rules) and click "Generate Listing".
- Generated content can be one-click inserted into the main form fields.
- Show quality score with actionable feedback ("Add bathroom count", "Mention water availability").
- Tone selector dropdown.
- Translation button for multi-language listings.

**Reuse:**
- Uses existing `generateText()` in `services/ai.ts` — no new AI provider needed.
- Uses existing Claude model and API key.

## Approach 2: FairRent Pricing Engine

**Backend changes:**
- New `server/src/services/pricingEngine.ts` with:
  - `estimateRent(property)` — uses comparable properties (same city, type, bedrooms) to compute low/fair/high estimates.
  - `checkFairness(propertyId)` — compares a listing against comparables and returns a fairness score + over/underpriced alert.
  - `getRentTrends(city, type, months)` — returns average rent over time for trend charts.
- New routes:
  - `POST /api/pricing/estimate` — for landlords creating a listing
  - `GET /api/pricing/fairness/:propertyId` — for tenants checking if rent is fair
  - `GET /api/pricing/trends` — rent trend data for charts
- Uses existing `Property` data — no ML model training needed. Heuristic-based:
  - Find 10-20 comparable properties (same city, type, within ±1 bedroom).
  - Compute mean, median, std dev.
  - Adjust for amenities (+5% for AC, +3% for parking, etc.).
  - Return range + confidence.

**Client changes:**
- In `AddPropertyPage.tsx`: after entering rent amount, show a "Check Market Price" button that calls `/api/pricing/estimate` and displays the fair range.
- In `PropertyDetailPage.tsx`: add a "Rent Fairness" section for tenants showing the fairness score and comparable properties.
- In `GovernmentPanel.tsx`: add rent trend charts and fairness distribution.

**Reuse:**
- Uses existing Property model and indexes.
- No external ML service needed.

## What We're NOT Building (dropped or deferred)
- **Rent Control Intelligence enhancements** — government panel already has dispute handling, simulations, and property review. Risk scores and automated reports would be valuable but are lower priority than AI writing + pricing.
- **Full Worker Marketplace** — maintenance requests already handle vendor assignment. A full marketplace with worker profiles, ratings, escrow, and recurring plans is a large feature that deserves its own dedicated sprint.

## Files to modify
- `server/src/services/ai.ts` — extend prompts
- `server/src/routes/ai.ts` — new endpoints
- `server/src/services/pricingEngine.ts` — new file
- `server/src/routes/pricing.ts` — new file
- `server/src/index.ts` — register new routes
- `client/src/pages/properties/AddPropertyPage.tsx` — AI tab + pricing check
- `client/src/pages/properties/PropertyDetailPage.tsx` — fairness display
- `client/src/pages/government/GovernmentPanel.tsx` — trends (optional)
- `client/src/lib/api.ts` or hooks — new API callers

## Testing plan
- Server unit tests for pricing engine heuristics
- Server tests for AI formalization/translation endpoints
- E2E test for AI-assisted property creation flow
