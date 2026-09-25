import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'

/*
 * Reference data is seeded into production. It used to state law that the
 * compliance checker contradicts (a flat 6-month advance cap "for all
 * residential properties" vs s.25(5)'s one month for monthly tenancies),
 * invent rules (30-day deposit return, 24-hour inspection notice under
 * "S.15"), claim e-signatures are "legally binding and tamper-proof", and
 * promote T-bills and loans with made-up rates.
 */

const legalFindOne = vi.fn()
const legalUpdateOne = vi.fn().mockResolvedValue({})
const legalDeleteOne = vi.fn().mockResolvedValue({})
const blogFindOne = vi.fn()
const blogUpdateOne = vi.fn().mockResolvedValue({})
const chain = (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => ({ select: () => ({ lean: () => fn(...args) }) })
vi.mock('../models/LegalArticle.js', () => ({ LegalArticle: { findOne: chain(legalFindOne), updateOne: legalUpdateOne, deleteOne: legalDeleteOne } }))
vi.mock('../models/BlogPost.js', () => ({ BlogPost: { findOne: chain(blogFindOne), updateOne: blogUpdateOne } }))

const { LEGAL_ARTICLES, BLOG_POSTS, SUBSCRIPTION_PACKAGES, SUPERSEDED_SEED_CONTENT, reviewedOnly } = await import('../data/referenceData.js')
const { seedReviewedReferenceContent } = await import('../data/seedReferenceContent.js')
const { RENT_LAW } = await import('../services/legal/rentLaw.js')

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const allText = (item: object) => Object.values(item).filter((v) => typeof v === 'string').join('\n')

describe('reference content agrees with services/legal/rentLaw.ts', () => {
  it('the advance article states both statutory limits with the s.25(5) citation', () => {
    const advance = LEGAL_ARTICLES.find((a) => a.title === 'Rent Advance Limits')!
    expect(advance.lawReference).toBe(RENT_LAW.monthlyAdvanceCitation)
    expect(advance.content).toMatch(new RegExp(`more than (six|${RENT_LAW.maxAdvanceMonths}) months`))
    expect(advance.content).toMatch(/monthly \(or shorter\) tenancy, the limit is one month/)
  })

  it('cites only sections the verified source knows', () => {
    const known = new Set<string>([
      'Act 220', 'Rent Act, 1963 (Act 220)',
      RENT_LAW.monthlyAdvanceCitation, RENT_LAW.advanceCitation, RENT_LAW.evictionCitation,
      RENT_LAW.receiptCitation, RENT_LAW.maintenanceCitation,
    ])
    for (const article of LEGAL_ARTICLES) expect(known, article.title).toContain(article.lawReference)
  })

  const BANNED: [RegExp, string][] = [
    [/for all residential properties/i, 'contradicts the one-month limit for monthly tenancies'],
    [/Amendment \(2024\)/, 'no such amendment in the verified source'],
    [/within 30 days|30 days of move-out/i, 'no statutory deposit-return deadline in the source'],
    [/24 hours notice|24-hour notice/i, 'no statutory inspection notice period in the source'],
    [/\bS\.(8|14|15)\b/, 'invented section numbers'],
    [/legally binding|tamper-proof/i, 'enforceability is not guaranteed'],
    [/verified badge/i, 'no such badge for agreements'],
    [/over \d+% of|\b80%/i, 'fabricated statistics'],
    [/treasury bills?|government bonds?|micro-?loans?|\d+(\.\d+)?% annual|\d+-\d+%/i, 'financial promotion'],
    [/GHS 20,000|completely free|Barnes Road/i, 'unverified figures and addresses'],
    [/from your mobile money to your savings plan/i, 'auto-debit uses the RentOS wallet'],
    [/API access|Dedicated account manager|Bulk operations|Advanced analytics|Featured listings/i, 'plan benefits the code does not deliver'],
  ]
  it.each([
    ...LEGAL_ARTICLES.map((a) => [`article: ${a.title}`, a] as const),
    ...BLOG_POSTS.map((p) => [`post: ${p.slug}`, p] as const),
    ...SUBSCRIPTION_PACKAGES.map((p) => [`plan: ${p.slug}`, { ...p, benefits: p.benefits.join('\n') }] as const),
  ])('%s has no unverifiable claims', (_label, item) => {
    const text = allText(item)
    for (const [pattern, why] of BANNED) expect(text, why).not.toMatch(pattern)
  })

  it('the loan and investment promotions are gone', () => {
    const slugs = BLOG_POSTS.map((p) => p.slug)
    expect(slugs).not.toContain('investing-rent-savings')
    expect(slugs).not.toContain('micro-loans-rent-gap')
  })
})

describe('production seeds reviewed content only', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    legalFindOne.mockResolvedValue(null)
    blogFindOne.mockResolvedValue(null)
  })

  it('reviewedOnly drops unreviewed items and strips the flag', () => {
    const out = reviewedOnly([{ reviewed: true, title: 'a' }, { reviewed: false, title: 'b' }])
    expect(out).toEqual([{ title: 'a' }])
  })

  it('inserts only reviewed items, without the review flag', async () => {
    const result = await seedReviewedReferenceContent()
    expect(result.articles.inserted).toBe(LEGAL_ARTICLES.filter((a) => a.reviewed).length)
    expect(result.posts.inserted).toBe(BLOG_POSTS.filter((p) => p.reviewed).length)
    for (const [, update] of legalUpdateOne.mock.calls) expect((update as { $setOnInsert: object }).$setOnInsert).not.toHaveProperty('reviewed')
  })

  it('corrects an untouched copy of an earlier seed version, and leaves an edited one alone', async () => {
    const saved = SUPERSEDED_SEED_CONTENT.legalArticles['Rent Advance Limits']
    SUPERSEDED_SEED_CONTENT.legalArticles['Rent Advance Limits'] = sha256('old seed text')
    try {
      legalFindOne.mockImplementation(async (q: { title: string }) => q.title === 'Rent Advance Limits' ? { _id: 'a1', content: 'old seed text' } : { _id: 'x', content: 'current' })
      let result = await seedReviewedReferenceContent()
      expect(result.articles.corrected).toBe(1)
      expect(legalUpdateOne).toHaveBeenCalledWith({ _id: 'a1' }, { $set: expect.objectContaining({ lawReference: RENT_LAW.monthlyAdvanceCitation }) })

      vi.clearAllMocks()
      legalFindOne.mockImplementation(async (q: { title: string }) => q.title === 'Rent Advance Limits' ? { _id: 'a1', content: 'an editor rewrote this' } : { _id: 'x', content: 'current' })
      blogFindOne.mockResolvedValue({ _id: 'p', content: 'current' })
      result = await seedReviewedReferenceContent()
      expect(result.articles.corrected).toBe(0)
      expect(legalUpdateOne).not.toHaveBeenCalled()
    } finally {
      SUPERSEDED_SEED_CONTENT.legalArticles['Rent Advance Limits'] = saved
    }
  })

  it('unpublishes an untouched copy of a retracted post, but not an edited one', async () => {
    const saved = SUPERSEDED_SEED_CONTENT.blogPosts['micro-loans-rent-gap']
    SUPERSEDED_SEED_CONTENT.blogPosts['micro-loans-rent-gap'] = sha256('old promo')
    try {
      blogFindOne.mockImplementation(async (q: { slug: string }) => q.slug === 'micro-loans-rent-gap' ? { _id: 'm1', content: 'old promo' } : null)
      let result = await seedReviewedReferenceContent()
      expect(result.posts.withdrawn).toBe(1)
      expect(blogUpdateOne).toHaveBeenCalledWith({ _id: 'm1' }, { $set: { published: false, status: 'archived' } })

      vi.clearAllMocks()
      blogFindOne.mockImplementation(async (q: { slug: string }) => q.slug === 'micro-loans-rent-gap' ? { _id: 'm1', content: 'edited by the team' } : null)
      result = await seedReviewedReferenceContent()
      expect(result.posts.withdrawn).toBe(0)
    } finally {
      SUPERSEDED_SEED_CONTENT.blogPosts['micro-loans-rent-gap'] = saved
    }
  })
})
