import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The prediction/outcome flywheel (ML roadmap, checklist items 4 and 7).
 *
 * The model cannot currently be evaluated at all: it trains on synthetic
 * listings, so its R² measures how well a line fits the formula that made
 * them. These tests cover the machinery that replaces that with a measurement
 * against rents that really happened.
 */

interface Row {
  _id: string
  modelVersion: string
  modelSource: string
  context: string
  input: Record<string, unknown>
  predictedRent: number
  baselineRent?: number
  confidenceLow?: number
  confidenceHigh?: number
  suppliedFields?: number
  totalFields?: number
  imputedFields?: string[]
  r2AtPrediction?: number
  sampleCountAtPrediction?: number
  requestedBy?: string
  propertyId?: string
  observedRent?: number
  observedAt?: Date
  observedSource?: string
  createdAt: Date
}

let rows: Row[] = []
let nextId = 1
let createShouldThrow = false

/** Minimal in-memory stand-in for the Mongoose model under test. */
vi.mock('../models/ValuationLog.js', () => ({
  ValuationLog: {
    create: vi.fn(async (doc: Partial<Row>) => {
      if (createShouldThrow) throw new Error('database unavailable')
      const row = { ...doc, _id: String(nextId++), createdAt: doc.createdAt ?? new Date() } as Row
      rows.push(row)
      return row
    }),
    updateMany: vi.fn(async (
      filter: { propertyId?: string; createdAt?: { $gte?: Date } },
      update: { $set: Partial<Row> },
    ) => {
      const since = filter.createdAt?.$gte
      const matched = rows.filter(r =>
        r.propertyId === filter.propertyId
        && r.observedRent === undefined
        && (!since || r.createdAt >= since))
      for (const r of matched) Object.assign(r, update.$set)
      return { modifiedCount: matched.length }
    }),
    countDocuments: vi.fn(async (filter: Record<string, unknown>) =>
      Object.keys(filter).length === 0
        ? rows.length
        : rows.filter(r => typeof r.observedRent === 'number' && r.observedRent > 0).length),
    find: vi.fn(() => ({
      sort: () => ({
        limit: () => ({
          lean: async () => rows.filter(r => typeof r.observedRent === 'number' && r.observedRent > 0),
        }),
      }),
    })),
  },
}))

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { recordValuation, attachObservedRent, scoreValuations, valuationLogSummary } =
  await import('../services/ml/valuationLog.js')

function result(predictedRent: number, extra: Record<string, unknown> = {}) {
  return {
    predictedRent,
    baselineRent: 2000,
    confidenceInterval: { low: Math.round(predictedRent * 0.9), high: Math.round(predictedRent * 1.1) },
    dataQuality: { suppliedFields: 18, totalFields: 18, imputedFields: [] as string[] },
    modelVersion: 'v1',
    r2Score: 0.83,
    sampleCount: 2500,
    ...extra,
  }
}

beforeEach(() => {
  rows = []
  nextId = 1
  createShouldThrow = false
})

describe('recording valuations', () => {
  it('captures the inputs, the output and the data quality', async () => {
    const id = await recordValuation({
      input: { city: 'Accra', bedrooms: 2 },
      result: result(2500, {
        dataQuality: { suppliedFields: 12, totalFields: 18, imputedFields: ['yearBuilt', 'floor'] },
      }),
      modelSource: 'local',
      context: 'pricing_engine',
      requestedBy: 'user1',
      propertyId: 'prop1',
    })

    expect(id).toBe('1')
    expect(rows[0]).toMatchObject({
      modelVersion: 'v1',
      modelSource: 'local',
      context: 'pricing_engine',
      predictedRent: 2500,
      baselineRent: 2000,
      suppliedFields: 12,
      totalFields: 18,
      imputedFields: ['yearBuilt', 'floor'],
      r2AtPrediction: 0.83,
      requestedBy: 'user1',
      propertyId: 'prop1',
    })
  })

  it('never throws — a valuation is a read, and the audit row is not the answer', async () => {
    createShouldThrow = true
    await expect(recordValuation({
      input: {}, result: result(2500), modelSource: 'local', context: 'api',
    })).resolves.toBeNull()
  })
})

