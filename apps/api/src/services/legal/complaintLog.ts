/**
 * Recording complaints and their classifications, and reviewing them.
 *
 * Fire-and-forget on the write path, like recordValuation: the abuse checker
 * is a read, and failing to store the training row must never turn a useful
 * answer into an error for someone who is worried about their housing.
 */
import { ComplaintLog, type IComplaintLog } from '../../models/ComplaintLog.js'
import { logger } from '../../utils/logger.js'
import { redactComplaint } from './redact.js'

export interface RecordComplaintParams {
  text: string
  predictedLabels: string[]
  scores: { label: string; probability: number; threshold: number }[]
  abstained: boolean
  source: IComplaintLog['source']
  modelVersion?: string
  advanceVerdict?: IComplaintLog['advanceVerdict']
  advanceMonths?: number
}

/** Redact, store, never throw. Returns the row id when one was written. */
export async function recordComplaint(params: RecordComplaintParams): Promise<string | null> {
  try {
    const { text, removed } = redactComplaint(params.text)
    if (!text) return null

    const doc = await ComplaintLog.create({
      text,
      redacted: removed,
      predictedLabels: params.predictedLabels,
      scores: params.scores,
      abstained: params.abstained,
      source: params.source,
      modelVersion: params.modelVersion,
      advanceVerdict: params.advanceVerdict,
      advanceMonths: params.advanceMonths,
    })
    return String(doc._id)
  } catch (err) {
    logger.warn(`[complaintLog] failed to record complaint: ${(err as Error).message}`)
    return null
  }
}

export interface ComplaintPage {
  items: IComplaintLog[]
  total: number
  page: number
  pages: number
}

/**
 * The review queue.
 *
 * Sorted by createdAt with an _id tiebreaker — createdAt alone is not a total
 * order, and two rows written in the same millisecond can otherwise swap
 * between pages, so a reviewer sees one twice and never sees the other.
 */
export async function listComplaints(options: {
  page?: number
  limit?: number
  unreviewedOnly?: boolean
  label?: string
  abstainedOnly?: boolean
} = {}): Promise<ComplaintPage> {
  const page = Math.max(1, options.page ?? 1)
  const limit = Math.min(100, Math.max(1, options.limit ?? 25))

  const query: Record<string, unknown> = {}
  if (options.unreviewedOnly) query.reviewedAt = { $exists: false }
  if (options.label) query.predictedLabels = options.label
  if (options.abstainedOnly) query.abstained = true

  const [items, total] = await Promise.all([
    ComplaintLog.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IComplaintLog[]>(),
    ComplaintLog.countDocuments(query),
  ])

  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) }
}

/** Record a reviewer's verdict — the ground truth the corpus is rebuilt from. */
export async function reviewComplaint(
  id: string,
  reviewedLabels: string[],
  reviewerId: string,
  note?: string,
): Promise<IComplaintLog | null> {
  return ComplaintLog.findByIdAndUpdate(
    id,
    {
      $set: {
        reviewedLabels,
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
        ...(note ? { reviewNote: note } : {}),
      },
    },
    { returnDocument: 'after' },
  ).lean<IComplaintLog>()
}

/**
 * Labels the model is deliberately not asked to predict.
 *
 * Whether a rent advance is lawful is arithmetic against s.25, decided in
 * rentLaw.ts, and the abuse-check route skips this label when reading the
 * model's output. Scoring the model's recall on it therefore measures a
 * design decision, not a weakness — the first scorecard reported recall 50%
 * against a reviewer who correctly labelled both, when the model had done
 * exactly what it should.
 */
export const STATUTORY_LABELS = new Set(['excessive_advance'])

export interface ClassifierScorecard {
  reviewed: number
  /** Excluded from precision/recall — decided by statute, not the model. */
  statutoryLabels: string[]
  precision: number
  recall: number
  /** Reviewed rows the model called a violation where the reviewer found none. */
  falseAccusations: number
  /** Of the reviewed rows the reviewer marked lawful. */
  lawfulReviewed: number
  perLabel: Record<string, { predicted: number; actual: number; correct: number }>
}

/**
 * Score the classifier against reviewer verdicts.
 *
 * This is the number that replaces the one in scripts/train_legal.py. That one
 * is measured against authored text; this one is measured against what people
 * actually wrote, which is the only measure that says whether the feature
 * works.
 */
export async function scoreClassifier(since?: Date): Promise<ClassifierScorecard> {
  const query: Record<string, unknown> = { reviewedAt: { $exists: true } }
  if (since) query.createdAt = { $gte: since }

  const rows = await ComplaintLog.find(query).limit(10_000).lean<IComplaintLog[]>()

  let tp = 0
  let fp = 0
  let fn = 0
  let falseAccusations = 0
  let lawfulReviewed = 0
  const perLabel: ClassifierScorecard['perLabel'] = {}

  for (const row of rows) {
    const predicted = new Set(row.predictedLabels ?? [])
    const actual = new Set(row.reviewedLabels ?? [])

    if (actual.size === 0) {
      lawfulReviewed++
      const modelClaims = [...predicted].filter(l => !STATUTORY_LABELS.has(l))
      if (modelClaims.length > 0) falseAccusations++
    }

    for (const label of new Set([...predicted, ...actual])) {
      perLabel[label] ??= { predicted: 0, actual: 0, correct: 0 }
      if (predicted.has(label)) perLabel[label].predicted++
      if (actual.has(label)) perLabel[label].actual++

      // Counted per label for visibility, excluded from the model's
      // precision and recall: the statute decides these, not the model.
      if (STATUTORY_LABELS.has(label)) {
        if (predicted.has(label) && actual.has(label)) perLabel[label].correct++
        continue
      }

      if (predicted.has(label) && actual.has(label)) {
        perLabel[label].correct++
        tp++
      } else if (predicted.has(label)) {
        fp++
      } else {
        fn++
      }
    }
  }

  return {
    reviewed: rows.length,
    statutoryLabels: [...STATUTORY_LABELS],
    precision: tp + fp > 0 ? Math.round((tp / (tp + fp)) * 1000) / 10 : 0,
    recall: tp + fn > 0 ? Math.round((tp / (tp + fn)) * 1000) / 10 : 0,
    falseAccusations,
    lawfulReviewed,
    perLabel,
  }
}
