import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Property } from '../models/Property.js'
import { Storefront } from '../models/Storefront.js'
import { BlogPost } from '../models/BlogPost.js'
import { pageMeta, sitemapXml } from '../services/seo.js'
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
    const meta = await pageMeta('userentos.com', `/property/${ref.toLowerCase()}`)
    expect(meta).toMatchObject({ status: 200, canonical: `https://userentos.com/property/${ref.toLowerCase()}`, image: 'https://images.example/flat.jpg', noindex: false })
    expect(meta!.title).toBe('Bright 2-bedroom flat in East Legon: Apartment for rent in Accra | RentOS')
    expect(meta!.description).toContain('GH₵ 4,500/month, 2 bedrooms')
    expect(JSON.stringify(meta)).not.toContain('Hidden street')
    expect(meta!.jsonLd[0]).toMatchObject({ '@type': 'RealEstateListing', offers: { price: 4500, priceCurrency: 'GHS' } })
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
    // A listing on the website keeps the listing's one canonical address.
    expect((await pageMeta(host, `/property/${ref}`))?.canonical).toBe(`https://userentos.com/property/${ref.toLowerCase()}`)
  })

  it('keeps drafts, unknown hosts and preview deployments out of search', async () => {
    await Storefront.updateOne({ slug: siteSlug }, { $set: { published: false } })
    expect((await pageMeta(host, '/'))?.noindex).toBe(true)
    expect(await sitemapXml(host)).not.toContain('<loc>')
    await Storefront.updateOne({ slug: siteSlug }, { $set: { published: true } })
    expect(await pageMeta('nobody-here.example.com', '/')).toMatchObject({ status: 404, noindex: true })
    expect((await pageMeta('rentos-git-main.vercel.app', '/blog'))?.noindex).toBe(true)
  })

  it('gives the platform its own pages, public listings and RentOS articles, and each website its own', async () => {
    const platform = await sitemapXml('userentos.com')
    expect(platform).toContain('<loc>https://userentos.com/blog</loc>')
    expect(platform).toContain(`<loc>https://userentos.com/property/${ref.toLowerCase()}</loc>`)
    expect(platform).toContain(`<loc>https://userentos.com/article/${tag}-deposits</loc>`)
    expect(platform).not.toContain(`${tag}-prices`)

    const site = await sitemapXml(host)
    expect(site).toContain(`<loc>https://${host}/</loc>`)
    expect(site).toContain(`<loc>https://${host}/news/${tag}-prices</loc>`)
    expect(site).not.toContain('userentos.com/property')
  })

  it('leaves pages it does not know to the browser', async () => {
    expect(await pageMeta('userentos.com', '/dashboard')).toBeNull()
    expect((await pageMeta('userentos.com', '/rental-laws'))?.canonical).toBe('https://userentos.com/rental-laws')
  })
})
