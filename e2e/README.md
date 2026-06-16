# RentOS E2E Tests

End-to-end tests using [Playwright](https://playwright.dev/).

## Quick Start

### 1. Install dependencies and browsers

```bash
npm run e2e:install
```

### 2. Start the dev servers with E2E config

```bash
npm run e2e:dev
```

This starts both the Vite client and the Express API server with:
- `MONGO_URI=mongodb://localhost:27017/rentos_e2e` (isolated local DB)
- `PAYMENTS_PROVIDER_MODE=simulated` (auto-completes payments)
- `JWT_SECRET=e2e-test-secret`

> **Important:** The server's `.env` file points to a production Atlas cluster. Always use `npm run e2e:dev` for E2E work so the environment is overridden correctly.

### 3. Run the tests

If the dev servers are already running (detects port automatically):

```bash
npm run e2e:test:local
```

This verifies the response contains `"RentOS"` to avoid collisions with other Vite projects.

To run with an isolated server (default — recommended when another Vite dev server is running):

```bash
npm run e2e:test
```

This starts a fresh dev server on port **5174** using the e2e database. In CI the same command is used (see `.github/workflows/ci.yml`).

## Test IDs

The tests rely on `data-testid` attributes. When adding or changing UI, keep these stable:

| Test ID | Location |
|---------|----------|
| `property-card` | Property list cards |
| `property-apply-button` | Property detail apply CTA |
| `application-form` / `application-submit` / `application-success` | Application flow |
| `new-dispute-button` / `dispute-form` / `dispute-submit` | Dispute filing |
| `make-payment-button` / `payment-amount-input` / `payment-method-select` / `payment-submit` / `payment-status` | Payments |
| `agreement-row` / `agreement-needs-sign` / `agreement-sign-button` / `signature-pad` / `signature-confirm` / `agreement-signed-badge` | Agreement signing |

## Architecture Notes

- **Auth fixture** (`fixtures/auth.ts`) logs in `kwame@rentos.gh / password123` via UI and waits for `/dashboard`.
- **Onboarding tour bypass** — the fixture sets `skipTour=true` in `localStorage` so the onboarding overlay doesn't block clicks.
- **Test isolation** — the `agreement-sign` test creates a fresh agreement via API at runtime so it doesn't depend on seed state.
- **Port detection** — `detect-port.js` checks ports 5173–5175 and verifies the response contains `"RentOS"` to avoid collisions with other Vite projects.
