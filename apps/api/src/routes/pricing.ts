import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { success, error } from '../utils/response.js'
import { analyzePropertyPricing, getRentTrends, checkFairPrice } from '../services/pricing.js'
import { rentPriceModel } from '../services/ml/pricingModel.js'
import { mlClient } from '../services/mlClient.js'
import { listValuations, recordValuation, scoreValuations, valuationLogSummary } from '../services/ml/valuationLog.js'
import { Property } from '../models/Property.js'

const router = Router()

/* ================================================================
   GET /api/pricing/comparables — get comparable properties & analysis
   ================================================================ */
const comparablesSchema = z.object({
  city: z.string().min(1),
  type: z.string().min(1),
  bedrooms: z.coerce.number().int().min(0),
  bathrooms: z.coerce.number().int().min(0).default(1),
  furnished: z.coerce.boolean().default(false),
  amenities: z.array(z.string()).default([]),
  floorArea: z.coerce.number().positive().optional(),
  excludeId: z.string().optional(),
})

router.get('/comparables', authenticate, async (req, res) => {
  const parsed = comparablesSchema.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    const result = await analyzePropertyPricing(
      parsed.data.city,
      parsed.data.type,
      parsed.data.bedrooms,
      parsed.data.bathrooms,
      parsed.data.furnished,
      parsed.data.amenities,
      parsed.data.floorArea,
      parsed.data.excludeId,
    )
    success(res, result)
  } catch (err) {
    console.error('[pricing] Failed to analyze pricing:', (err as Error).message)
    error(res, 'Failed to analyze pricing', 500)
  }
})

/* ================================================================
   GET /api/pricing/trends — rent trends for a city
   ================================================================ */
const trendsSchema = z.object({
  city: z.string().min(1),
  type: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
  months: z.coerce.number().int().min(1).max(24).default(6),
})

router.get('/trends', authenticate, async (req, res) => {
  const parsed = trendsSchema.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    const result = await getRentTrends(
      parsed.data.city,
      parsed.data.type,
      parsed.data.bedrooms,
      parsed.data.months,
    )
    success(res, { trends: result })
  } catch (err) {
    console.error('[pricing] Failed to get trends:', (err as Error).message)
    error(res, 'Failed to get trends', 500)
  }
})

/* ================================================================
   POST /api/pricing/fair-price — check if a price is fair
   ================================================================ */
const fairPriceSchema = z.object({
  price: z.number().positive(),
  city: z.string().min(1),
  type: z.string().min(1),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().int().min(0).default(1),
  furnished: z.boolean().default(false),
  amenities: z.array(z.string()).default([]),
  floorArea: z.number().positive().optional(),
})

router.post('/fair-price', authenticate, async (req, res) => {
  const parsed = fairPriceSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    const result = await checkFairPrice(
      parsed.data.price,
      parsed.data.city,
      parsed.data.type,
      parsed.data.bedrooms,
      parsed.data.bathrooms,
      parsed.data.furnished,
      parsed.data.amenities,
      parsed.data.floorArea,
    )
    success(res, result)
  } catch (err) {
    console.error('[pricing] Failed to check fair price:', (err as Error).message)
    error(res, 'Failed to check fair price', 500)
  }
})

/* ================================================================
   ML Pricing Model Endpoints
   ================================================================ */

router.get('/model-status', authenticate, async (_req, res) => {
  try {
    if (mlClient.isEnabled()) {
      const status = await mlClient.getStatus()
      success(res, status)
      return
    }
    const status = rentPriceModel.getStatus()
    success(res, status)
  } catch (err) {
    console.error('[pricing] Failed to get model status:', (err as Error).message)
    error(res, 'Failed to get model status', 500)
  }
})

// Bounds mirror PropertyInput in ml-service/app/schemas/pricing.py. They have
// to agree: an input this schema accepts and the ML service rejects comes back
// as an opaque 422, which /predict-ml swallows as "service unavailable" and
// answers from the local model instead — so a validation error would surface
// as a silently worse prediction.
const predictMlSchema = z.object({
  city: z.string().min(1).max(200),
  type: z.string().min(1).max(200),
  bedrooms: z.number().int().min(0).max(100),
  bathrooms: z.number().int().min(0).max(100).optional(),
  floorArea: z.number().positive().max(1_000_000).optional(),
  // No .default() on any of these. A default is a fabricated observation: it
  // reaches the model as a real value, so "amenities not stated" became "this
  // property has no amenities" (-59% on a live call) and "advance not stated"
  // became one month. Left undefined, the model imputes the training average
  // and reports the field as estimated.
  furnished: z.boolean().optional(),
  parkingSpaces: z.number().int().min(0).max(1000).optional(),
  advanceMonths: z.number().int().min(0).max(120).optional(),
  amenities: z.array(z.string()).max(100).optional(),
  region: z.string().max(200).optional(),
  floor: z.number().int().min(-20).max(300).optional(),
  yearBuilt: z.number().int().min(1800).max(2200).optional(),
  stayType: z.enum(['short_stay', 'long_stay']).optional(),
  /**
   * Optional: which property this valuation is for. It is what later lets the
   * rent the property actually went for be attached to this prediction, so
   * the model can be scored against reality instead of against the synthetic
   * data it was trained on (roadmap checklist item 7).
   */
  propertyId: z.string().max(64).optional(),
})

