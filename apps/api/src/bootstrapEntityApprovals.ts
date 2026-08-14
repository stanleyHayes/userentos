import { Worker } from './models/Worker.js'
import { Business } from './models/Business.js'
import { logger } from './utils/logger.js'

/**
 * One-time backfill: worker/business profiles created before the entity
 * approval workflow existed have no approvalStatus field and would otherwise
 * be treated as 'pending' (hidden from the directory, blocked from bookings).
 * Grandfather them as approved. Runs once per database via runBootstrap.
 */
export async function bootstrapEntityApprovals() {
  const [workers, businesses] = await Promise.all([
    Worker.updateMany(
      { approvalStatus: { $exists: false } },
      { $set: { approvalStatus: 'approved' } },
    ),
    Business.updateMany(
      { approvalStatus: { $exists: false } },
      { $set: { approvalStatus: 'approved' } },
    ),
  ])
  if (workers.modifiedCount > 0 || businesses.modifiedCount > 0) {
    logger.info(
      `Backfilled approvalStatus='approved' for ${workers.modifiedCount} legacy worker(s) and ${businesses.modifiedCount} legacy business(es).`,
    )
  }
}
