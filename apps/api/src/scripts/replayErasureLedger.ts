/**
 * Re-apply every recorded erasure to the database MONGO_URI points at.
 *
 * Run it against a restored backup BEFORE the restored copy takes traffic
 * (docs/compliance/backup-restore.md); keep running it until it reports
 * failed: 0. Safe to re-run: erasures that already hold change nothing.
 *
 * Usage (Render one-off job, no shell needed): node dist/scripts/replayErasureLedger.js
 * Locally: npx tsx --env-file=.env src/scripts/replayErasureLedger.ts
 */
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { replayErasureLedger } from '../services/erasureReplay.js'
import { closeErasureLedger, warnIfErasureLedgerShared } from '../services/erasureLedger.js'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri)
  warnIfErasureLedgerShared(config.mongoUri)
  try {
    const summary = await replayErasureLedger()
    console.log(JSON.stringify(summary))
    process.exitCode = summary.failed === 0 ? 0 : 1
  } finally {
    await closeErasureLedger()
    await mongoose.disconnect()
  }
}
