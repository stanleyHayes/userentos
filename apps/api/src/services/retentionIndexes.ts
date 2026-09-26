import type { Model } from 'mongoose'

/**
 * Compare the TTL indexes each schema declares with the ones the database
 * actually has. TTL retention only happens if the index exists with the right
 * expireAfterSeconds — Mongoose builds indexes at boot and swallows a failed
 * build, and never changes an existing index when a period changes.
 * Read-only: it reports, it does not fix (collMod or rebuild by hand).
 */
export interface TtlIndexIssue {
  model: string
  key: string
  expectedSeconds: number
  actualSeconds?: number
  problem: 'missing' | 'wrong_period' | 'not_ttl'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>

export async function verifyTtlIndexes(models: Iterable<AnyModel>): Promise<TtlIndexIssue[]> {
  const issues: TtlIndexIssue[] = []
  for (const model of models) {
    const expected = (model.schema.indexes() as Array<[Record<string, unknown>, { expireAfterSeconds?: number } | undefined]>)
      .filter(([, options]) => options?.expireAfterSeconds !== undefined)
    if (expected.length === 0) continue
    const actual = await model.collection.indexes().catch((err: { code?: number }) => {
      // A collection that does not exist yet has no indexes at all.
      if (err.code === 26) return []
      throw err
    })
    for (const [keys, options] of expected) {
      const key = JSON.stringify(keys)
      const found = actual.find((index) => JSON.stringify(index.key) === key)
      const expectedSeconds = options!.expireAfterSeconds as number
      if (!found) issues.push({ model: model.modelName, key, expectedSeconds, problem: 'missing' })
      else if (found.expireAfterSeconds === undefined) issues.push({ model: model.modelName, key, expectedSeconds, problem: 'not_ttl' })
      else if (found.expireAfterSeconds !== expectedSeconds) issues.push({ model: model.modelName, key, expectedSeconds, actualSeconds: found.expireAfterSeconds, problem: 'wrong_period' })
    }
  }
  return issues
}
