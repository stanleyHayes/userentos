import { describe, it, expect, vi, beforeEach } from 'vitest'

const findById = vi.fn()
vi.mock('../models/ServiceBooking.js', () => ({ ServiceBooking: { findById } }))

const sponsorshipFindById = vi.fn()
vi.mock('../models/Sponsorship.js', () => ({ Sponsorship: { findById: sponsorshipFindById } }))

const { resolveQuote, PRICEABLE_PURPOSES } = await import('../services/marketplace/pricing.js')

const BK = '6aa4699041cd5dd00132cfa1'

const lean = (doc: unknown) => ({ lean: () => Promise.resolve(doc) })

const booking = (o: Record<string, unknown> = {}) => ({
  _id: BK,
  requesterId: 'buyer1',
  workerUserId: 'worker1',
  type: 'repair',
  quoteAccepted: true,
  quoteAmount: 400,
  paymentStatus: 'pending',
  ...o,
})

const ask = (o: Record<string, unknown> = {}) =>
  resolveQuote({ purpose: 'service_booking', buyerId: 'buyer1', bookingId: BK, ...o })

describe('the server prices the purchase (spec §8)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('takes the amount from the accepted quote, not from the caller', async () => {
    findById.mockReturnValue(lean(booking()))
    await expect(ask()).resolves.toEqual({
      ok: true, payee: 'seller', amount: 400, sellerId: 'worker1',
      description: 'repair booking', bookingId: BK,
    })
  })

  it('prefers a revised final cost over the original quote', async () => {
    findById.mockReturnValue(lean(booking({ quoteAmount: 400, finalCost: 550 })))
    const q = await ask()
    expect(q).toMatchObject({ ok: true, amount: 550 })
  })

  it('names the worker as payee — the caller cannot nominate who is paid', async () => {
    findById.mockReturnValue(lean(booking({ workerUserId: 'someone-else' })))
    const q = await ask()
    expect(q).toMatchObject({ ok: true, sellerId: 'someone-else' })
  })

  it("refuses another buyer's booking, indistinguishably from a missing one", async () => {
    findById.mockReturnValue(lean(booking({ requesterId: 'someone-else' })))
    // A different message here would let a caller probe which ids exist.
    await expect(ask()).resolves.toEqual({ ok: false, reason: 'That booking does not exist.', status: 404 })
  })

  it('refuses a booking that does not exist', async () => {
    findById.mockReturnValue(lean(null))
    await expect(ask()).resolves.toMatchObject({ ok: false, status: 404 })
  })

  it('refuses to charge twice for the same booking', async () => {
    findById.mockReturnValue(lean(booking({ paymentStatus: 'paid' })))
    await expect(ask()).resolves.toMatchObject({ ok: false, status: 409 })
  })

  it('refuses until the quote has been accepted', async () => {
    findById.mockReturnValue(lean(booking({ quoteAccepted: false })))
    await expect(ask()).resolves.toMatchObject({ ok: false, status: 409, reason: expect.stringContaining('Accept the quote') })
  })

  it('refuses a booking with no agreed price', async () => {
    findById.mockReturnValue(lean(booking({ quoteAmount: undefined, finalCost: undefined })))
    await expect(ask()).resolves.toMatchObject({ ok: false, status: 409 })
  })

  it('refuses a zero price rather than starting a free charge', async () => {
    findById.mockReturnValue(lean(booking({ quoteAmount: 0 })))
    await expect(ask()).resolves.toMatchObject({ ok: false, status: 409 })
  })

  it('needs to be told which order it is pricing', async () => {
    await expect(ask({ bookingId: undefined })).resolves.toMatchObject({ ok: false, status: 400 })
  })
})

