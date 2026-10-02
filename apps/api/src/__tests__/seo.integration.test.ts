import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Property } from '../models/Property.js'
import { Storefront } from '../models/Storefront.js'
import { BlogPost } from '../models/BlogPost.js'
import { listingSeo, pageMeta, sitemapXml } from '../services/seo.js'
import { clearLandingCache, publicFacets } from '../services/seoLanding.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

describe.skipIf(!hasTestMongo)('page metadata and sitemaps for crawlers and link previews', () => {
  const owner = new mongoose.Types.ObjectId()
  const tag = String(owner).slice(-8)
  const siteSlug = `seo${tag}`
  const host = `${siteSlug}.userentos.com`
  let ref = ''

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    const property = await Property.create({
      landlordId: String(owner), title: 'Bright 2-bedroom flat in East Legon', description: 'Two bedrooms, two baths, a guarded compound and steady water.',
      type: 'apartment', status: 'available', listingStatus: 'published', listingType: 'rent', rentAmount: 4500, rentDurationMonths: 12, advanceMonths: 6,
      bedrooms: 2, bathrooms: 2, images: ['https://images.example/flat.jpg'], address: { street: 'Hidden street', city: 'Accra', region: 'Greater Accra', neighborhood: 'East Legon' },
    })
    ref = property.listingRef!
    const site = await Storefront.create({ ownerType: 'user', ownerId: String(owner), slug: siteSlug, name: 'Appiah Homes', tagline: 'Family homes across Greater Accra', status: 'active', published: true, branding: { coverUrl: 'https://images.example/cover.jpg' } })
    await BlogPost.create([
      { title: 'How rental prices are changing in Accra', slug: `${tag}-prices`, excerpt: 'Two-bedroom rents rose again.', content: 'Body', author: 'Nana', authorId: String(owner), storefrontId: String(site._id), platform: false, status: 'published', published: true, publishedAt: new Date() },
      { title: 'Deposits explained', slug: `${tag}-deposits`, excerpt: 'What a landlord may keep.', content: 'Body', author: 'RentOS Team', platform: true, status: 'published', published: true, publishedAt: new Date() },
    ])
  })

  afterAll(async () => {
    await Property.deleteMany({ landlordId: String(owner) })
    await Storefront.deleteMany({ ownerId: String(owner) })
    await BlogPost.deleteMany({ slug: new RegExp(`^${tag}-`) })
    await mongoose.disconnect()
  })

  it('describes a listing with its price, place and photo, without its street', async () => {
    const canonical = `https://userentos.com/property/2-bedroom-apartment-for-rent-in-east-legon-accra-${ref.toLowerCase()}`
    const meta = await pageMeta('userentos.com', `/property/${ref.toLowerCase()}`)
    expect(meta).toMatchObject({ status: 200, canonical, image: 'https://images.example/flat.jpg', noindex: false })
    expect(meta!.title).toBe('2-bedroom apartment for rent in East Legon, Accra | RentOS')
    expect(meta!.description).toContain('2-bedroom apartment for rent in East Legon, Accra: GHS 4,500/month')
    expect(JSON.stringify(meta)).not.toContain('Hidden street')
    expect(meta!.jsonLd[0]).toMatchObject({ '@type': 'RealEstateListing', offers: { price: 4500, priceCurrency: 'GHS' }, about: { numberOfBedrooms: 2 } })
    expect(meta!.jsonLd[1]).toMatchObject({ '@type': 'BreadcrumbList' })
    expect((meta!.jsonLd[1] as { itemListElement: { name: string }[] }).itemListElement.map((i) => i.name)).toEqual(['Home', 'For rent', 'Accra', 'East Legon', 'Bright 2-bedroom flat in East Legon'])
    // Readable content for crawlers: the title as the page's heading, the description and links to its search pages.
    expect(meta!.body).toContain('<h1>Bright 2-bedroom flat in East Legon</h1>')
    expect(meta!.body).toContain('Two bedrooms, two baths, a guarded compound and steady water.')
    expect(meta!.body).toContain('href="/rent/accra/east-legon/apartments"')
    // The descriptive address and the short one are the same listing.
    expect((await pageMeta('userentos.com', `/property/2-bedroom-apartment-for-rent-in-east-legon-accra-${ref.toLowerCase()}`))?.canonical).toBe(canonical)
    expect((await pageMeta('userentos.com', `/property/anything-at-all-${ref.toLowerCase()}`))?.canonical).toBe(canonical)
    // The app is given the same title, description and structured data (GET /public/properties/:ref).
    const doc = await Property.findOne({ listingRef: ref }).lean()
    expect(listingSeo(doc!)).toEqual({ title: meta!.title, description: meta!.description, canonical, jsonLd: meta!.jsonLd })
  })

  it('escapes listing text in the content it serves', async () => {
    const property = await Property.create({
      landlordId: String(owner), title: '<script>alert(1)</script> Flat', description: 'Nice <img src=x onerror=alert(1)> place',
      type: 'apartment', status: 'available', listingStatus: 'published', listingType: 'rent', rentAmount: 3000, rentDurationMonths: 12, advanceMonths: 6,
      bedrooms: 1, bathrooms: 1, images: ['javascript:alert(1)'], address: { street: 'x', city: 'Accra', region: 'Greater Accra', neighborhood: 'East Legon' },
    })
    clearLandingCache()
    const meta = await pageMeta('userentos.com', `/property/${property.listingRef!.toLowerCase()}`)
    expect(meta!.body).not.toMatch(/<script>alert|<img src=x|javascript:/)
    expect(meta!.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt; Flat')
    const landing = await pageMeta('userentos.com', '/rent/accra/east-legon')
    expect(landing!.body).not.toMatch(/<script>alert|javascript:/)
    await Property.deleteOne({ _id: property._id })
    clearLandingCache()
  })

  it('builds search pages from the listings: titles, prices, structured data, and noindex when empty', async () => {
    clearLandingCache()
    const area = await pageMeta('userentos.com', '/rent/accra/east-legon')
    expect(area).toMatchObject({ status: 200, noindex: false, canonical: 'https://userentos.com/rent/accra/east-legon', title: 'Houses and apartments for rent in East Legon, Accra | RentOS' })
    expect(area!.jsonLd.map((d) => d['@type'])).toEqual(['CollectionPage', 'BreadcrumbList', 'FAQPage'])
    expect(area!.body).toContain(`/property/2-bedroom-apartment-for-rent-in-east-legon-accra-${ref.toLowerCase()}`)
    expect(area!.body).toContain('<h1>Houses and apartments for rent in East Legon, Accra</h1>')
    expect(area!.description).toMatch(/verified houses and apartments for rent in East Legon, Accra/)

    const type = await pageMeta('userentos.com', '/rent/accra/east-legon/apartments')
    expect(type).toMatchObject({ status: 200, noindex: false, title: 'Apartments for rent in East Legon, Accra | RentOS' })
    expect((await pageMeta('userentos.com', '/rent'))).toMatchObject({ status: 200, noindex: false, title: 'Houses and apartments for rent in Ghana | RentOS' })
    // A real place with nothing listed: a page, kept out of search.
    expect(await pageMeta('userentos.com', '/buy/ho')).toMatchObject({ status: 200, noindex: true })
    // Places and types that do not exist.
    expect(await pageMeta('userentos.com', '/rent/nowhere-town-xyz')).toMatchObject({ status: 404, noindex: true })
    expect(await pageMeta('userentos.com', '/rent/accra/no-such-area-xyz')).toMatchObject({ status: 404, noindex: true })
  })

  it('finds a place straight after a moderation decision, and on its own within 30 seconds', async () => {
    const place = (city: string, neighborhood: string) => Property.create({
      landlordId: String(owner), title: `New in ${neighborhood}`, description: 'Fixture', type: 'house', status: 'available', listingStatus: 'published', listingType: 'rent',
      rentAmount: 2000, rentDurationMonths: 12, advanceMonths: 6, bedrooms: 3, bathrooms: 2, address: { street: 'x', city, region: 'Central', neighborhood },
    })
    await publicFacets()
    await place(`Winneba${tag}`, 'Low Town')
    const path = `/rent/winneba${tag}/low-town`
    // Looked up moments ago, so the place is not looked up again yet...
    expect(await pageMeta('userentos.com', path)).toMatchObject({ status: 404 })
    // ...unless a moderation decision marked the listing facts stale.
    clearLandingCache()
    expect(await pageMeta('userentos.com', path)).toMatchObject({ status: 200, noindex: false })

    await place(`Saltpond${tag}`, 'Old Town')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 31_000)
      // Half a minute on, a page that would answer 404 looks again by itself.
      expect(await pageMeta('userentos.com', `/rent/saltpond${tag}/old-town`)).toMatchObject({ status: 200 })
    } finally {
      vi.useRealTimers()
    }
    clearLandingCache()
  })

  it('loads listing facts once for concurrent pages, keeps the last copy if a reload fails, and leaves static pages alone', async () => {
    clearLandingCache()
    const find = vi.spyOn(Property, 'find')
    try {
      const results = await Promise.all(Array.from({ length: 5 }, () => publicFacets()))
      expect(find).toHaveBeenCalledTimes(1)
      expect(new Set(results).size).toBe(1)
      clearLandingCache()
      find.mockImplementationOnce(() => { throw new Error('database unavailable') })
      expect(await publicFacets()).toBe(results[0])
      // After a failure nothing reloads for 30 seconds, not even a page looking for an unknown place.
      find.mockClear()
      expect(await publicFacets({ maxAge: 30_000 })).toBe(results[0])
      expect(find).not.toHaveBeenCalled()
      find.mockClear()
      expect((await pageMeta('userentos.com', '/privacy'))?.status).toBe(200)
      expect(find).not.toHaveBeenCalled()
    } finally {
      find.mockRestore()
      clearLandingCache()
    }
  })

  it('answers 404 for a listing that is not public', async () => {
    expect(await pageMeta('userentos.com', '/property/zzzzzzz')).toMatchObject({ status: 404, noindex: true })
  })

  it("credits a website's post to the website and points search engines at the original", async () => {
    const meta = await pageMeta('userentos.com', `/article/${tag}-prices`)
    expect(meta).toMatchObject({ type: 'article', canonical: `https://${host}/news/${tag}-prices` })
    expect(meta!.jsonLd[0]).toMatchObject({ '@type': 'BlogPosting', author: { name: 'Appiah Homes', url: `https://${host}` } })
    expect((await pageMeta('userentos.com', `/article/${tag}-deposits`))?.canonical).toBe(`https://userentos.com/article/${tag}-deposits`)
  })

  it("serves a website's own pages on its host, and the same pages under /s/ with the website as canonical", async () => {
    const homeMeta = await pageMeta(host, '/')
    expect(homeMeta).toMatchObject({ title: 'Appiah Homes: Family homes across Greater Accra', canonical: `https://${host}`, image: 'https://images.example/cover.jpg', replaceSiteJsonLd: true, noindex: false })
    expect(homeMeta!.jsonLd[0]).toMatchObject({ '@type': 'RealEstateAgent', name: 'Appiah Homes' })
    expect((await pageMeta(host, '/about'))?.title).toBe('About · Appiah Homes')
    expect((await pageMeta(host, `/news/${tag}-prices`))?.canonical).toBe(`https://${host}/news/${tag}-prices`)
    expect((await pageMeta('userentos.com', `/s/${siteSlug}/about`))).toMatchObject({ canonical: `https://${host}/about`, replaceSiteJsonLd: false })
    // A listing on the website keeps the listing's one canonical address, and links RentOS's search pages absolutely.
    const onSite = await pageMeta(host, `/property/${ref}`)
    expect(onSite?.canonical).toBe(`https://userentos.com/property/2-bedroom-apartment-for-rent-in-east-legon-accra-${ref.toLowerCase()}`)
    expect(onSite?.body).toContain('href="https://userentos.com/rent/accra/east-legon"')
    expect(homeMeta!.body).toContain('<h1>Appiah Homes</h1>')
    // On its own host the website's menu starts at "/"; on the platform, under /s/<slug>, menu included.
    expect(homeMeta!.body).toContain('href="/about"')
    const aboutOnPlatform = (await pageMeta('userentos.com', `/s/${siteSlug}/about`))!.body!
    expect(aboutOnPlatform).toContain(`href="/s/${siteSlug}/properties"`)
    expect(aboutOnPlatform).toContain(`href="/s/${siteSlug}"`)
    expect(aboutOnPlatform).not.toMatch(/href="\/(properties|about|news|contact)?"/)
    const listingOnPlatform = (await pageMeta('userentos.com', `/s/${siteSlug}/property/${ref}`))!.body!
    expect(listingOnPlatform).toContain(`href="/s/${siteSlug}/news"`)
    expect(listingOnPlatform).toContain('href="https://userentos.com/rent/accra/east-legon"')
  })

  it('keeps drafts, unknown hosts and preview deployments out of search', async () => {
    await Storefront.updateOne({ slug: siteSlug }, { $set: { published: false } })
    expect((await pageMeta(host, '/'))?.noindex).toBe(true)
    expect(await sitemapXml(host)).not.toContain('<loc>')
    await Storefront.updateOne({ slug: siteSlug }, { $set: { published: true } })
    expect(await pageMeta('nobody-here.example.com', '/')).toMatchObject({ status: 404, noindex: true })
    // Built-in object names are not website pages.
    expect(await pageMeta(host, '/constructor')).toMatchObject({ status: 404, noindex: true })
    expect((await pageMeta('rentos-git-main.vercel.app', '/blog'))?.noindex).toBe(true)
  })

  it('gives the platform its own pages, public listings and RentOS articles, and each website its own', async () => {
    clearLandingCache()
    const platform = await sitemapXml('userentos.com')
    expect(platform).toContain('<loc>https://userentos.com/blog</loc>')
    expect(platform).toContain(`<loc>https://userentos.com/property/2-bedroom-apartment-for-rent-in-east-legon-accra-${ref.toLowerCase()}</loc>`)
    expect(platform).toContain('<image:loc>https://images.example/flat.jpg</image:loc>')
    for (const path of ['/rent', '/rent/accra', '/rent/accra/east-legon', '/rent/accra/east-legon/apartments']) expect(platform).toContain(`<loc>https://userentos.com${path}</loc>`)
    // Signed-in pages are not public pages.
    expect(platform).not.toContain('<loc>https://userentos.com/properties</loc>')
    expect(platform).not.toContain('<loc>https://userentos.com/login</loc>')
    expect(platform).toContain(`<loc>https://userentos.com/article/${tag}-deposits</loc>`)
    expect(platform).not.toContain(`${tag}-prices`)

    const site = await sitemapXml(host)
    expect(site).toContain(`<loc>https://${host}/</loc>`)
    expect(site).toContain(`<loc>https://${host}/news/${tag}-prices</loc>`)
    expect(site).not.toContain('userentos.com/property')
  })

  it('treats userentos.com and www as the platform even when PUBLIC_BASE_URL names another host', async () => {
    const saved = process.env.PUBLIC_BASE_URL
    process.env.PUBLIC_BASE_URL = 'https://api.userentos.com'
    try {
      for (const own of ['www.userentos.com', 'userentos.com']) {
        const page = await pageMeta(own, '/blog')
        expect(page?.status).not.toBe(404)
        expect(page?.noindex).toBeFalsy()
      }
    } finally {
      if (saved === undefined) delete process.env.PUBLIC_BASE_URL
      else process.env.PUBLIC_BASE_URL = saved
    }
  })

  it('serves the home page with its heading and links to the search pages', async () => {
    const home = await pageMeta('userentos.com', '/')
    expect(home).toMatchObject({ status: 200, title: 'Houses and apartments for rent and sale in Ghana | RentOS', canonical: 'https://userentos.com/' })
    expect(home!.body).toContain('<h1>Houses and apartments to rent and buy in Ghana</h1>')
    expect(home!.body).toContain('href="/rent"')
    expect(home!.body).toContain('Popular searches')
  })

  it('leaves pages it does not know to the browser', async () => {
    expect(await pageMeta('userentos.com', '/dashboard')).toBeNull()
    expect((await pageMeta('userentos.com', '/rental-laws'))?.canonical).toBe('https://userentos.com/rental-laws')
  })
})
