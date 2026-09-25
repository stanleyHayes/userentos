import mongoose from 'mongoose'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BlogPost } from '../models/BlogPost.js'
import { reloadRegulatedFeatures } from '../config/regulatedFeatures.js'
import { seedReviewedReferenceContent } from '../data/seedReferenceContent.js'
import router from '../routes/blog.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
const slugs = ['rentguard-savings-guide', 'rent-dispute-guide']
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('blog posts about regulated services', () => {
  let server: Server
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/blog`
  const seededAt = new Date('2026-08-13T16:14:26Z')

  beforeAll(async () => {
    await mongoose.connect(uri)
    await BlogPost.deleteMany({ slug: { $in: slugs } })
    await BlogPost.collection.insertMany(slugs.map(slug => ({ slug, title: slug, content: `Edited copy of ${slug}`, excerpt: 'x', author: 'RentOS', published: true, platform: true, createdAt: seededAt, updatedAt: new Date('2026-09-01T00:00:00Z') })))
    const app = express(); app.use('/api/blog', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterEach(() => reloadRegulatedFeatures(process.env))
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await BlogPost.deleteMany({ slug: { $in: slugs } })
    await mongoose.disconnect()
  })

  it('tags existing posts with the feature they describe without marking them edited', async () => {
    await seedReviewedReferenceContent()
    const savings = await BlogPost.findOne({ slug: 'rentguard-savings-guide' }).lean()
    expect(savings).toMatchObject({ requiresFeature: 'wallet', content: 'Edited copy of rentguard-savings-guide' })
    expect((savings as unknown as { updatedAt: Date }).updatedAt.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('hides a post about a disabled service from the list and its page, and shows it once offered', async () => {
    reloadRegulatedFeatures({ NODE_ENV: 'production' })
    const hidden = (await (await fetch(base())).json()).data.items.map((p: { slug: string }) => p.slug)
    expect(hidden).toContain('rent-dispute-guide')
    expect(hidden).not.toContain('rentguard-savings-guide')
    expect((await fetch(`${base()}/slug/rentguard-savings-guide`)).status).toBe(404)

    reloadRegulatedFeatures({ NODE_ENV: 'production', REGULATED_FEATURES: 'wallet', REGULATED_BASIS_WALLET: 'licence' })
    expect((await fetch(`${base()}/slug/rentguard-savings-guide`)).status).toBe(200)
  })
})
