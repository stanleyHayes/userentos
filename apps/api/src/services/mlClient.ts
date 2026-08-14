/**
 * HTTP client for the external Pricing ML microservice.
 *
 * When ML_SERVICE_URL is set, the Node.js server proxies ML requests
 * to the Python FastAPI service instead of running the model locally.
 */

import { config } from '../config/index.js'

const ML_URL = process.env.ML_SERVICE_URL
const REQUEST_TIMEOUT_MS = 4000
const TRAIN_TIMEOUT_MS = 60000

interface PropertyInput {
  city: string
  type: string
  bedrooms: number
  bathrooms?: number
  floorArea?: number
  furnished?: boolean
  parkingSpaces?: number
  advanceMonths?: number
  amenities?: string[]
  region?: string
  floor?: number
  yearBuilt?: number
  stayType?: 'short_stay' | 'long_stay'
}

interface PredictionResult {
  predictedRent: number
  confidenceInterval: { low: number; high: number }
  featureContributions: { feature: string; contribution: number }[]
  modelVersion: string
  r2Score: number
  sampleCount: number
}

interface ModelStatus {
  isTrained: boolean
  trainedAt: string
  sampleCount: number
  r2Score: number
  epochs: number
  finalLoss: number
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  // Authenticate against the ML service when an API key is configured
  // (unset = dev mode, no auth header sent).
  if (config.mlServiceApiKey) {
    headers['x-api-key'] = config.mlServiceApiKey
  }
  return headers
}

export const mlClient = {
  isEnabled(): boolean {
    return !!ML_URL
  },

  async predict(input: PropertyInput): Promise<PredictionResult> {
    if (!ML_URL) throw new Error('ML_SERVICE_URL not configured')
    const res = await fetch(`${ML_URL}/predict`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`ML service error (${res.status}): ${err}`)
    }
    return res.json() as Promise<PredictionResult>
  },

  async train(properties: unknown[]): Promise<ModelStatus> {
    if (!ML_URL) throw new Error('ML_SERVICE_URL not configured')
    const res = await fetch(`${ML_URL}/train`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ properties }),
      signal: AbortSignal.timeout(TRAIN_TIMEOUT_MS),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`ML service error (${res.status}): ${err}`)
    }
    return res.json() as Promise<ModelStatus>
  },

  async getStatus(): Promise<ModelStatus> {
    if (!ML_URL) throw new Error('ML_SERVICE_URL not configured')
    const res = await fetch(`${ML_URL}/status`, { headers: getHeaders(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`ML service error (${res.status}): ${err}`)
    }
    return res.json() as Promise<ModelStatus>
  },

  async health(): Promise<{ status: string; modelLoaded: string }> {
    if (!ML_URL) throw new Error('ML_SERVICE_URL not configured')
    const res = await fetch(`${ML_URL}/health`, { headers: getHeaders(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`ML service error (${res.status}): ${err}`)
    }
    return res.json() as Promise<{ status: string; modelLoaded: string }>
  },
}
