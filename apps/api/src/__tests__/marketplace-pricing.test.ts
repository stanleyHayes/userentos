import { describe, it, expect, vi, beforeEach } from 'vitest'

const findById = vi.fn()
vi.mock('../models/ServiceBooking.js', () => ({ ServiceBooking: { findById } }))

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
      ok: true, amount: 400, sellerId: 'worker1', description: 'repair booking', bookingId: BK,
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

  it('refuses sponsorship — it is platform revenue, not a sale between users', async () => {
    // This route pays a SELLER's subaccount and takes a platform cut. There is
    // no seller, and the buyer must not be paid their own money.
    const q = await resolveQuote({ purpose: 'sponsorship', buyerId: 'buyer1' })
    expect(q).toMatchObject({ ok: false, status: 400 })
    expect((q as { reason: string }).reason).toContain('platform')
  })

  it('only advertises purposes it can actually price', () => {
    expect([...PRICEABLE_PURPOSES]).toEqual(['service_booking'])
  })

  it('reads a malformed id as not found rather than leaking a CastError', async () => {
    await expect(resolveQuote({ purpose: 'service_booking', buyerId: 'b', bookingId: 'not-an-id' }))
      .resolves.toEqual({ ok: false, reason: 'That booking does not exist.', status: 404 })
    expect(findById).not.toHaveBeenCalled()
  })
})
