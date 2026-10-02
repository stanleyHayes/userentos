import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectMeta, type PageMeta } from '../../apps/web/api/_lib/seo'

// How the page function (apps/web/api/page.ts) assembles a page's HTML,
// checked without a server: the app shell plus the API's title, structured
// data and readable content.
const shell = readFileSync(resolve(__dirname, '../../apps/web/index.html'), 'utf8')

function meta(title: string): PageMeta {
  return {
    title,
    description: `${title}, in East Legon`,
    canonical: 'https://www.userentos.com/rent/accra',
    image: 'https://www.userentos.com/og-image.png',
    type: 'website',
    siteName: 'RentOS Ghana',
    noindex: false,
    status: 200,
    replaceSiteJsonLd: false,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, mainEntity: { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, name: title }] } }],
    body: `<div class="ssr"><h1>${title}</h1></div>`,
  }
}

// "$'" and "$`" mean "the rest of the document" and "everything before it" in
// a String.replace replacement; a listing title is free text.
for (const title of ["Flat for rent $' cheap", 'Flat $` here', 'Flat $& more', 'Flat $$ and $1']) {
  test(`page text "${title}" goes into the page as written`, () => {
    const html = injectMeta(shell, meta(title))
    expect(html.match(/<div id="root"/g)).toHaveLength(1)
    expect(html.match(/<script type="module"/g)).toHaveLength(1)
    expect(html).toContain(`<div id="root" data-prerendered="1"><div class="ssr"><h1>${title}</h1></div></div>`)
    expect(html).toContain(`<title>${title.replace(/&/g, '&amp;')}</title>`)
    const ld = html.match(/<script type="application\/ld\+json" data-seo="page">([\s\S]*?)<\/script>/)
    expect(JSON.parse(ld![1]).name).toBe(title)
  })
}

test('structured data cannot end its own script tag', () => {
  // The body arrives escaped from the API; the head is built here.
  const head = injectMeta(shell, meta('Flat</script><script>alert(1)</script>')).split('</head>')[0]
  expect(head).not.toContain('</script><script>alert(1)')
  expect(head).toContain('\\u003c/script>')
})

test('the page function answers HEAD as well as GET', () => {
  // Uptime monitors and link checkers use HEAD; the launcher answers an unexported method with 405.
  const source = readFileSync(resolve(__dirname, '../../apps/web/api/page.ts'), 'utf8')
  expect(source).toMatch(/^export \{ GET as HEAD \}$/m)
})
