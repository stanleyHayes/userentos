# RentOS Agent Plan — Issue Fixes, AI Roadmap & Feature Pipeline

> **Date:** 2026-05-22  
> **Status:** Active  
> **Sprint Goal:** Close security gaps, fix performance issues, and define the AI/feature roadmap for v0.3.0–v0.5.0.

---

## Phase 1 — Critical Fixes (This Sprint)

### 1.1 Auth & Security
- [x] ~~JWT secret fallback removed~~
- [x] ~~Reset token leak fixed~~
- [ ] `POST /auth/change-password` — add `authenticate` middleware (currently manually parses JWT, bypassing standard chain)
- [ ] `GET /properties/:id` — add `optionalAuth` + filter draft/pending properties for unauthenticated users
- [ ] `GET /payments/:id` — add authorization check (only tenant, landlord, or admin can view)
- [ ] `propertyController.list` — remove manual JWT re-parse, use `req.user` from `optionalAuth`

### 1.2 Performance & Stability
- [ ] `analyticsController.platform` — replace `Model.find().lean()` with MongoDB aggregation pipelines to prevent OOM
- [ ] `analyticsController.me` — add date-range filtering (default 90 days) to limit dataset size
- [ ] Scheduler N+1 queries — batch `Property.findById` lookups using `$in` queries inside loops
- [ ] Add MongoDB indexes on high-cardinality query fields (see Index List below)

### 1.3 Code Quality
- [ ] Replace hardcoded Anthropic model name with env-configurable `ANTHROPIC_MODEL`
- [ ] Replace `console.log/warn/error` in scheduler, payments, achievements with Winston `logger`
- [ ] Make loan interest rate and min credit score env-configurable
- [ ] Add `apiVersion` response header middleware

#### Index List
```js
// Properties
Property.schema.index({ status: 1, listingStatus: 1 })
Property.schema.index({ type: 1 })
Property.schema.index({ createdAt: -1 })
Property.schema.index({ 'address.city': 1, 'address.region': 1 })
Property.schema.index({ rentAmount: 1 })

// Agreements
Agreement.schema.index({ status: 1, endDate: 1 })
Agreement.schema.index({ landlordId: 1 })
Agreement.schema.index({ tenantId: 1 })

// Payments
Payment.schema.index({ status: 1, createdAt: -1 })
Payment.schema.index({ tenantId: 1, status: 1 })
Payment.schema.index({ landlordId: 1, status: 1 })

// Maintenance
MaintenanceRequest.schema.index({ status: 1, createdAt: -1 })
MaintenanceRequest.schema.index({ propertyId: 1 })
```

---

## Phase 2 — AI Features Roadmap (v0.3.0)

### 2.1 RAG Legal Assistant
**Goal:** Move from static prompt to retrieval-augmented generation.

- **Vector Store:** Pinecone or Weaviate (starter tier is free)
- **Documents to ingest:**
  - Rent Act, 1963 (Act 220)
  - Ghana Constitution (property rights chapter)
  - CHRAJ complaint procedures
  - Rent Control Department guidelines
  - Sample tenancy agreements and case law
- **Pipeline:**
  1. Chunk documents into ~500-token segments
  2. Generate embeddings via `text-embedding-3-small` (OpenAI) or Cohere
  3. Store in vector DB with metadata (law, section, year)
  4. On chat: embed user query → retrieve top-5 chunks → inject into Claude prompt
- **Fallback:** If vector DB unavailable, fall back to static prompt
- **Benefit:** Reduces hallucinations, cites specific laws and sections

### 2.2 Document AI / OCR
**Goal:** Auto-extract data from uploaded tenant documents.

- **Provider:** Google Document AI or AWS Textract (or open-source EasyOCR)
- **Use cases:**
  - Parse Ghana Card / passport → auto-fill tenant profile
  - Parse pay slips → auto-verify income
  - Parse existing tenancy agreements → auto-fill agreement fields
- **Storage:** Extracted text saved to `DocumentModel.extractedText` field
- **Privacy:** PII redaction before storage; processing happens in-memory only

### 2.3 AI Credit Scoring v2
**Goal:** Enhance rule-based scoring with behavioral ML.

- **Current:** 5-factor deterministic (0–100)
- **v2 additions:**
  - Payment velocity (days early/late, not just binary)
  - Application acceptance rate
  - Message response time
  - Dispute language sentiment (NLP on dispute descriptions)
  - Property view-to-apply conversion rate
- **Model:** Simple logistic regression or XGBoost on tabular data
- **Deployment:** Train monthly on aggregate data; model served via lightweight ONNX runtime
- **Explainability:** Every score change comes with a human-readable reason

### 2.4 Smart Property Recommendations
**Goal:** Replace rule-based matching with a learned recommender.

- **Approach:** Two-tower neural network (tenant tower + property tower)
- **Features:**
  - Tenant: budget, preferred cities, amenities, credit score, family size, pets
  - Property: rent, location, amenities, landlord responsiveness, review score
- **Training data:** Implicit (views, favorites, applications) + explicit (leases signed)
- **Cold start:** Fall back to rule-based for new users
- **Output:** Ranked list with "Why recommended" explanation

### 2.5 NLP-Powered Search
**Goal:** Semantic search across properties, blog, and legal docs.

