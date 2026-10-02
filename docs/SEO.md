# Search engine optimisation

How RentOS pages reach search engines, and where to change things.

## What a crawler gets

Every public page on the platform answers with finished HTML before any JavaScript runs: its own title, description, canonical address, structured data and the page content itself (listings, prices, breadcrumbs, FAQs, article text).

1. `apps/web/vercel.json` sends public paths to the page function `apps/web/api/page.ts`.
2. The function asks the API for the page (`GET /api/seo/meta?host=&path=`, `apps/api/src/services/seo.ts`). It injects the head tags into the built app shell, and the page HTML into `<div id="root">`.
3. In the browser, `apps/web/src/lib/prerender.ts` keeps that HTML. `BootFallback` in `App.tsx` shows it until the React page for the same path has loaded, so visitors see content at once, with no splash.

The server HTML is styled by its own small stylesheet, scoped to `.ssr` (`apps/api/src/services/seoHtml.ts`). Everything written into it goes through `esc()`. Links and images go through `safeHref()`, which only allows same-site paths or `http(s)` addresses.

## Addresses

| Page | Address | Notes |
|---|---|---|
| Listing | `/property/2-bedroom-apartment-for-rent-in-east-legon-accra-rx7k2p9` | The words come from the listing's facts, not its free-text title. Only the reference at the end is read, so `/property/rx7k2p9` and old `/registry/<id>` links still work, and the app moves to the full address. |
| Search pages | `/rent`, `/buy`, `/short-stay`, then `/<city>`, `/<city>/<area>`, and an optional type: `apartments`, `houses`, `rooms`, `studios`, `townhouses`, `hostels`, `commercial`, `warehouses` | Built from live public listings (`services/seoLanding.ts`): counts, price ranges, median price by bedrooms, nearby areas, FAQs. |
| Articles | `/article/<slug>` | |

The two copies of the slug rules must agree: `apps/api/src/services/listings.ts` (`listingSlug`) and `packages/shared/listingTypes.ts` (`listingSlug`, used by the app).

## Rules that protect rankings

- **No thin pages.** A search page with no listings is `noindex` and stays out of the sitemap. It returns 200, so links to it still work. A place with no public listings at all (for any purpose) returns 404, except the main cities (`MAJOR_CITIES`), which always have a page.
- **One address per page.** Every page sets a canonical address. The server and the app must produce the same one; `seo.integration.test.ts` checks the server side. For listings the API also returns the server's title, description and structured data (`seo` in `GET /public/properties/:ref`, built by `listingSeo()`), and the app applies them unchanged.
- **New places work at once.** Search pages read listings from a five-minute cache. Anything that publishes or removes a listing refreshes it (a moderation decision, a report takedown, an owner's edit or deletion, an account closure), and a page that would answer 404 looks again (at most every 30 seconds), so a new neighbourhood's page works as soon as its first listing is approved. A 404 is kept at the CDN for one minute only.
- **Websites are separate.** An agency website (`name.userentos.com` or its own domain) has its own titles, canonical addresses and sitemap. Platform-only extras (search engine verification tags, search pages) apply to RentOS's own hosts only (`OWN_HOSTS` in `seo.ts`).

## Structured data

| Page | Types |
|---|---|
| Listing | `RealEstateListing` with an `Offer` (monthly or nightly price), bedrooms, floor size, amenities; `BreadcrumbList` |
| Search page | `CollectionPage` with an `ItemList` of listings; `BreadcrumbList`; `FAQPage` |
| Article | `BlogPosting`; `BreadcrumbList` |
| Agency website | `RealEstateAgent` |
| Every platform page | `Organization` and `WebSite` with a search box (`index.html`); agency websites replace these with their own |

## Sitemap and IndexNow

- `/sitemap.xml` lists the indexable search pages, every public listing (with up to five photos each) and every published article.
- IndexNow tells Bing (whose index also serves DuckDuckGo and Yahoo), Yandex, Seznam and Naver about changes straight away. Approving a listing submits it and the search pages it appears on; publishing an article submits it and `/blog`. Google does not use IndexNow; it reads the sitemap.
- IndexNow needs `INDEXNOW_KEY` on the API (production only) and the same key served at `https://www.userentos.com/<key>.txt` (`apps/web/public/`). To resubmit every page after a large change, run `node dist/scripts/indexNowSubmitAll.js` as a one-off job. One-off jobs keep no output, so the script exits with an error if the key is missing or any batch was refused.

## Search engine accounts

Set these on Vercel (project `userentos`) to verify ownership. They are added to platform pages only:

| Variable | Where to get it |
|---|---|
| `GOOGLE_SITE_VERIFICATION` | Google Search Console › Add property › URL prefix `https://www.userentos.com/` › HTML tag (the `content` value) |
| `BING_SITE_VERIFICATION` | Bing Webmaster Tools › Add site › HTML meta tag. Bing can also import the site from Search Console. |
| `YANDEX_VERIFICATION` | Yandex Webmaster (optional) |

After verifying, submit `https://www.userentos.com/sitemap.xml` in both tools.

## Changing things

- **Platform page titles:** `PLATFORM_PAGES` in `apps/api/src/services/seo.ts` and `PAGE_SEO` in `apps/web/src/lib/seo.ts`. Keep the two in step.
- **Cities that always have a page:** `MAJOR_CITIES` in `services/seoLanding.ts`.
- **Property type pages:** `TYPE_FACETS` in the same file.
- **Footer "Popular searches":** built from the busiest search pages (`GET /api/seo/popular`), with a fixed list as a fallback (`apps/web/src/lib/popularSearches.ts`).
- **Tests:** `apps/api/src/__tests__/seo.integration.test.ts` (pages, canonicals, sitemap, escaping) and `seo-urls.test.ts` (addresses, safe HTML, IndexNow).
