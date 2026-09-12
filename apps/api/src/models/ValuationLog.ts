import mongoose, { Schema, type Document } from 'mongoose'

/**
 * Every rent valuation the platform produces, and — once it is known — the
 * rent the property actually went for.
 *
 * This is the ML roadmap's immediate build checklist, item 7: "Log
 * predictions and later observed/accepted rents so the model can be evaluated
 * and retrained." Nothing else in the roadmap works without it.
 *
 * The pricing model today trains on synthetically generated listings, so its
 * R² measures how well a linear model recovers the formula that generated the
 * data — it says nothing about Ghanaian rents. There is no way to find out
 * how wrong it is, because no prediction was ever written down and compared
 * with an outcome. Checklist item 4 ("retrain/evaluate with and without risk
 * features and record the incremental benefit") is unanswerable until this
 * table has outcomes in it.
 *
 * The record is also the provenance trail §7 requires: modelVersion, the
 * exact input, which fields were estimated rather than supplied, and the
 * model's self-reported accuracy at the time, so a past valuation can be
 * reproduced and explained rather than merely re-run against a newer model.
 */
export interface IValuationLog extends Document {
  /** Model artifact identity — the model's trainedAt timestamp. */
  modelVersion: string
  /** Which implementation answered: the in-process model or the ML service. */
  modelSource: 'local' | 'ml-service' | 'baseten'
  /** Where the valuation was requested from, for slicing evaluation. */
  context: 'pricing_engine' | 'pricing_analysis' | 'api'

  /** The request as the model saw it, after validation and before imputation. */
  input: Record<string, unknown>

  predictedRent: number
  baselineRent?: number
  confidenceLow?: number
  confidenceHigh?: number

  /** Data quality at prediction time (see roadmap §5). */
  suppliedFields?: number
  totalFields?: number
  imputedFields?: string[]

  /** The model's self-reported accuracy when it answered. */
  r2AtPrediction?: number
  sampleCountAtPrediction?: number

  requestedBy?: string
  propertyId?: string

  /**
   * Ground truth, attached later. `observedRent` is what the property was
   * actually listed or let at; until it is set this row cannot be scored.
   */
  observedRent?: number
  observedAt?: Date
  observedSource?: 'listing_published' | 'agreement_signed' | 'manual'

  createdAt: Date
}

const valuationLogSchema = new Schema<IValuationLog>({
  modelVersion: { type: String, required: true, index: true },
  modelSource: { type: String, enum: ['local', 'ml-service', 'baseten'], required: true },
  context: {
    type: String,
    enum: ['pricing_engine', 'pricing_analysis', 'api'],
    default: 'api',
    index: true,
  },

  input: { type: Schema.Types.Mixed, required: true },

  predictedRent: { type: Number, required: true },
  baselineRent: Number,
  confidenceLow: Number,
  confidenceHigh: Number,

  suppliedFields: Number,
  totalFields: Number,
  imputedFields: [String],

  r2AtPrediction: Number,
  sampleCountAtPrediction: Number,

  requestedBy: { type: String, index: true },
  propertyId: { type: String, index: true },

  observedRent: Number,
  observedAt: Date,
  observedSource: { type: String, enum: ['listing_published', 'agreement_signed', 'manual'] },
}, { timestamps: { createdAt: true, updatedAt: false } })

// Scoring reads "rows for this model version that have an outcome".
valuationLogSchema.index({ modelVersion: 1, observedRent: 1 })
// Outcome attachment reads "recent unscored rows for this property".
valuationLogSchema.index({ propertyId: 1, observedRent: 1, createdAt: -1 })

/*
 * Two-year retention. Long enough to evaluate a model across a full seasonal
 * cycle and to reproduce a valuation a user queries months later, bounded so
 * the collection cannot grow without limit. Deliberately longer than the
 * 90-day operational retention on WebhookEvent: this is training evidence,
 * not an operational artifact, and discarding it discards the dataset the
 * roadmap is built on.
 */
valuationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 })

export const ValuationLog = mongoose.model<IValuationLog>('ValuationLog', valuationLogSchema)