router.post('/predict-ml', authenticate, async (req, res) => {
  const parsed = predictMlSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { propertyId, ...input } = parsed.data

  try {
    if (mlClient.isEnabled()) {
      // External ML service — fall back to the local model if it's down/slow.
      try {
        const result = await mlClient.predict(input)
        success(res, result)
        void recordValuation({
          input, result, modelSource: 'ml-service', context: 'pricing_engine',
          requestedBy: req.user?.userId, propertyId,
        })
        return
      } catch (e) {
        console.warn('[pricing] external ML service failed, falling back to local model:', (e as Error).message)
      }
    }

    // Local model. Do NOT auto-train here — training is a CPU-bound multi-thousand
    // -epoch loop that would block the event loop for every request. Training is an
    // admin-only action via POST /train-ml; until then, fall back to comparables.
    if (!rentPriceModel.isTrained) {
      error(res, 'ML model is not trained yet. Use /api/pricing/comparables for an estimate, or ask an admin to train the model.', 503)
      return
    }

    const result = rentPriceModel.predict(input)
    success(res, result)
    // After the response: the estimate is a read, and failing to write the
    // evaluation row must never turn a good answer into an error.
    void recordValuation({
      input, result, modelSource: 'local', context: 'pricing_engine',
      requestedBy: req.user?.userId, propertyId,
    })
  } catch (err) {
    console.error('[pricing] ML prediction failed:', (err as Error).message)
    error(res, 'ML prediction failed', 500)
  }
})

/**
 * How the model is actually doing, scored against rents that really happened
 * (ML roadmap, checklist item 4).
 *
 * The model's own r2Score is computed against the data it trained on — today
 * that is synthetically generated listings, so it measures how well a linear
 * model recovers the formula that made them. These numbers come from logged
 * predictions compared with observed outcomes, which is the only measure that
 * says anything about Ghanaian rents.
 */
router.get('/model-evaluation', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const days = Math.min(3650, Math.max(1, Number(req.query.days) || 365))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const [summary, scores] = await Promise.all([
      valuationLogSummary(),
      scoreValuations({ since }),
    ])
    success(res, {
      windowDays: days,
      summary,
      scores,
      note: scores.length === 0
        ? 'No valuations have a recorded outcome yet. Outcomes attach when a listing is '
          + 'approved or an agreement is signed, so this fills in as the platform is used.'
        : undefined,
    })
  } catch (err) {
    console.error('[pricing] model evaluation failed:', (err as Error).message)
    error(res, 'Failed to compute model evaluation', 500)
  }
})

/** Recent valuations, newest first (roadmap checklist item 6). */
router.get('/valuations', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await listValuations({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
      withOutcomeOnly: req.query.withOutcome === 'true',
      propertyId: typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined,
    })
    success(res, result)
  } catch (err) {
    console.error('[pricing] failed to list valuations:', (err as Error).message)
    error(res, 'Failed to list valuations', 500)
  }
})

router.post('/train-ml', authenticate, requireRole('admin', 'super_admin'), async (_req, res) => {
  try {
    const props = await Property.find({ listingStatus: 'approved', rentAmount: { $gt: 0 } }).lean()
    if (props.length < 20) {
      error(res, `Need at least 20 approved properties with rent data. Found ${props.length}.`, 400)
      return
    }

    if (mlClient.isEnabled()) {
      const status = await mlClient.train(props)
      success(res, { message: 'Model trained successfully (external)', ...status })
      return
    }

    rentPriceModel.train(props as unknown as InstanceType<typeof Property>[], { verbose: true })
    rentPriceModel.save()
    const status = rentPriceModel.getStatus()
    success(res, { message: 'Model trained successfully', ...status })
  } catch (err) {
    console.error('[pricing] Training failed:', (err as Error).message)
    error(res, 'Training failed', 500)
  }
})

export default router
