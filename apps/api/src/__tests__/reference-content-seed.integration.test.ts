import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BlogPost } from '../models/BlogPost.js'
import { BLOG_POSTS } from '../data/referenceData.js'
import { seedReviewedReferenceContent } from '../data/seedReferenceContent.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
const slugs = ['rent-advance-cap', 'micro-loans-rent-gap', 'investing-rent-savings']
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('reviewed reference content seeding', () => {
  const seededAt = new Date('2026-08-13T16:14:26Z')
  beforeAll(async () => {
    await mongoose.connect(uri)
    await BlogPost.deleteMany({ slug: { $in: slugs } })
    const legacy = (slug: string, updatedAt: Date) => ({ slug, title: `Legacy ${slug}`, content: `An older seed version of ${slug}.`, excerpt: 'x', author: 'RentOS', published: true, createdAt: seededAt, updatedAt })
    await BlogPost.collection.insertMany([
      legacy('rent-advance-cap', seededAt),
      legacy('micro-loans-rent-gap', new Date(seededAt.getTime() + 1500)),
      legacy('investing-rent-savings', new Date('2026-09-01T09:00:00Z')),
    ])
  })
  afterAll(async () => {
    await BlogPost.deleteMany({ slug: { $in: slugs } })
    await mongoose.disconnect()
  })

  it('corrects or withdraws never-edited seed copies of any older version, and leaves edited ones alone', async () => {
    await seedReviewedReferenceContent()
    const bySlug = Object.fromEntries((await BlogPost.find({ slug: { $in: slugs } }).lean()).map(p => [p.slug, p]))
    expect(bySlug['rent-advance-cap'].content).toBe(BLOG_POSTS.find(p => p.slug === 'rent-advance-cap')!.content)
    expect(bySlug['micro-loans-rent-gap']).toMatchObject({ published: false, status: 'archived' })
    expect(bySlug['investing-rent-savings']).toMatchObject({ published: true, content: 'An older seed version of investing-rent-savings.' })
  })
})
