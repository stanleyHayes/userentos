import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Heavy third-party deps are split into named vendor chunks so the initial
// JS payload stays small and chunks can be cached independently across
// deploys (one library bumping a version doesn't bust the rest).
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  // Order matters: more specific MUI sub-packages must match before the broad
  // @mui/material rule.
  if (id.includes('@mui/x-date-pickers') || id.includes('/dayjs/')) {
    return 'vendor-date-pickers'
  }
  if (id.includes('@mui/material') || id.includes('@emotion/react') || id.includes('@emotion/styled')) {
    return 'vendor-mui'
  }
  if (
    id.includes('/react-router') ||
    id.includes('/react-router-dom/') ||
    id.includes('/react-dom/') ||
    /\/react\/(?!.*react-)/.test(id)
  ) {
    return 'vendor-react'
  }
  if (id.includes('/recharts/') || id.includes('/d3-')) {
    return 'vendor-charts'
  }
  if (
    id.includes('/i18next/') ||
    id.includes('/react-i18next/') ||
    id.includes('/i18next-browser-languagedetector/')
  ) {
    return 'vendor-i18n'
  }
  if (
    id.includes('/react-markdown/') ||
    id.includes('/remark-gfm/') ||
    id.includes('/remark-') ||
    id.includes('/rehype-') ||
    id.includes('/micromark') ||
    id.includes('/mdast-') ||
    id.includes('/unified/') ||
    id.includes('/hast-')
  ) {
    return 'vendor-markdown'
  }
  if (id.includes('@tanstack/react-query')) {
    return 'vendor-query'
  }
  if (id.includes('@sentry/')) {
    return 'vendor-sentry'
  }
  if (id.includes('/lucide-react/')) {
    return 'vendor-icons'
  }
  return undefined
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    port: Number(process.env.DEV_CLIENT_PORT) || 5173,
    // Allow subdomain access: tenant.localhost, landlord.localhost, etc.
    host: true,
    allowedHosts: [
      'localhost',
      'tenant.localhost',
      'landlord.localhost',
      'government.localhost',
      'legal.localhost',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
})
