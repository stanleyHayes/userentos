# Feature Expansion Audit — RentOS

## 1. AI Writing Assistant ("RentOS AI Writer")

### What Already Exists
- **Backend**: `services/ai.ts` has `generateText(prompt, context, language)` using Claude. Endpoint `POST /api/ai/generate` already live. Supports English, Twi, Ga, Ewe.
- **Backend**: Rule-based abuse-check at `POST /api/ai/abuse-check` (public).
- **Backend**: Legal assistant chat with RAG at `POST /api/ai/chat`.
- **UI**: Legal Assistant chat page exists (`client/src/pages/legal/LegalAssistant.tsx`).

### What's Missing
- **No AI integration in property creation flow**. `AddPropertyPage.tsx` has a manual title/description form with zero AI help.
- No dedicated "AI Writer" tab in admin/landlord dashboards.
- No title generator, short-description generator, or social-media caption generator.
- No listing quality score before publication.
- No AI formalization/translation tool for rough property text.

### Verdict: **BUILD** — backend exists, just needs UI + maybe one extra endpoint for batch generation.

---

## 2. ML Pricing Engine ("FairRent Engine")

### What Already Exists
- **Government simulations**: `POST /api/simulation/rent-cap` and `/advance-limit` — policy impact tools for rent control officers. Not pricing suggestions.
- **Smart recommendations**: `GET /api/properties/recommendations/smart` — embedding-based property matching with match scores. Not pricing.
- **Credit scoring**: `GET /api/credit/me` — tenant credit score. Not property pricing.
- **Analytics**: Platform-wide rent charts in government/landlord dashboards.

### What's Missing
- No price prediction for new listings.
- No comparable property analysis for tenants/landlords.
- No "is this rent fair?" checker.
- No rent trend dashboard by location + property type.
- No overpriced/underpriced alerts.

### Verdict: **BUILD** — nothing comparable exists. Can build a heuristic engine using existing property data (comparables + area averages + feature weights). No true ML model needed; dataset is too small for ML, but comparables + heuristics deliver the same user value.

---

## 3. Rent Control Officer Intelligence

### What Already Exists
- **Dispute system**: Full CRUD with categories, evidence, mediation notes, resolution. Categories: rent_increase, eviction, maintenance, deposit_refund, illegal_clause, other.
- **Government panel**: Overview, properties, financial, people, engagement, system tabs. Property review queue, analytics, simulations.
- **Move-out inspections**: Landlords can schedule inspections and submit notes. Tenants can dispute findings.
- **Abuse checker**: Rule-based public endpoint for rental law violations.
- **Property review**: Government officers approve/reject listings.

### What's Missing
- No automated **rent fairness score** for individual properties.
- No **landlord/property risk score** based on complaint history.
- No **rent increase analysis** (detecting suspicious % jumps).
- No **automated evidence report** generation (PDF with property, complaint, comparables, fairness score).
- No mobile inspection app for field officers.

### Verdict: **BUILD** — enhance existing government panel with fairness scoring, risk scores, and rent-increase analysis. Combine with the pricing engine since they share comparable data.

---

## 4. Essential Worker Marketplace ("RentOS Services")

### What Already Exists
- **Maintenance requests**: Full CRUD. Categories: plumbing, electrical, structural, pest, appliance, security, other.
- **Vendor fields**: `MaintenanceRequest` model already has `vendorId`, `vendorName`, `vendorPhone`.
- **Landlord can assign vendor**: Via PATCH `/api/maintenance/:id`.
- **Tenant can create requests**: Via POST `/api/maintenance`.
- **Scheduler escalation**: Stale (>48h) requests auto-escalate priority and notify landlord.

### What's Missing
- No worker registration/profiles.
- No worker directory/marketplace.
- No ratings or reviews for workers.
- No quote request system.
- No emergency service booking.
- No escrow.
- No recurring maintenance plans.

### Verdict: **BUILD** — but **combine with existing maintenance system**. Instead of a separate marketplace, enhance maintenance requests into a "Service Provider Directory" where landlords can browse verified workers, see ratings, and assign them directly to requests. Much simpler than a full marketplace and reuses 100% of existing maintenance infrastructure.

---

## Recommended Implementation Order

| Priority | Feature | Effort | Impact | Reuses Existing |
|----------|---------|--------|--------|-----------------|
| 1 | AI Writing Assistant (property creation) | Low | High | `generateText` backend |
| 2 | FairRent Pricing Engine | Medium | High | Property data + analytics |
| 3 | Rent Control Intelligence (fairness + risk) | Medium | High | Disputes + pricing data |
| 4 | Service Provider Directory | Medium | Medium | Maintenance system |
