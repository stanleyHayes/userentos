import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PUBLICLY_VISIBLE_STATUSES, ACTION_TARGET, canTransition } from '../services/propertyReview.js'

const read = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')

describe('what the public can see is defined once', () => {
  it('counts both approved and published as live', () => {
    // TRANSITIONS allows approved -> published, and unsuspend targets
    // 'published'. If only 'approved' were public, every one of those moves
    // would hide the listing.
    expect([...PUBLICLY_VISIBLE_STATUSES].sort()).toEqual(['approved', 'published'])
  })

  it('unsuspending restores a listing to a status the public can see', () => {
    const target = ACTION_TARGET.unsuspend
    expect(canTransition('suspended', target)).toBe(true)
    expect(PUBLICLY_VISIBLE_STATUSES).toContain(target)
  })

  it('the public registry queries the shared list, not a hard-coded status', () => {
    const src = read('routes/publicRegistry.ts')
    expect(src).toContain('PUBLICLY_VISIBLE_STATUSES')
    // The lie this replaces: the list, the detail route and the mapper all
    // said 'approved', so a published listing 404'd on the public site.
    expect(src).not.toMatch(/listingStatus: 'approved'[,\s]*$/m)
  })

  it('sponsorship serving shares that definition rather than keeping a copy', () => {
    const src = read('services/marketplace/sponsorshipServing.ts')
    expect(src).toContain('PUBLICLY_VISIBLE_STATUSES as SERVABLE_LISTING_STATUSES')
    expect(src).not.toMatch(/const SERVABLE_LISTING_STATUSES = \[/)
  })
})

describe('a webhook claim is released when the work throws', () => {
  const src = read('routes/marketplaceWebhooks.ts')

  it('hands the event back so the retry sweep can actually retry', () => {
    // The claim was taken before the work and never released, so a transient
    // failure poisoned the event forever: the catch queued a retry that this
    // same guard then rejected as "already applied".
    const catchBlock = src.slice(src.indexOf('} catch (err) {'))
    expect(catchBlock).toMatch(/\$pull: \{ processedEventIds: eventId \}/)
  })

  it('only releases on a throw, not on a deliberate refusal', () => {
    // An amount mismatch is a permanent decision, already logged as CRITICAL.
    // Releasing it would have the sweep re-refuse it forever.
    const catchBlock = src.slice(src.indexOf('} catch (err) {'))
    expect(catchBlock).toContain('claimedTransactionId')
    const body = src.slice(src.indexOf("if (event.event === 'charge.success')"), src.indexOf('} catch (err) {'))
    expect(body).not.toContain('$pull')
  })
})
