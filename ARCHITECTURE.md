# RentOS Ghana — Architecture Overview

> **Version:** 0.2.0  
> **Last updated:** 2026-05-22

---

## 1. What is RentOS?

RentOS Ghana is a national digital rental housing platform. It connects **tenants**, **landlords**, **property managers**, **government officials**, **legal officers**, **financiers**, and **employers** in a single, regulated ecosystem.

Core capabilities:
- Property listing, search, and application
- Legally compliant digital agreement signing with PDF generation
- Rent payments via mobile money (MTN MoMo, Telecel Cash, AirtelTigo) and bank transfer
- Tenant credit scoring and savings plans
- Micro-loans and rent financing
- Dispute resolution
- Real-time messaging
- Employer payroll deductions
- Insurance products
- Government analytics and policy simulation

---

## 2. System Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Web App    │  │ Mobile App   │  │   Admin      │                  │
│  │  (React 19)  │  │(Expo / RN)   │  │   Portal     │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
└─────────┼─────────────────┼─────────────────┼──────────────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                                    │
│                     Node.js 22 + Express 5                               │
│  • JWT authentication  • Role/permission guards  • Rate limiting        │
│  • Input validation (Zod)  • Error tracking  • Sentry observability     │
└─────────────────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER                                    │
│  Auth · Properties · Agreements · Payments · Savings · Disputes         │
│  Credit · Loans · Investments · Financing · Employers · Insurance       │
│  Chat · Notifications · Analytics · AI Legal Assistant · Scheduler      │
└─────────────────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                       │
│  MongoDB (Mongoose ODM)  ·  Cloudinary (media)  ·  Redis (implicit)    │
└─────────────────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL INTEGRATIONS                               │
│  MTN MoMo · Telecel · AirtelTigo · Bank PSP · Twilio · Resend · FCM    │
│  Anthropic Claude · Sentry · Firebase Admin · Expo Push                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Server Runtime** | Node.js 22 + Express 5 | ES modules (`"type": "module"`) |
| **Server Language** | TypeScript 5 | Compiled with `tsc` to `dist/` |
| **Dev Server** | `tsx watch` | Hot reload with `.env` loading |
| **Database** | MongoDB 7+ | Mongoose ODM, ~40 models |
| **Auth** | JWT (access tokens, 7-day expiry) | bcryptjs for passwords |
| **Real-time** | Socket.IO | Over shared HTTP server |
| **File Uploads** | Multer (memory) → Cloudinary | 10 MB limit |
| **PDF Generation** | PDFKit | Agreement PDF exports |
| **Email** | Resend | Transactional + marketing |
| **SMS** | Twilio | OTP, reminders, confirmations |
| **Push Notifications** | Firebase Admin + Expo Push | Dual provider support |
| **AI** | Anthropic Claude SDK | Legal assistant, text generation |
| **Observability** | Sentry + Winston + `errors.json` | Structured logging, error tracking |
| **Scheduling** | `node-cron` | Ghana timezone (`Africa/Accra`) |
| **Validation** | Zod | Runtime request validation |
| **Rate Limiting** | `express-rate-limit` | Per-IP and per-user tiers |
| **Testing** | Vitest (server) + Playwright (E2E) | Coverage via `@vitest/coverage-v8` |

### Client (Web)

| Layer | Technology | Notes |
|---|---|---|
| **Framework** | React 19 | Functional components + hooks |
| **Build Tool** | Vite 8 | Aggressive manual code splitting |
| **Styling** | Tailwind CSS v4 + MUI v7 | Component library hybrid |
| **Routing** | React Router v7 | Lazy-loaded route chunks |
| **State** | Zustand (persisted) + TanStack Query v5 | Server state + client state |
| **Charts** | Recharts | Analytics dashboards |
| **i18n** | i18next | English, Twi, Ga, Ewe |
| **Error Tracking** | Sentry React SDK | Production only |

### Mobile

| Layer | Technology | Notes |
|---|---|---|
| **Framework** | React Native 0.83 + Expo SDK 55 | File-based routing via Expo Router |
| **Auth Storage** | `expo-secure-store` | Token persistence |
| **Biometric** | `expo-local-authentication` | Face ID / fingerprint login |
| **Push** | `expo-notifications` | OTA updates via `eas update` |
| **Build** | EAS Build | Preview (APK) + Production (AAB/IPA) |

---

## 4. Project Structure

