/**
 * What a marketplace payment is allowed to charge (spec §8).
 *
 * The checkout route used to take `amount` from the request body. Even
 * authenticated, that lets a buyer name their own price — POST amount: 1 for a
 * GHS 1000 job — and the seller is credited from that same figure, so the
 * seller absorbs the difference. Validating the DISCOUNT does not help while
 * the gross is still the caller's to choose.
 *
 * The fix is not a cleverer guard: the server has to already know what is being
 * bought. Every purpose below resolves its price from a record the server owns,
 * and a purpose with no price source is REFUSED. That refusal is the point — an
 * unpriceable purchase should fail loudly at the boundary rather than quietly
 * settle for whatever was sent.
 *
 * Adding something new to sell means adding a resolver here. That friction is
 * deliberate: this is the one place that decides what money may be collected
 * for, and how much.
 */
import { isValidObjectId } from 'mongoose'
import { ServiceBooking } from '../../models/ServiceBooking.js'

export interface QuoteRequest {
  purpose: string
  /** The authenticated buyer. A quote is always resolved for someone. */
  buyerId: string
  bookingId?: string
}

export type Quote =
  | { ok: true; amount: number; sellerId: string; description: string; bookingId?: string }
  | { ok: false; reason: string; status: number }

/** The purposes the server can price. Anything else cannot be paid for here. */
export const PRICEABLE_PURPOSES = ['service_booking'] as const

/**
 * A completed service booking, priced at the quote the worker gave and the
 * requester accepted.
 *
 * This is a real order: two parties already agreed the figure, and it is
 * recorded. finalCost wins over quoteAmount because a worker may revise on
 * completion — and that revision goes through the bookings route, which only
 * the worker or an admin may write.
 */
async function quoteServiceBooking(req: QuoteRequest): Promise<Quote> {
  if (!req.bookingId) {
    return { ok: false, reason: 'A service payment needs the booking it is paying for.', status: 400 }
  }

  // A malformed id must read as "not found", not as a raw Mongoose CastError
  // echoed back to the caller.
  if (!isValidObjectId(req.bookingId)) {
    return { ok: false, reason: 'That booking does not exist.', status: 404 }
  }

  const booking = await ServiceBooking.findById(req.bookingId).lean()
  // Same 404 for "missing" and "not yours": a different message would let a
  // caller probe which booking ids exist.
  if (!booking || booking.requesterId !== req.buyerId) {
    return { ok: false, reason: 'That booking does not exist.', status: 404 }
  }

  if (booking.paymentStatus === 'paid') {
    return { ok: false, reason: 'This booking is already paid.', status: 409 }
  }
  if (!booking.workerUserId) {
    return { ok: false, reason: 'This booking has no worker to pay yet.', status: 409 }
  }
  if (!booking.quoteAccepted) {
    return { ok: false, reason: 'Accept the quote before paying for this booking.', status: 409 }
  }

  const amount = booking.finalCost ?? booking.quoteAmount
  if (!amount || amount <= 0) {
    return { ok: false, reason: 'This booking has no agreed price to charge.', status: 409 }
  }

  return {
    ok: true,
    amount,
    sellerId: booking.workerUserId,
    description: `${booking.type} booking`,
    bookingId: String(booking._id),
  }
}

export async function resolveQuote(req: QuoteRequest): Promise<Quote> {
  switch (req.purpose) {
    case 'service_booking':
      return quoteServiceBooking(req)

    case 'sponsorship':
      // Sponsorship is platform revenue, not a sale between two users. This
      // route pays a SELLER's Paystack subaccount and takes a platform cut;
      // there is no seller, and the buyer must not be paid their own money.
      // It needs a plain charge to the platform, which does not exist yet.
      return {
        ok: false,
        reason: 'Sponsorship is billed by the platform and cannot be paid through seller checkout.',
        status: 400,
      }

    default:
      return { ok: false, reason: `"${req.purpose}" is not something that can be paid for here.`, status: 400 }
  }
}
