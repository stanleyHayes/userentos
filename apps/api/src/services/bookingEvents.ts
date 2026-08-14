import { getIO } from './socket.js'
import { ServiceBooking } from '../models/ServiceBooking.js'
import { sendPushNotification } from './push.js'
import { logger } from '../utils/logger.js'

interface BookingEventPayload {
  bookingId: string
  type: string
  status?: string
  workerId: string
  requesterId: string
  message: string
}

function getIOInstance() {
  try {
    return getIO()
  } catch {
    return null
  }
}

async function sendBookingPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  try {
    await sendPushNotification(userId, { title, body, data })
  } catch (err) {
    logger.warn(`[BookingEvents] Push failed for ${userId}: ${(err as Error).message}`)
  }
}

export async function emitBookingCreated(booking: InstanceType<typeof ServiceBooking>) {
  const io = getIOInstance()
  if (!io) return

  // Socket rooms & push tokens are keyed by USER id; booking.workerId is a Worker
  // document id. Route worker notifications to the worker's user id.
  const workerUserId = booking.workerUserId
  if (!workerUserId) {
    logger.warn(`[BookingEvents] booking ${booking._id} has no workerUserId — worker will not be notified`)
    return
  }

  const payload: BookingEventPayload = {
    bookingId: booking._id.toString(),
    type: booking.type,
    workerId: booking.workerId,
    requesterId: booking.requesterId,
    message: 'New booking request received',
  }

  // Notify worker via socket
  io.to(`user:${workerUserId}`).emit('booking:created', payload)

  // Notify worker via push
  await sendBookingPush(
    workerUserId,
    'New Booking Request',
    `You have a new ${booking.type} booking request.`,
    { bookingId: booking._id.toString(), type: 'booking:created' },
  )
}

export async function emitBookingUpdated(
  booking: InstanceType<typeof ServiceBooking>,
  changedFields: string[],
) {
  const io = getIOInstance()
  if (!io) return

  // Worker notifications must target the worker's USER id, not the Worker doc id.
  const workerUserId = booking.workerUserId || ''
  const bookingId = booking._id.toString()
  const payload: BookingEventPayload = {
    bookingId,
    type: booking.type,
    status: booking.status,
    workerId: booking.workerId,
    requesterId: booking.requesterId,
    message: '',
  }

  // Determine who to notify based on what changed
  if (changedFields.includes('status')) {
    payload.message = `Booking status updated to ${booking.status}`

    if (booking.status === 'confirmed') {
      // Worker accepted → notify requester
      io.to(`user:${booking.requesterId}`).emit('booking:status_changed', payload)
      await sendBookingPush(
        booking.requesterId,
        'Booking Confirmed',
        `Your ${booking.type} booking has been confirmed by the worker.`,
        { bookingId, type: 'booking:confirmed' },
      )
    } else if (booking.status === 'in_progress') {
      // Worker started → notify requester
      io.to(`user:${booking.requesterId}`).emit('booking:status_changed', payload)
      await sendBookingPush(
        booking.requesterId,
        'Job Started',
        `The worker has started your ${booking.type} job.`,
        { bookingId, type: 'booking:in_progress' },
      )
    } else if (booking.status === 'completed') {
      // Worker completed → notify requester
      io.to(`user:${booking.requesterId}`).emit('booking:status_changed', payload)
      await sendBookingPush(
        booking.requesterId,
        'Job Completed',
        `Your ${booking.type} job has been marked as completed. Please review and pay.`,
        { bookingId, type: 'booking:completed' },
      )
    } else if (booking.status === 'cancelled') {
      // Either party cancelled → notify the other
      const cancellerId = booking.notes[booking.notes.length - 1]?.by || 'unknown'
      const notifyId = cancellerId === workerUserId ? booking.requesterId : workerUserId
      io.to(`user:${notifyId}`).emit('booking:status_changed', payload)
      await sendBookingPush(
        notifyId,
        'Booking Cancelled',
        `A ${booking.type} booking has been cancelled.`,
        { bookingId, type: 'booking:cancelled' },
      )
    }
  }

  if (changedFields.includes('quoteAmount')) {
    payload.message = `Quote received: GHS ${booking.quoteAmount}`
    io.to(`user:${booking.requesterId}`).emit('booking:quoted', payload)
    await sendBookingPush(
      booking.requesterId,
      'Quote Received',
      `The worker has provided a quote of GHS ${booking.quoteAmount} for your ${booking.type} job.`,
      { bookingId, type: 'booking:quoted' },
    )
  }

  if (changedFields.includes('quoteAccepted') && booking.quoteAccepted) {
    payload.message = 'Quote accepted'
    io.to(`user:${workerUserId}`).emit('booking:quote_accepted', payload)
    await sendBookingPush(
      workerUserId,
      'Quote Accepted',
      `Your quote for the ${booking.type} job has been accepted.`,
      { bookingId, type: 'booking:quote_accepted' },
    )
  }

  if (changedFields.includes('note')) {
    payload.message = 'New note added'
    // Notify the other party
    const lastNote = booking.notes[booking.notes.length - 1]
    const notifyId = lastNote?.by === workerUserId ? booking.requesterId : workerUserId
    io.to(`user:${notifyId}`).emit('booking:note_added', payload)
  }

  if (changedFields.includes('rating')) {
    payload.message = 'You received a review'
    io.to(`user:${workerUserId}`).emit('booking:reviewed', payload)
    await sendBookingPush(
      workerUserId,
      'New Review',
      `You received a ${booking.rating}-star review for your ${booking.type} job.`,
      { bookingId, type: 'booking:reviewed' },
    )
  }
}
