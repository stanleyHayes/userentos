import { defineConfig, type Plugin } from 'vite'
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

/** Public routes worth putting in front of a crawler. */
const SITEMAP_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/properties', priority: '0.9', changefreq: 'daily' },
  { path: '/registry', priority: '0.8', changefreq: 'daily' },
  { path: '/blog', priority: '0.8', changefreq: 'weekly' },
  { path: '/rental-laws', priority: '0.7', changefreq: 'monthly' },
  { path: '/developments', priority: '0.6', changefreq: 'weekly' },
  { path: '/login', priority: '0.4', changefreq: 'yearly' },
  { path: '/register', priority: '0.5', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/data-protection', priority: '0.3', changefreq: 'yearly' },
]

function seoUrls(): Plugin {
  return {
    name: 'rentos-seo-urls',
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', SITE_URL)
    },
    generateBundle() {
      const urls = SITEMAP_ROUTES.map(({ path: route, priority, changefreq }) =>
        `  <url>\n    <loc>${SITE_URL}${route}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
      ).join('\n')

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      })

      // Private surfaces are behind auth and have nothing to index; keeping them
      // out of the crawl budget also keeps them out of search results.
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: [
          'User-agent: *',
          'Allow: /',
          'Disallow: /dashboard',
          'Disallow: /settings',
          'Disallow: /admin',
          'Disallow: /payments',
          'Disallow: /agreements',
          'Disallow: /documents',
          'Disallow: /chat',
          'Disallow: /accept-invite',
          'Disallow: /reset-password',
          '',
          `Sitemap: ${SITE_URL}/sitemap.xml`,
          '',
        ].join('\n'),
      })
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
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
})
