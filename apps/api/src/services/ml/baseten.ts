/**
 * Baseten-hosted pricing model (ML roadmap §10).
 *
 * The model served there is the same RentPriceModel this repo trains and
 * tests — see apps/ml-service/truss, which bundles the `app` package rather
 * than redefining the feature vector. Two copies of feature extraction is how
 * train/serve skew starts, and two of the three bugs fixed in this model came
 * from exactly that.
 *
 * This client is one of three interchangeable sources for a valuation, tried
 * in order: Baseten, then a self-hosted ML service, then the in-process
 * TypeScript model. Each falls through to the next on failure, so an
 * unreachable Baseten deployment degrades the estimate rather than breaking
 * the page.
 */
import { envOptional, envOr } from '../../utils/env.js'
import { logger } from '../../utils/logger.js'
import type { PropertyInput } from './features.js'
import type { PredictionResult } from './pricingModel.js'

/**
 * Short on purpose. This sits in front of a user waiting for a price, and the
 * local model can answer in under a millisecond — waiting longer for a
 * marginally better number is the wrong trade.
 */
const REQUEST_TIMEOUT_MS = 4000

function apiKey(): string | undefined {
  return envOptional('BASETEN_API_KEY')
}

/**
 * Strip the API key out of anything taken from a response body.
 *
 * Baseten echoes the Authorization header back in some auth failures, and
 * these messages are thrown, caught by the pricing route and written to the
 * log. Without this, one 401 puts the live credential in plaintext in the
 * application log — which is exactly where an attacker looks.
 */
function redact(text: string): string {
  const key = apiKey()
  if (!key) return text
  return text.split(key).join('***')
}

/**
 * The predict endpoint.
 *
 * BASETEN_MODEL_URL wins when set, for deployments that do not follow the
 * default host pattern (a chain, a custom domain, a pinned deployment id).
 */
export function basetenPredictUrl(): string | undefined {
  const explicit = envOptional('BASETEN_MODEL_URL')
  if (explicit) return explicit.replace(/\/+$/, '')

  const modelId = envOptional('BASETEN_MODEL_ID')
  if (!modelId) return undefined

  const environment = envOr('BASETEN_ENVIRONMENT', 'production')
  return `https://model-${modelId}.api.baseten.co/environments/${environment}/predict`
}

/** Baseten wraps a model's return value; older deployments return it bare. */
interface BasetenEnvelope {
  data?: unknown
  predictions?: unknown[]
  error?: string
}

function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === 'object') {
    const envelope = payload as BasetenEnvelope
    if (envelope.error) throw new Error(`Baseten model error: ${envelope.error}`)
    if (envelope.data !== undefined) return envelope.data
  }
  return payload
}

function assertLooksLikeValuation(value: unknown): PredictionResult {
  if (!value || typeof value !== 'object' || typeof (value as PredictionResult).predictedRent !== 'number') {
    // A deployment serving some other model would otherwise surface as a
    // valuation of `undefined`, which reaches the user as GHS NaN.
    throw new Error('Baseten response did not contain a predictedRent')
  }
  return value as PredictionResult
}

export const basetenClient = {
  /** Configured only when both a key and a target endpoint are present. */
  isEnabled(): boolean {
    return !!apiKey() && !!basetenPredictUrl()
  },

  async predict(input: PropertyInput): Promise<PredictionResult> {
    const url = basetenPredictUrl()
    const key = apiKey()
    if (!url || !key) throw new Error('Baseten is not configured')

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Baseten accepts both `Api-Key <key>` and `Bearer <key>`.
        Authorization: `Api-Key ${key}`,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      const detail = redact((await res.text().catch(() => '')).slice(0, 200))
      throw new Error(`Baseten error (${res.status}): ${detail}`)
    }

    return assertLooksLikeValuation(unwrap(await res.json()))
  },

  /**
   * Value several properties in one call.
   *
   * The Truss accepts {instances: [...]} and returns {predictions: [...]},
   * with a per-item {error} for any row it could not price rather than
   * failing the batch.
   */
  async predictBatch(inputs: PropertyInput[]): Promise<(PredictionResult | null)[]> {
    const url = basetenPredictUrl()
    const key = apiKey()
    if (!url || !key) throw new Error('Baseten is not configured')
    if (inputs.length === 0) return []

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${key}` },
      body: JSON.stringify({ instances: inputs }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const detail = redact((await res.text().catch(() => '')).slice(0, 200))
      throw new Error(`Baseten error (${res.status}): ${detail}`)
    }

    const payload = unwrap(await res.json()) as BasetenEnvelope
    const predictions = Array.isArray(payload?.predictions) ? payload.predictions : []
    return predictions.map((item) => {
      try {
        return assertLooksLikeValuation(item)
      } catch {
        return null
      }
    })
  },

  /**
   * A cheap liveness check.
   *
   * Baseten scales deployments to zero, so the first call after an idle period
   * pays a cold start. Calling this at boot is what keeps that cold start off
   * a user's first valuation.
   */
  async warm(): Promise<boolean> {
    if (!this.isEnabled()) return false
    try {
      await this.predict({ city: 'Accra', type: 'apartment', bedrooms: 2 })
      logger.info('[baseten] pricing model reachable')
      return true
    } catch (err) {
      logger.warn(`[baseten] pricing model unreachable: ${(err as Error).message}`)
      return false
    }
  },
}
