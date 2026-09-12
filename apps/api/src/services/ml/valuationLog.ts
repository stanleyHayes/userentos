/**
 * Recording valuations, attaching what actually happened, and scoring the
 * difference (ML roadmap, checklist items 4 and 7).
 *
 * Recording is deliberately fire-and-forget: a valuation is a read, and a
 * failure to write the audit row must never turn a successful prediction into
 * an error for the user. Every entry point here swallows its own failures and
 * logs them.
 */
import { ValuationLog, type IValuationLog } from '../../models/ValuationLog.js'
import { logger } from '../../utils/logger.js'

/** Shape shared by the local model and the ML service responses. */
export interface ValuationResultLike {
  predictedRent: number
  baselineRent?: number
  confidenceInterval?: { low: number; high: number }
  dataQuality?: {
    suppliedFields: number
    totalFields: number
    imputedFields: string[]
  }
  modelVersion?: string
  r2Score?: number
  sampleCount?: number
}

export interface RecordValuationParams {
  input: Record<string, unknown>
  result: ValuationResultLike
  modelSource: IValuationLog['modelSource']
  context: IValuationLog['context']
  requestedBy?: string
  propertyId?: string
}

/**
 * Write one valuation down. Never throws.
 *
 * Returns the row id when it was written, so a caller that wants to attach an
 * outcome immediately can, but nothing depends on the return value.
 */
export async function recordValuation(params: RecordValuationParams): Promise<string | null> {
  try {
    const { input, result, modelSource, context, requestedBy, propertyId } = params
    const doc = await ValuationLog.create({
      modelVersion: result.modelVersion || 'unknown',
      modelSource,
      context,
      input,
      predictedRent: result.predictedRent,
      baselineRent: result.baselineRent,
      confidenceLow: result.confidenceInterval?.low,
      confidenceHigh: result.confidenceInterval?.high,
      suppliedFields: result.dataQuality?.suppliedFields,
      totalFields: result.dataQuality?.totalFields,
      imputedFields: result.dataQuality?.imputedFields,
      r2AtPrediction: result.r2Score,
      sampleCountAtPrediction: result.sampleCount,
      requestedBy,
      propertyId,
    })
    return String(doc._id)
  } catch (err) {
    logger.warn(`[valuationLog] failed to record valuation: ${(err as Error).message}`)
    return null
  }
}

/**
 * How long after a valuation an outcome still counts as that valuation's.
 *
 * A rent observed a year after the estimate is not evidence about the
 * estimate; the market moved. Ninety days is generous for a listing that was
 * priced and then published, and short enough that the pairing stays
 * meaningful.
 */
const OUTCOME_WINDOW_MS = 1000 * 60 * 60 * 24 * 90

/**
 * Attach the rent a property actually went for to the valuations that
 * predicted it. Never throws.
 *
 * Only unscored rows inside the window are touched, and an existing outcome
 * is never overwritten — the first observation is the one that was closest in
 * time to the prediction.
 */
export async function attachObservedRent(
  propertyId: string,
  observedRent: number,
  source: NonNullable<IValuationLog['observedSource']>,
): Promise<number> {
  if (!propertyId || !Number.isFinite(observedRent) || observedRent <= 0) return 0
  try {
    const res = await ValuationLog.updateMany(
      {
        propertyId,
        observedRent: { $exists: false },
        createdAt: { $gte: new Date(Date.now() - OUTCOME_WINDOW_MS) },
      },
      { $set: { observedRent, observedAt: new Date(), observedSource: source } },
    )
    if (res.modifiedCount > 0) {
      logger.info(
        `[valuationLog] attached observed rent ${observedRent} to `
        + `${res.modifiedCount} valuation(s) for property ${propertyId} (${source})`,
      )
    }
    return res.modifiedCount
  } catch (err) {
    logger.warn(`[valuationLog] failed to attach observed rent: ${(err as Error).message}`)
    return 0
  }
}

export interface ModelScore {
  modelVersion: string
  /** Valuations with a known outcome — the only ones that can be scored. */
  scored: number
  /** Mean absolute percentage error. */
  mape: number
  /** Median absolute percentage error — robust to a few wild outliers. */
  medianApe: number
  /** Mean signed percentage error: positive means the model over-prices. */
  bias: number
  /**
   * Share of outcomes that fell inside the predicted confidence interval.
   * A well-calibrated interval lands near its nominal coverage; far below
   * means the model states more certainty than it has.
   */
  intervalCoverage: number
  /** Same, restricted to valuations where every field was supplied. */
  mapeCompleteInputs: number | null
  /** Same, where at least one field had to be imputed. */
  mapeImputedInputs: number | null
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[idx]
}

