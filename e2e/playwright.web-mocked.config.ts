import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Web UI specs whose API responses are all mocked with page.route
// (helpers/mockedWeb.ts). Start a Vite dev server yourself with its proxy
// pointed at nothing, e.g. `VITE_PROXY_TARGET=http://localhost:3999 npx vite
// --port 5602`, then run with PLAYWRIGHT_BASE_URL=http://localhost:5602.
export default defineConfig({ ...base, webServer: undefined, testMatch: ['web-content-reports.spec.ts', 'admin-offplan-review.spec.ts', 'web-sponsored-labels.spec.ts', 'web-documents.spec.ts', 'public-storefront.spec.ts', 'web-property-review.spec.ts', 'web-dashboard-figures.spec.ts', 'web-dispute-evidence.spec.ts'] })