```
rentos/
├── server/                  # Express API
│   ├── src/
│   │   ├── index.ts         # Application bootstrap
│   │   ├── config/          # Environment configuration
│   │   ├── middleware/      # Auth, rate limits, error handling
│   │   ├── routes/          # HTTP route definitions (~40 routers)
│   │   ├── controllers/     # Route orchestration
│   │   ├── services/        # Business logic + external integrations
│   │   ├── models/          # Mongoose schemas + seed data
│   │   ├── repositories/    # Data access abstraction
│   │   ├── utils/           # Helpers (response, params, logger)
│   │   └── types/           # Local + synced shared types
│   ├── dist/                # tsc output
│   ├── uploads/             # Local file storage (dev)
│   └── package.json
├── client/                  # React SPA
│   ├── src/
│   │   ├── pages/           # Route components (lazy loaded)
│   │   ├── components/      # Reusable UI
│   │   ├── hooks/           # Custom React hooks
│   │   ├── stores/          # Zustand stores
│   │   ├── lib/             # API client, socket
│   │   └── types/           # Local + synced shared types
│   ├── dist/                # Vite build output
│   └── package.json
├── mobile/                  # Expo React Native app
│   ├── app/                 # File-based routes
│   ├── components/          # Mobile UI
│   ├── hooks/               # Mobile hooks
│   └── package.json
├── e2e/                     # Playwright end-to-end tests
│   ├── tests/               # Spec files
│   └── fixtures/            # Auth helpers
├── shared/                  # Single source of truth for domain types
│   └── types/index.ts
└── package.json             # Root orchestration (sync-types, dev, build)
```

---

## 5. Authentication & Authorization

### JWT Access Tokens
- **Expiry:** 7 days (`60 * 60 * 24 * 7` seconds)
- **Payload:** `userId`, `email`, `roles`, `permissions`
- **Storage:** Client stores in `localStorage` (web) or `expo-secure-store` (mobile)
- **Transport:** `Authorization: Bearer <token>` header

### Middleware Stack
1. **`authenticate`** — Verifies JWT, attaches `req.user`
2. **`optionalAuth`** — Attaches user if token present, never rejects
3. **`requireRole(...roles)`** — 403 if `activeRole` not in list
4. **`requirePermission(...perms)`** — 403 if any permission missing
5. **Super Admin Bypass** — `super_admin` role skips all checks

### Biometric Login (Mobile)
- Separate `BiometricToken` model stored server-side
- Mobile exchanges biometric proof for short-lived JWT

### Role Switching
- Users can hold multiple roles (`roles: string[]`)
- `activeRole` determines current portal context
- Subdomain-aware routing (`tenant.localhost`, `landlord.localhost`, etc.)

---

## 6. Data Model (Key Entities)

| Entity | Purpose |
|---|---|
| `User` | Core identity, credentials, roles, permissions |
| `TenantProfile` | Search preferences, demographics, documents |
| `Property` | Listing data, address, rent, amenities, images |
| `Agreement` | Digital lease terms, signatures, PDF snapshot |
| `Payment` | Rent/MoMo transactions, status, provider refs |
| `Wallet` | In-app balance, transaction history |
| `SavingsPlan` | RentGuard goals, auto-debit settings |
| `CreditScore` | Computed 0-100 score from behavior |
| `Dispute` | Mediation cases, evidence, resolution |
| `Loan` / `FinancingContract` | Micro-loans and financier contracts |
| `Investment` | Crowdfunded property investments |
| `Conversation` / `Message` | Real-time chat |
| `Document` | Uploaded files with version control |
| `MaintenanceRequest` | Repair tickets with escalation |
| `MoveOut` | End-of-lease inspection and deposit refund |
| `Employer` / `Employment` / `PayrollRun` | Payroll deduction linkage |
| `InsurancePolicy` / `InsuranceProduct` | Rent insurance offerings |
| `Achievement` / `Badge` | Gamification system |
| `FeatureFlag` | Runtime toggles |
| `BootstrapState` | One-time seed/insurance guards |

---

## 7. Payment Architecture

### Provider Factory Pattern
`services/payments/index.ts` switches between:
- **Live providers:** MTN MoMo, Telecel Cash, AirtelTigo, Bank Transfer
- **Simulator:** In-process mock that auto-completes after 2 seconds

Controlled by `PAYMENTS_PROVIDER_MODE=simulated|live`.

### Webhook Handling
- Payment webhook routes are mounted **before** `express.json()` so raw body bytes are available for provider signature verification.
- Simulator dispatches in-process completion events wired to the same `finalizePayment()` path.

### Idempotency
`finalizePayment()` skips already-terminal payments (`completed`, `failed`, `refunded`) and updates only `pending`/`processing` records.

### Reconciliation Cron
Every 5 minutes, pending payments older than 2 minutes with a `providerRef` are polled via `provider.queryStatus()` and finalized.

---

## 8. Real-Time Communication

### Socket.IO
- Initialized over the shared HTTP server in `index.ts`
- JWT auth middleware on connection
- Rooms: `user:<id>` (personal), `chat:<conversationId>` (chat)
- Events: `notification:new`, `badges:update`, `typing:start/stop`, `user:online/offline`

### Notification Channels
1. **In-app** — Socket.IO + persisted `Notification` documents
2. **Email** — Resend (welcome, payment confirmation, reminders, disputes)
3. **SMS** — Twilio (OTP, payment confirmation, reminders)
4. **Push** — Firebase Cloud Messaging + Expo Push

---

## 9. Scheduler (`node-cron`)

All jobs run in **Ghana timezone** (`Africa/Accra`).

