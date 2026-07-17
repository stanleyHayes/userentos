import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { success, error } from '../utils/response.js'
import { analyzePropertyPricing, getRentTrends, checkFairPrice } from '../services/pricing.js'
import { rentPriceModel } from '../services/ml/pricingModel.js'
import { mlClient } from '../services/mlClient.js'
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

const predictMlSchema = z.object({
  city: z.string().min(1),
  type: z.string().min(1),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().int().min(0).default(1),
  floorArea: z.number().positive().optional(),
  furnished: z.boolean().default(false),
  parkingSpaces: z.number().int().min(0).default(0),
  advanceMonths: z.number().int().min(0).default(1),
  amenities: z.array(z.string()).default([]),
  region: z.string().optional(),
  floor: z.number().int().optional(),
  yearBuilt: z.number().int().optional(),
  stayType: z.enum(['short_stay', 'long_stay']).optional(),
})

router.post('/predict-ml', authenticate, async (req, res) => {
  const parsed = predictMlSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    if (mlClient.isEnabled()) {
      // External ML service — fall back to the local model if it's down/slow.
      try {
        const result = await mlClient.predict(parsed.data)
        success(res, result)
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

    const result = rentPriceModel.predict(parsed.data)
    success(res, result)
  } catch (err) {
    console.error('[pricing] ML prediction failed:', (err as Error).message)
    error(res, 'ML prediction failed', 500)
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
