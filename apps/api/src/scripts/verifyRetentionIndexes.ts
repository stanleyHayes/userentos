/**
 * Read-only check that every TTL index the retention schedule relies on
 * exists in the database with the right period (including the erasure
 * ledger on its own connection). Prints the problems as JSON and exits 1 if
 * there are any. Record the output in COMPLIANCE_AUDIT.md after running it
 * against production.
 *
 * Usage (Render one-off job): node dist/scripts/verifyRetentionIndexes.js
 * Locally: npx tsx --env-file=.env src/scripts/verifyRetentionIndexes.ts
 */
import mongoose from 'mongoose'
import { readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { verifyTtlIndexes } from '../services/retentionIndexes.js'
import { erasureLedger, closeErasureLedger } from '../services/erasureLedger.js'

/** Register every model (works from src/ under tsx and from dist/). */
export async function loadAllModels(): Promise<void> {
  const dir = new URL('../models/', import.meta.url)
  for (const file of readdirSync(fileURLToPath(dir))) {
    if (/\.(js|ts)$/.test(file) && !file.endsWith('.d.ts') && !file.startsWith('seed.')) await import(new URL(file, dir).href)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri)
  try {
    await loadAllModels()
    const ledger = erasureLedger()
    const models = [...Object.values(mongoose.models).filter((model) => model.modelName !== 'ErasureLedger' || model === ledger), ledger]
    const issues = await verifyTtlIndexes(new Set(models))
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), issues }, null, 2))
    process.exitCode = issues.length === 0 ? 0 : 1
  } finally {
    await closeErasureLedger()
    await mongoose.disconnect()
  }
}