| Schedule | Job | Description |
|---|---|---|
| `0 8 * * *` | Savings auto-debit | Debit active savings plans if wallet funded |
| `0 9 * * *` | Rent reminders | Notify tenants 14/7/3 days before due |
| `0 9 * * *` | Lease expiry | Remind at 60/30/14/7 days; auto-initiate move-out |
| `0 9 * * *` | Payment due | Remind on pending payments at -3, -1, 0, +3 days |
| `0 9 * * *` | Maintenance escalation | Escalate stale `requested` tickets >48h |
| `0 9 * * *` | Financing arrears | Update contract status based on overdue installments |
| `*/5 * * * *` | Payment reconciliation | Poll stale pending payments for status |

---

## 10. Build & Deployment

### Local Development
```bash
npm run install:all   # Install all workspace deps
npm run dev           # Sync types + start client + server concurrently
npm run dev:mobile    # Sync types + expo start
```

### Production Build
```bash
npm run build         # Sync types + build client + build server
```

### Web Service Deployment (Render)
- **Root Directory:** `server`
- **Build:** `npm install && npm run build`
- **Start:** `npm start` (`node dist/index.js`)
- **Health Check:** `GET /api/health`

### Client Deployment (Vercel)
- SPA catch-all via `vercel.json`
- `VITE_API_URL` points to production API

### Mobile Deployment (EAS)
- `eas.json` profiles: `preview` (APK), `production` (AAB/IPA)
- OTA updates via `eas update`

---

## 11. Testing Strategy

| Layer | Framework | Coverage |
|---|---|---|
| **Server Unit** | Vitest | Middleware, business logic, finance math |
| **E2E** | Playwright | Auth, property browse, application, agreement signing, payments, disputes |
| **Client Unit** | *Not yet configured* | — |
| **Mobile** | *Not yet configured* | — |

### CI Pipeline (GitHub Actions)
Three parallel jobs on PR/push to `main`:
1. **Server** — `npm ci` → `typecheck` → `test` → `build`
2. **Client** — `npm ci` → `lint` → `typecheck` → `build`
3. **E2E** — MongoDB service container → install deps → sync types → start dev servers → Playwright

---

## 12. Environment Variables

### Server (`.env`)
```
PORT=3002
MONGO_URI=mongodb://localhost:27017/rentos
JWT_SECRET=<strong-random-secret>
CORS_ALLOWED_ORIGINS=https://rentos-gh.vercel.app
ANTHROPIC_API_KEY=...
RESEND_API_KEY=...
FROM_EMAIL=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
SENTRY_DSN=...
PAYMENTS_PROVIDER_MODE=simulated
PUBLIC_BASE_URL=https://api.rentos.gh
```

### Client (`.env`)
```
VITE_API_URL=/api
VITE_SOCKET_URL=http://localhost:3002
VITE_SENTRY_DSN=...
```

---

## 13. Security Checklist

- [x] JWT secrets required in production (no fallback)
- [x] CORS restricted to configured origins (no wildcard in production)
- [x] Socket.IO CORS mirrors HTTP CORS policy
- [x] Rate limiting on auth, public, and write endpoints
- [x] Regex input escaped before MongoDB `$regex` queries
- [x] Password reset tokens sent via email only (never in API response)
- [x] Zod validation on write endpoints
- [x] `param()` sanitization for Express v5 array params
- [x] Raw body preserved for webhook signature verification
- [x] Multer file size limits (10 MB)
- [x] Cloudinary upload restricted to authenticated users

---

## 14. Notable Architectural Patterns

1. **Manual Type Syncing** — `shared/types/index.ts` is copied to `client/src/types/shared.ts`, `server/src/types/shared.ts`, and `mobile/types/shared.ts` via `npm run sync-types`.
2. **Lazy-Loaded Routes** — Every page in the web client uses `React.lazy()` to minimize initial bundle.
3. **Subdomain-Aware Auth** — `authStore` auto-switches `activeRole` based on the current portal subdomain.
4. **Bootstrap Guards** — `BootstrapState` model prevents re-running seeders, insurance bootstraps, and feature-flag bootstraps.
5. **Credit Score Algorithm** — Custom 0-100 scoring based on payment history, savings consistency, agreement compliance, dispute record, and account age.
6. **Fine-Grained Permissions** — Beyond roles, explicit permissions like `users:create`, `financing:offer`, `employer:run_payroll` allow granular access control.
7. **Error Tracking Middleware** — Custom `errorTrackingHandler` writes to `errors.json`; super_admin can read recent errors via `GET /api/admin/errors`.

---

## 15. Roadmap / TODO

- [ ] Add refresh token mechanism (currently only 7-day access tokens)
- [ ] Client-side 401 interceptor with silent refresh or redirect
- [ ] OpenAPI / Swagger documentation
- [ ] Database migration framework (currently relies on Mongoose defaults)
- [ ] Redis caching layer for property search and analytics
- [ ] Microservices extraction for payments and notifications
- [ ] Webhook signature verification for live providers
- [ ] Comprehensive client unit tests (Vitest + React Testing Library)
