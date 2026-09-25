import { ServiceBooking } from '../models/ServiceBooking.js'
import { Worker } from '../models/Worker.js'

/**
 * A worker's rating and review count, from every rated booking a moderator has
 * not removed. Shared by the booking route (a new rating) and moderation (a
 * removal), so a removed review stops counting the moment it is removed.
 */
export async function recomputeWorkerRating(workerId: string): Promise<void> {
  const rated = await ServiceBooking.find({ workerId, rating: { $gt: 0 }, reviewRemoved: { $ne: true } }).select('rating').lean()
  const count = rated.length
  const avg = count ? rated.reduce((s, b) => s + (b.rating || 0), 0) / count : 0
  await Worker.findByIdAndUpdate(workerId, { $set: { rating: Math.round(avg * 10) / 10, reviewCount: count } })
}