function mapeOf(rows: IValuationLog[]): number | null {
  if (rows.length === 0) return null
  const total = rows.reduce(
    (s, r) => s + Math.abs(r.predictedRent - (r.observedRent as number)) / (r.observedRent as number),
    0,
  )
  return Math.round((total / rows.length) * 1000) / 10
}

/**
 * Score the logged valuations that have outcomes, grouped by model version.
 *
 * This is what makes "did that change help?" answerable. Two versions can be
 * compared on the same real outcomes instead of on an R² computed against the
 * synthetic data each was trained on.
 */
export async function scoreValuations(options: { since?: Date; limit?: number } = {}): Promise<ModelScore[]> {
  const { since, limit = 10_000 } = options
  const query: Record<string, unknown> = { observedRent: { $exists: true, $gt: 0 } }
  if (since) query.createdAt = { $gte: since }

  const rows = await ValuationLog.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean<IValuationLog[]>()

  const byVersion = new Map<string, IValuationLog[]>()
  for (const row of rows) {
    const list = byVersion.get(row.modelVersion) ?? []
    list.push(row)
    byVersion.set(row.modelVersion, list)
  }

  const scores: ModelScore[] = []
  for (const [modelVersion, group] of byVersion) {
    const apes = group
      .map(r => Math.abs(r.predictedRent - (r.observedRent as number)) / (r.observedRent as number))
      .sort((a, b) => a - b)
    const signed = group.reduce(
      (s, r) => s + (r.predictedRent - (r.observedRent as number)) / (r.observedRent as number),
      0,
    ) / group.length

    const withInterval = group.filter(
      r => typeof r.confidenceLow === 'number' && typeof r.confidenceHigh === 'number',
    )
    const covered = withInterval.filter(
      r => (r.observedRent as number) >= (r.confidenceLow as number)
        && (r.observedRent as number) <= (r.confidenceHigh as number),
    ).length

    const complete = group.filter(r => (r.imputedFields?.length ?? 0) === 0)
    const imputed = group.filter(r => (r.imputedFields?.length ?? 0) > 0)

    scores.push({
      modelVersion,
      scored: group.length,
      mape: mapeOf(group) as number,
      medianApe: Math.round(percentile(apes, 0.5) * 1000) / 10,
      bias: Math.round(signed * 1000) / 10,
      intervalCoverage: withInterval.length > 0
        ? Math.round((covered / withInterval.length) * 1000) / 10
        : 0,
      mapeCompleteInputs: mapeOf(complete),
      mapeImputedInputs: mapeOf(imputed),
    })
  }

  return scores.sort((a, b) => b.scored - a.scored)
}

/** Headline counts for the admin view: how much ground truth exists yet. */
export async function valuationLogSummary(): Promise<{
  total: number
  scored: number
  awaitingOutcome: number
  coveragePercent: number
}> {
  const [total, scored] = await Promise.all([
    ValuationLog.countDocuments({}),
    ValuationLog.countDocuments({ observedRent: { $exists: true, $gt: 0 } }),
  ])
  return {
    total,
    scored,
    awaitingOutcome: total - scored,
    coveragePercent: total > 0 ? Math.round((scored / total) * 1000) / 10 : 0,
  }
}

export interface ValuationPage {
  items: IValuationLog[]
  total: number
  page: number
  pages: number
}

/**
 * Recent valuations for the admin view (roadmap checklist item 6: "an admin
 * view showing model inputs, output, source dates and override/review
 * history").
 *
 * Sorted by createdAt with an _id tiebreaker — createdAt alone is not a total
 * order, and two rows written in the same millisecond would otherwise be able
 * to swap places between pages, duplicating one and hiding the other.
 */
export async function listValuations(options: {
  page?: number
  limit?: number
  withOutcomeOnly?: boolean
  propertyId?: string
} = {}): Promise<ValuationPage> {
  const page = Math.max(1, options.page ?? 1)
  const limit = Math.min(100, Math.max(1, options.limit ?? 25))

  const query: Record<string, unknown> = {}
  if (options.withOutcomeOnly) query.observedRent = { $exists: true, $gt: 0 }
  if (options.propertyId) query.propertyId = options.propertyId

  const [items, total] = await Promise.all([
    ValuationLog.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IValuationLog[]>(),
    ValuationLog.countDocuments(query),
  ])

  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) }
}
