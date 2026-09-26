/**
 * One-off index migration for payment uniqueness. Safe to re-run.
 *
 * Builds, before dropping anything they replace:
 *  - payments:  unique {tenantId, idempotencyKey} (replaces the global
 *               idempotencyKey_1, which let one payer's key collide with
 *               another's and answer 500), unique {openCollectionKey}, and
 *               unique {collectionSource, providerRef}
 *  - payouts:   unique {providerRef} (replaces the non-unique providerRef_1)
 *  - marketplacetransactions: unique {openOrderKey}
 * plus the new sweep indexes. Production autoIndex may be off, so these are
 * not left to model compilation.
 *
 * A build fails, and nothing is dropped, if existing data already holds a
 * duplicate; the error names the index. (Checked read-only on 26 Sep 2026:
 * no duplicate providerRef or idempotencyKey values in production.)
 *
 * Usage (no shell needed, e.g. a Render one-off job):
 *   node dist/scripts/syncPaymentIndexes.js
 * or locally: npx tsx --env-file=.env src/scripts/syncPaymentIndexes.ts
 */
import mongoose, { type Model } from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { Payment } from '../models/Payment.js'
import { Payout } from '../models/Payout.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'

/** Indexes the new ones replace, by collection. */
const LEGACY: Array<{ model: Model<never>; name: string }> = [
  { model: Payment as unknown as Model<never>, name: 'idempotencyKey_1' },
  { model: Payout as unknown as Model<never>, name: 'providerRef_1' },
]

async function indexNames(model: Model<never>): Promise<string[]> {
  try {
    return (await model.collection.indexes()).map((index) => String(index.name))
  } catch (err) {
    // A collection that does not exist yet has no indexes.
    if ((err as { codeName?: string }).codeName === 'NamespaceNotFound') return []
    throw err
  }
}

async function dropLegacy(model: Model<never>, name: string, dropped: string[]) {
  if (!(await indexNames(model)).includes(name)) return
  await model.collection.dropIndex(name)
  dropped.push(`${model.collection.collectionName}.${name}`)
}

export async function syncPaymentIndexes(): Promise<{ built: string[]; dropped: string[] }> {
  const dropped: string[] = []
  for (const model of [Payment, Payout, MarketplaceTransaction] as unknown as Model<never>[]) {
    // An index of ours that exists under the same name with different options
    // (an earlier definition) is rebuilt; indexes the schema does not name are
    // never touched here.
    const ours = new Set(model.schema.indexes().map(([, options]: [unknown, { name?: string }]) => options.name).filter(Boolean))
    const existing = await indexNames(model)
    const { toDrop } = await model.diffIndexes()
    for (const name of toDrop) {
      if (ours.has(name) && existing.includes(name)) await dropLegacy(model, name, dropped)
    }
    try {
      await model.createIndexes()
    } catch (err) {
      // An old index with the same key but different options blocks the new
      // one (providerRef_1 on payouts): drop it, then build again.
      const code = (err as { code?: number }).code
      if (code !== 85 && code !== 86) throw err
      for (const legacy of LEGACY.filter((l) => l.model === model)) await dropLegacy(model, legacy.name, dropped)
      await model.createIndexes()
    }
  }
  // Only now, with the replacements built, remove what they replace.
  for (const legacy of LEGACY) await dropLegacy(legacy.model, legacy.name, dropped)

  const built = [
    ...(await indexNames(Payment as unknown as Model<never>)).map((n) => `payments.${n}`),
    ...(await indexNames(Payout as unknown as Model<never>)).map((n) => `payouts.${n}`),
    ...(await indexNames(MarketplaceTransaction as unknown as Model<never>)).map((n) => `marketplacetransactions.${n}`),
  ]
  return { built, dropped }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri)
  try {
    const result = await syncPaymentIndexes()
    console.log(`Payment indexes in place (${result.built.length}). Dropped: ${result.dropped.length ? result.dropped.join(', ') : 'none'}.`)
  } finally {
    await mongoose.disconnect()
  }
}
