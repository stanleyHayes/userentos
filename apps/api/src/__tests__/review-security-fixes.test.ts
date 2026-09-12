import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')
const read = (p: string) => readFileSync(join(SRC, p), 'utf8')

/*
 * These are guard tests, not unit tests.
 *
 * Both bugs below were a missing line on an unauthenticated or
 * privilege-bearing path, and both are only reachable with a database and a
 * live provider — so the cheapest durable protection is to assert the guard is
 * still present in the source. If someone removes it, this fails loudly and
 * names the vulnerability rather than leaving it to be rediscovered.
 */

describe('invitation resend cannot escalate privilege', () => {
  const src = read('routes/invitations.ts')

  it('runs the same delegation guard the create route runs', () => {
    // Resend mints a FRESH raw token and returns it to the caller. Without
    // canDelegate, anyone holding users:invite could resend a super_admin
    // invitation someone else created and accept it themselves.
    const resend = src.slice(src.indexOf("router.post('/:id/resend'"))
    expect(resend).toContain('canDelegate(')
  })

  it('refuses with 403 rather than continuing when delegation fails', () => {
    const resend = src.slice(src.indexOf("router.post('/:id/resend'"))
    const guard = resend.slice(resend.indexOf('canDelegate('), resend.indexOf('crypto.randomBytes'))
    expect(guard).toMatch(/error\(res,\s*delegationError,\s*403\)/)
  })

  it('checks delegation BEFORE minting the token', () => {
    const resend = src.slice(src.indexOf("router.post('/:id/resend'"))
    expect(resend.indexOf('canDelegate(')).toBeLessThan(resend.indexOf('crypto.randomBytes'))
  })
})

describe('marketplace checkout cannot be told its own discount', () => {
  const src = read('routes/marketplacePayments.ts')

  it('does not accept a discount from the request body', () => {
    // The route is unauthenticated (guest checkout), so a client-supplied
    // discountAmount let anyone buy a GHS 1000 item for one cedi.
    const schema = src.slice(src.indexOf('const initSchema'), src.indexOf('})', src.indexOf('const initSchema')))
    expect(schema).not.toMatch(/^\s*discountAmount:/m)
  })

  it('derives the discount by validating the coupon server-side', () => {
    expect(src).toContain('validateCoupon(')
    const init = src.slice(src.indexOf("router.post('/initialize'"))
    expect(init.indexOf('validateCoupon(')).toBeLessThan(init.indexOf('calculateSplit('))
  })

  it('refuses an invalid coupon instead of silently charging full price', () => {
    const init = src.slice(src.indexOf("router.post('/initialize'"))
    expect(init).toMatch(/if \(!coupon\.valid\)/)
  })

  it('feeds the split the derived discount, never the input', () => {
    const init = src.slice(src.indexOf("router.post('/initialize'"))
    const call = init.slice(init.indexOf('calculateSplit('), init.indexOf('const reference'))
    expect(call).toContain('discountAmount,')
    expect(call).not.toContain('input.discountAmount')
  })
})

describe('publishing cannot walk past the review state machine', () => {
  const src = read('controllers/propertyController.ts')

  it('checks the transition before moving to pending_review', () => {
    const publish = src.slice(src.indexOf('  publish: async'), src.indexOf('  review: async'))
    expect(publish).toContain('canTransition(')
    // Match the assignment itself: the explanatory comment above it also
    // contains the phrase, and matching that would pass no matter the order.
    expect(publish.indexOf('canTransition(')).toBeLessThan(publish.indexOf("property.listingStatus = 'pending_review'"))
  })

  it('refuses with 409 like the submit route does', () => {
    const publish = src.slice(src.indexOf('  publish: async'), src.indexOf('  review: async'))
    expect(publish).toMatch(/cannot be submitted for review`?,\s*409\)/)
  })

  it('a suspended listing is not resubmittable, per the transition table', async () => {
    // The moderation guarantee this protects: an abuse takedown suspends a
    // listing, and its owner must not be able to push it back into the queue.
    const { canTransition } = await import('../services/propertyReview.js')
    expect(canTransition('suspended', 'pending_review')).toBe(false)
    expect(canTransition('draft', 'pending_review')).toBe(true)
    expect(canTransition('changes_requested', 'pending_review')).toBe(true)
  })
})

describe('GDPR hard-delete actually deletes the user', () => {
  const src = read('services/scheduler.ts')

  it('does not use a find-family method, which the soft-delete hook rewrites', () => {
    const block = src.slice(src.indexOf('gdpr-delete'))
    // pre(/^find/) appends deletedAt:{$exists:false}, which can never match a
    // user selected BECAUSE deletedAt is set — the purge silently did nothing.
    expect(block).not.toContain('User.findByIdAndDelete')
    expect(block).not.toContain('User.findOneAndDelete')
  })

  it('deletes with the deletedAt precondition restated', () => {
    const block = src.slice(src.indexOf('gdpr-delete'))
    expect(block).toMatch(/User\.deleteOne\(\{ _id: uid, deletedAt: \{ \$lt: cutoff \} \}\)/)
  })

  it('reports when the purge matched nothing rather than claiming success', () => {
    const block = src.slice(src.indexOf('gdpr-delete'))
    expect(block).toMatch(/deletedCount === 0/)
  })
})
