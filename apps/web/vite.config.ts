import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

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


/**
 * Absolute URLs for social previews and SEO.
 *
 * og:image, og:url, twitter:image and the canonical link all have to be
 * absolute — a link-preview crawler has no page context to resolve a relative
 * path against. Hardcoding them means they rot the moment the domain changes,
 * which is exactly what happened: every tag pointed at a host that 404s, so no
 * preview could ever render.
 *
 * Set VITE_SITE_URL at build time. The placeholder is replaced deterministically
 * here (rather than with Vite's %VITE_%% syntax) so a missing variable falls back
 * to the production domain instead of shipping a literal placeholder.
 */
const SITE_URL = (process.env.VITE_SITE_URL || 'https://userentos.com').replace(/\/$/, '')

/**
 * The shell ships as app.html as well as index.html, and on Vercel only as
 * app.html. Vercel serves a real file before any rewrite, so an index.html
 * there would answer "/" on every host itself, and an agency website's home
 * page could never get its own title and preview from api/page.ts. With no
 * file at "/", vercel.json routes every page: agency hosts and the public
 * pages through api/page.ts, everything else to app.html.
 *
 * robots.txt and sitemap.xml are not built here any more: both differ per
 * host and are answered by api/robots.ts and api/sitemap.ts.
 */
function seoUrls(): Plugin {
  let outDir = 'dist'
  return {
    name: 'rentos-seo-urls',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', SITE_URL)
    },
    closeBundle() {
      const index = path.join(outDir, 'index.html')
      if (!fs.existsSync(index)) return
      fs.copyFileSync(index, path.join(outDir, 'app.html'))
      if (process.env.VERCEL) fs.rmSync(index)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), seoUrls()],
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
      '/socket.io': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3002',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
})
