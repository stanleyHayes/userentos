import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({ ...base, webServer: undefined, testMatch: 'receipt-print.spec.ts' })