describe('attaching what actually happened', () => {
  async function seed(propertyId: string, predicted: number, createdAt = new Date()) {
    await recordValuation({
      input: {}, result: result(predicted), modelSource: 'local', context: 'pricing_engine', propertyId,
    })
    rows[rows.length - 1].createdAt = createdAt
  }

  it('attaches an observed rent to that property\'s valuations', async () => {
    await seed('prop1', 2500)
    await seed('prop1', 2600)
    await seed('prop2', 9000)

    const updated = await attachObservedRent('prop1', 2400, 'agreement_signed')

    expect(updated).toBe(2)
    expect(rows.filter(r => r.propertyId === 'prop1').every(r => r.observedRent === 2400)).toBe(true)
    expect(rows.find(r => r.propertyId === 'prop2')?.observedRent).toBeUndefined()
  })

  it('never overwrites an outcome already recorded', async () => {
    await seed('prop1', 2500)
    await attachObservedRent('prop1', 2400, 'listing_published')
    await attachObservedRent('prop1', 9999, 'agreement_signed')

    expect(rows[0].observedRent).toBe(2400)
    expect(rows[0].observedSource).toBe('listing_published')
  })

  it('ignores outcomes far older than the prediction', async () => {
    // A rent observed a year after the estimate is not evidence about the
    // estimate — the market moved.
    await seed('prop1', 2500, new Date(Date.now() - 400 * 24 * 60 * 60 * 1000))
    expect(await attachObservedRent('prop1', 2400, 'agreement_signed')).toBe(0)
    expect(rows[0].observedRent).toBeUndefined()
  })

  it('rejects a nonsensical outcome instead of poisoning the dataset', async () => {
    await seed('prop1', 2500)
    expect(await attachObservedRent('prop1', 0, 'agreement_signed')).toBe(0)
    expect(await attachObservedRent('prop1', -5, 'agreement_signed')).toBe(0)
    expect(await attachObservedRent('', 2400, 'agreement_signed')).toBe(0)
  })
})

describe('scoring against outcomes', () => {
  async function scored(predicted: number, observed: number, extra: Record<string, unknown> = {}) {
    await recordValuation({
      input: {}, result: result(predicted, extra), modelSource: 'local', context: 'pricing_engine',
      propertyId: `p${nextId}`,
    })
    const row = rows[rows.length - 1]
    row.observedRent = observed
    row.observedAt = new Date()
  }

  it('reports error, bias and interval coverage per model version', async () => {
    await scored(1100, 1000) // +10%
    await scored(900, 1000) //  -10%
    await scored(1200, 1000) // +20%

    const [score] = await scoreValuations()

    expect(score.modelVersion).toBe('v1')
    expect(score.scored).toBe(3)
    expect(score.mape).toBeCloseTo(13.3, 1)
    expect(score.medianApe).toBeCloseTo(10, 1)
    // Positive bias: the model over-prices on balance.
    expect(score.bias).toBeCloseTo(6.7, 1)
    // ±10% intervals: only [990, 1210] contains 1000. [810, 990] and
    // [1080, 1320] both miss it, so 1 of 3. A real model whose coverage sits
    // this far under its nominal band is claiming more certainty than it has.
    expect(score.intervalCoverage).toBeCloseTo(33.3, 1)
  })

  it('separates estimates built on complete inputs from imputed ones', async () => {
    // The question this exists to answer: does a sparse request give a
    // materially worse estimate, and by how much?
    await scored(1050, 1000)
    await scored(1500, 1000, {
      dataQuality: { suppliedFields: 5, totalFields: 18, imputedFields: ['yearBuilt', 'floorArea'] },
    })

    const [score] = await scoreValuations()

    expect(score.mapeCompleteInputs).toBeCloseTo(5, 1)
    expect(score.mapeImputedInputs).toBeCloseTo(50, 1)
    expect(score.mapeImputedInputs as number).toBeGreaterThan(score.mapeCompleteInputs as number)
  })

  it('groups separate model versions so two can be compared on the same outcomes', async () => {
    await scored(1100, 1000)
    await scored(1050, 1000, { modelVersion: 'v2' })

    const scores = await scoreValuations()
    const byVersion = Object.fromEntries(scores.map(s => [s.modelVersion, s]))

    expect(Object.keys(byVersion).sort()).toEqual(['v1', 'v2'])
    expect(byVersion.v2.mape).toBeLessThan(byVersion.v1.mape)
  })

  it('returns nothing rather than a fake score when no outcome exists', async () => {
    await recordValuation({
      input: {}, result: result(2500), modelSource: 'local', context: 'pricing_engine',
    })
    expect(await scoreValuations()).toEqual([])
  })
})

describe('summary', () => {
  it('reports how much ground truth exists so far', async () => {
    await recordValuation({ input: {}, result: result(2500), modelSource: 'local', context: 'api', propertyId: 'p1' })
    await recordValuation({ input: {}, result: result(2500), modelSource: 'local', context: 'api', propertyId: 'p2' })
    await attachObservedRent('p1', 2400, 'agreement_signed')

    expect(await valuationLogSummary()).toEqual({
      total: 2,
      scored: 1,
      awaitingOutcome: 1,
      coveragePercent: 50,
    })
  })
})