- **Embedding model:** `text-embedding-3-small` or `BAAI/bge-small-en`
- **Hybrid search:** Combine vector similarity with MongoDB filters (price, city, type)
- **Query understanding:**
  - "2-bedroom in East Legon under GHS 3000" → structured filters
  - "quiet area with good security" → semantic vector search
- **Auto-suggest:** LLM-generated search suggestions based on trending queries

---

## Phase 3 — Platform Enhancements (v0.4.0)

### 3.1 Refresh Tokens & Auth Improvements
- Add `/auth/refresh` endpoint (HTTP-only cookie with refresh token)
- Add client 401 interceptor for silent refresh
- Reduce access token TTL to 15 minutes
- Add "Log out all devices" functionality

### 3.2 Maps & Geospatial
- Integrate Mapbox or Google Maps
- Property detail page: interactive map with pin
- Property search: "Near me" radius filter using GPS coordinates
- Neighborhood overlays: transit, schools, safety scores
- Geofencing: notify landlords when tenant moves in/out of property radius

### 3.3 General Webhooks
- Webhook subscription model (`WebhookSubscription` schema)
- Events: `application.created`, `agreement.signed`, `payment.completed`, `lease.expiring`, `maintenance.escalated`, `dispute.filed`
- Retry logic with exponential backoff
- HMAC signature verification
- Admin dashboard for webhook management

### 3.4 GDPR / Data Privacy
- `DELETE /users/me` — soft delete with 30-day grace period
- `GET /users/me/export` — JSON export of all personal data
- Privacy policy and cookie consent banner
- Data retention policy (auto-purge audit logs after 2 years)

### 3.5 Redis Caching Layer
- Cache property search results (TTL: 5 minutes)
- Cache analytics aggregations (TTL: 1 hour)
- Cache feature flags (TTL: 60 seconds, with pub/sub invalidation)
- Session store for refresh tokens

### 3.6 API Documentation (OpenAPI)
- Auto-generate OpenAPI 3.1 spec from Zod schemas
- Serve Swagger UI at `/api/docs`
- Generate TypeScript client SDKs for web and mobile

---

## Phase 4 — Scale & Intelligence (v0.5.0)

### 4.1 Multi-Model AI Fallback
- Primary: Anthropic Claude
- Fallback 1: OpenAI GPT-4o (for legal assistant)
- Fallback 2: Local Llama 3.1 (via Ollama) for offline/text-generation tasks
- Circuit breaker pattern: if primary fails 3× in 60s, switch to fallback

### 4.2 Predictive Analytics
- **Rent pricing optimizer:** Suggest optimal rent based on location, seasonality, and demand
- **Churn prediction:** Flag tenants likely to move out 60 days in advance
- **Fraud detection:** Anomaly detection on payment patterns and application behaviors
- **Demand forecasting:** Predict property demand by region for government analytics

### 4.3 White-Label / Multi-Tenancy
- `Organization` schema with branding config (logo, colors, domain)
- Subdomain routing: `acme.rentos.gh`
- Isolated data per org (shared DB, org-scoped queries)
- Admin dashboard for org management

### 4.4 Mobile Parity
- Complete landlord dashboard on mobile
- Payment initiation and wallet management
- Document upload and e-signing
- Push notifications for all major events
- Biometric auth (already started)

### 4.5 Advanced Messaging
- AI-suggested replies for landlords ("Approve maintenance?", "Schedule viewing")
- Message summarization for long conversation threads
- Auto-translation between Twi/Ga/Ewe and English in chat
- Moderation: flag abusive language before sending

---

## Appendix A — Quick Wins (Can ship this week)

1. **Add `data-testid` to client components** → Enable all 5 E2E specs
2. **Config-driven AI model** → `ANTHROPIC_MODEL` env var
3. **MongoDB indexes** → One-liner per model, massive query speedup
4. **Analytics date filter** → Add `?startDate=&endDate=` to `/api/analytics/me`
5. **Request logging cleanup** → Replace console logs in scheduler with Winston
6. **Property getById auth** → Add `optionalAuth` + `listingStatus` filter

---

## Appendix B — Tech Stack for New Features

| Feature | Suggested Tech | Cost |
|---|---|---|
| RAG Vector DB | Pinecone (free tier) or Weaviate | $0–$25/mo |
| Embeddings | OpenAI `text-embedding-3-small` | $0.02/1M tokens |
| OCR | AWS Textract or Google Document AI | $0.0015/page |
| Maps | Mapbox (free tier: 50k loads/mo) | $0–$50/mo |
| Redis | Upstash Redis (free tier) or Redis Cloud | $0–$10/mo |
| ML Training | Python + scikit-learn/XGBoost, run monthly | $0 (batch) |
| Search Engine | Meilisearch (self-hosted) or Algolia | $0–$29/mo |
| Webhook Infra | BullMQ on Redis | $0 (uses Redis above) |

---

## Appendix C — Definition of Done

For each phase:
- [ ] All new code has TypeScript strict mode compliance
- [ ] Unit tests cover business logic (Vitest)
- [ ] E2E tests cover critical user paths (Playwright)
- [ ] API docs updated (if endpoint changes)
- [ ] Env vars documented in `.env.example`
- [ ] Feature flags added for gradual rollout (if user-facing)
- [ ] Performance benchmarked before/after (if applicable)