describe('unpriceable purposes are refused, not trusted', () => {
  it('refuses a purpose with no price source', async () => {
    await expect(resolveQuote({ purpose: 'marketplace', buyerId: 'buyer1' }))
      .resolves.toMatchObject({ ok: false, status: 400 })
  })

  it('still needs to know WHICH campaign a sponsorship pays for', async () => {
    // Sponsorship is now priceable, but the price comes from the campaign
    // record. Without an id there is nothing to read it from, and the amount
    // must never fall back to the caller's.
    const q = await resolveQuote({ purpose: 'sponsorship', buyerId: 'buyer1' })
    expect(q).toMatchObject({ ok: false, status: 400 })
  })

  it('only advertises purposes it can actually price', () => {
    expect([...PRICEABLE_PURPOSES]).toEqual(['service_booking', 'sponsorship'])
  })

  it('reads a malformed id as not found rather than leaking a CastError', async () => {
    await expect(resolveQuote({ purpose: 'service_booking', buyerId: 'b', bookingId: 'not-an-id' }))
      .resolves.toEqual({ ok: false, reason: 'That booking does not exist.', status: 404 })
    expect(findById).not.toHaveBeenCalled()
  })
})


describe('sponsorship is platform revenue, priced from the campaign (spec §9)', () => {
  const SP = '6aa4699041cd5dd00132cfb2'

  const campaign = (o: Record<string, unknown> = {}) => ({
    _id: SP,
    ownerId: 'buyer1',
    placement: 'search_top',
    spend: 250,
    status: 'pending_payment',
    ...o,
  })

  const buy = (o: Record<string, unknown> = {}) =>
    resolveQuote({ purpose: 'sponsorship', buyerId: 'buyer1', sponsorshipId: SP, ...o })

  beforeEach(() => {
    sponsorshipFindById.mockReset()
  })

  it('can now be paid for at all', async () => {
    // Campaigns were created pending_payment and settlement already knew how
    // to activate them, but no route could charge for one — so every campaign
    // sat unpaid forever.
    sponsorshipFindById.mockReturnValue(lean(campaign()))
    await expect(buy()).resolves.toEqual({
      ok: true,
      payee: 'platform',
      amount: 250,
      description: 'Sponsorship campaign search_top',
      sponsorshipId: SP,
    })
  })

  it('names no seller — there is nobody to split with', async () => {
    sponsorshipFindById.mockReturnValue(lean(campaign()))
    const quote = await buy()
    expect(quote).not.toHaveProperty('sellerId')
  })

  it('takes the price from the campaign, never from the caller', async () => {
    sponsorshipFindById.mockReturnValue(lean(campaign({ spend: 1200 })))
    await expect(buy({ amount: 1 })).resolves.toMatchObject({ amount: 1200 })
  })

  it('refuses a campaign belonging to someone else, as a 404', async () => {
    // Same answer as "missing", so a caller cannot probe which ids exist.
    sponsorshipFindById.mockReturnValue(lean(campaign({ ownerId: 'someone-else' })))
    await expect(buy()).resolves.toEqual({
      ok: false, reason: 'That campaign does not exist.', status: 404,
    })
  })

  it('refuses a campaign that is not awaiting payment', async () => {
    // Without this, paying twice for an active campaign is possible.
    for (const status of ['active', 'cancelled', 'expired', 'paused']) {
      sponsorshipFindById.mockReturnValue(lean(campaign({ status })))
      const quote = await buy()
      expect(quote).toMatchObject({ ok: false, status: 409 })
      expect((quote as { reason: string }).reason).toContain(status)
    }
  })

  it('refuses a campaign with no price', async () => {
    sponsorshipFindById.mockReturnValue(lean(campaign({ spend: 0 })))
    await expect(buy()).resolves.toMatchObject({ ok: false, status: 409 })
  })

  it('reads a malformed id as not found rather than leaking a CastError', async () => {
    await expect(resolveQuote({ purpose: 'sponsorship', buyerId: 'b', sponsorshipId: 'nope' }))
      .resolves.toEqual({ ok: false, reason: 'That campaign does not exist.', status: 404 })
    expect(sponsorshipFindById).not.toHaveBeenCalled()
  })
})
