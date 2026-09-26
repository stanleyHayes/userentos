/**
 * Re-apply every recorded erasure, then the retention purge, to a database.
 *
 * After a backup restore, run it against the restored copy BEFORE that copy
 * takes traffic (docs/compliance/backup-restore.md), naming the copy with
 * RESTORE_MONGO_URI or --mongo-uri=<uri>; keep running it until it exits 0.
 * The live service's MONGO_URI never has to change for this, and the hosting
 * provider is not called: custom domains are live state the restore did not
 * roll back (see HostOptions in services/accountClosure.ts). The erasure
 * ledger is read from ERASURE_LEDGER_MONGO_URI when set, else from the copy.
 *
 * Without either, it runs against MONGO_URI — the live database, as the
 * daily job does. Safe to re-run: erasures that already hold change nothing.
 *
 * Usage (Render one-off job, no shell needed): node dist/scripts/replayErasureLedger.js
 * Locally: RESTORE_MONGO_URI=<restored copy> npx tsx --env-file=.env src/scripts/replayErasureLedger.ts
 */
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { replayErasureLedger } from '../services/erasureReplay.js'
import { runRetentionPurge } from '../services/retentionPurge.js'
import { closeErasureLedger, warnIfErasureLedgerShared } from '../services/erasureLedger.js'

/** The restored copy to replay onto, if one was named. */
export function restoreTarget(argv: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env): string | null {
  const flag = argv.find((arg) => arg.startsWith('--mongo-uri='))
  return flag?.slice('--mongo-uri='.length) || env.RESTORE_MONGO_URI || null
}

/** The replay, then the retention purge, on the connected database. */
export async function replayOntoConnectedDatabase(restored: boolean) {
  const replay = await replayErasureLedger({ contactHost: !restored })
  // A restore also brings back what the scheduled purges removed since the
  // backup: expired applications, enquiries, profile-access requests, audit rows.
  const purge = await runRetentionPurge().then(
    (rules) => ({ failed: false, rules }),
    (err: Error) => ({ failed: true, error: err.message }),
  )
  return { target: restored ? 'restored copy' : 'MONGO_URI', replay, purge, ok: replay.failed === 0 && !purge.failed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const restored = restoreTarget()
  const uri = restored ?? config.mongoUri
  await mongoose.connect(uri)
  warnIfErasureLedgerShared(uri)
  try {
    const result = await replayOntoConnectedDatabase(restored !== null)
    console.log(JSON.stringify(result))
    process.exitCode = result.ok ? 0 : 1
  } finally {
    await closeErasureLedger()
    await mongoose.disconnect()
  }
}
