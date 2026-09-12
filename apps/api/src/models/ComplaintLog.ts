import mongoose, { Schema, type Document } from 'mongoose'

/**
 * Redacted rental complaints and what the classifier made of them.
 *
 * The complaint classifier is trained on AUTHORED data — phrasings we
 * imagined, not phrasings people used. That ceiling cannot be raised by
 * writing more examples; it needs real ones. This is the collection point,
 * and the same flywheel ValuationLog provides for the pricing model.
 *
 * Two properties are deliberate.
 *
 * REDACTED ON THE WAY IN. The source is a public, unauthenticated form where
 * people name their landlord, their street and their phone number. Only the
 * shape of the complaint is kept; see services/legal/redact.ts.
 *
 * NO USER LINKAGE. There is no userId field, and none should be added. The
 * endpoint is anonymous, people use it precisely because it is, and a housing
 * dispute tied to a named person is exactly the record this must not become.
 */
export interface IComplaintLog extends Document {
  /** The complaint with identifiers removed. */
  text: string
  /** Counts of what redaction removed, by kind — never the values. */
  redacted: Record<string, number>

  /** Labels the classifier predicted above threshold. */
  predictedLabels: string[]
  /** Every label with its calibrated probability, for threshold analysis. */
  scores: { label: string; probability: number; threshold: number }[]
  /** True when the text carried too little signal to assert anything. */
  abstained: boolean
  /** Which layers answered. */
  source: 'model+statute' | 'keywords+statute'
  modelVersion?: string

  /** What the statute concluded about any advance mentioned. */
  advanceVerdict?: 'violation' | 'lawful' | 'unclear'
  advanceMonths?: number

  /**
   * Ground truth, added by a reviewer. Until this is set the row is a
   * prediction with nothing to check it against.
   */
  reviewedLabels?: string[]
  reviewedAt?: Date
  reviewedBy?: string
  /** Reviewer's note when the prediction was wrong, for the corpus. */
  reviewNote?: string

  createdAt: Date
}

const complaintLogSchema = new Schema<IComplaintLog>({
  text: { type: String, required: true, maxlength: 4000 },
  redacted: { type: Schema.Types.Mixed, default: {} },

  predictedLabels: { type: [String], default: [], index: true },
  scores: [{
    _id: false,
    label: String,
    probability: Number,
    threshold: Number,
  }],
  abstained: { type: Boolean, default: false, index: true },
  source: { type: String, enum: ['model+statute', 'keywords+statute'], required: true },
  modelVersion: String,

  advanceVerdict: { type: String, enum: ['violation', 'lawful', 'unclear'] },
  advanceMonths: Number,

  reviewedLabels: [String],
  reviewedAt: Date,
  reviewedBy: String,
  reviewNote: String,
}, { timestamps: { createdAt: true, updatedAt: false } })

// The review queue reads "unreviewed, newest first".
complaintLogSchema.index({ reviewedAt: 1, createdAt: -1 })

/*
 * 180-day retention, shorter than ValuationLog's two years.
 *
 * A property valuation is commercial data about a building. This is somebody
 * describing a dispute in their home, redacted but still sensitive, and it has
 * served its purpose once a reviewer has turned it into a training example.
 * Six months is long enough to batch review work and no longer.
 */
complaintLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 })

export const ComplaintLog = mongoose.model<IComplaintLog>('ComplaintLog', complaintLogSchema)
