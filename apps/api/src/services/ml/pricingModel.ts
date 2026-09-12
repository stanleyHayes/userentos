import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { IProperty } from '../../models/Property.js'
import {
  extractFeaturesFromProperty,
  computeEncodings,
  extractFeatures,
  type FeatureVector,
  type Encodings,
  FEATURE_NAMES,
  type PropertyInput,
} from './features.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * The trained model lives outside this package, and the depth to it differs by
 * how the API is running: from src/ under tsx, from dist/ after a build, and
 * from /app/dist inside the container where only the artifact is copied in.
 * A single relative path cannot satisfy all three, so try each and take the
 * first that exists. ML_MODEL_PATH overrides everything.
 */
const MODEL_CANDIDATES = [
  process.env.ML_MODEL_PATH,
  // apps/api/{src,dist}/services/ml → repo root → packages/ml-models
  path.resolve(__dirname, '../../../../../packages/ml-models/pricing-model.json'),
  // Container layout: /app/dist/services/ml with the artifact at /app/packages
  path.resolve(__dirname, '../../../packages/ml-models/pricing-model.json'),
  // Pre-restructure layout, kept so an old checkout still finds its model
  path.resolve(__dirname, '../../../../ml-models/pricing-model.json'),
].filter((candidate): candidate is string => Boolean(candidate))

const DEFAULT_MODEL_PATH = MODEL_CANDIDATES.find((candidate) => fs.existsSync(candidate))
  ?? MODEL_CANDIDATES[MODEL_CANDIDATES.length - 1]

export interface ModelState {
  weights: number[]
  bias: number
  featureMeans: number[]
  featureStds: number[]
  encodings: Encodings
  trainedAt: string
  sampleCount: number
  finalLoss: number
  r2Score: number
  epochs: number
  featureNames: string[]
}

export interface PredictionResult {
  predictedRent: number
  confidenceInterval: { low: number; high: number }
  featureContributions: { feature: string; contribution: number; impactPercent: number; value: number }[]
  /** What the average property in the training set is worth. */
  baselineRent: number
  /** How much of the estimate rests on supplied facts rather than averages. */
  dataQuality: {
    suppliedFields: number
    totalFields: number
    imputedFields: string[]
    warning: string | null
  }
  modelVersion: string
  r2Score: number
  sampleCount: number
}

/** Matches WEIGHT_INIT_SEED in ml-service/app/ml/model.py. */
const WEIGHT_INIT_SEED = 42

/**
 * mulberry32 — a small, fast, well-distributed PRNG.
 *
 * Any deterministic generator would do; what matters is that it is seeded and
 * stable across processes, so two training runs on the same data produce the
 * same model.
 */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class RentPriceModel {
  weights: number[] = []
  bias = 0
  featureMeans: number[] = []
  featureStds: number[] = []
  encodings: Encodings = { city: {}, type: {}, region: {} }
  trainedAt = ''
  sampleCount = 0
  finalLoss = 0
  r2Score = 0
  epochs = 0
  isTrained = false

  private normalize(features: FeatureVector): FeatureVector {
    return features.map((v, i) => {
      const std = this.featureStds[i]
      if (std === 0 || std === undefined) return 0
      return (v - (this.featureMeans[i] ?? 0)) / std
    })
  }

  private denormalizePrediction(normalizedValue: number): number {
    // The target (rent) is also normalized during training, so we need to
    // know the target mean/std. Instead, we train on raw rents and normalize
    // only features. This keeps predictions in raw currency.
    return normalizedValue
  }

  train(properties: IProperty[], options: {
    maxEpochs?: number
    learningRate?: number
    lrDecay?: number
    l2Lambda?: number
    minImprovement?: number
    patience?: number
    verbose?: boolean
  } = {}): void {
    const {
      maxEpochs = 10000,
      learningRate: initialLR = 0.01,
      lrDecay = 0.9995,
      l2Lambda = 0.001,
      minImprovement = 1e-6,
      patience = 500,
      verbose = false,
    } = options

    // Filter valid training data
    const valid = properties.filter(p => Number(p.rentAmount) > 0)
    if (valid.length < 20) {
      throw new Error(`Insufficient training data: need at least 20 properties, got ${valid.length}`)
    }

    this.encodings = computeEncodings(valid)

    // Extract feature matrix and targets
    const X: FeatureVector[] = []
    const y: number[] = []
    for (const p of valid) {
      X.push(extractFeaturesFromProperty(p, this.encodings))
      y.push(Number(p.rentAmount))
    }

    const n = X.length
    const m = X[0].length

    // Impute "unknown" (NaN from features.MISSING) with the column mean,
    // which is the neutral value: the bias term subtracts
    // sum(weight * featureMean), so an imputed feature contributes exactly
    // what the bias takes back out and the estimate falls through to what the
    // other features say. Property documents routinely omit floorArea or
    // yearBuilt, and those rows used to train the model on a literal 0.
    const columnMeans: number[] = Array(m).fill(0)
    for (let j = 0; j < m; j++) {
      let sum = 0
      let count = 0
      for (const row of X) {
        if (Number.isFinite(row[j])) { sum += row[j]; count++ }
      }
      columnMeans[j] = count > 0 ? sum / count : 0
    }
    for (const row of X) {
      for (let j = 0; j < m; j++) {
        if (!Number.isFinite(row[j])) row[j] = columnMeans[j]
      }
    }

    // Compute feature means and stds for normalization
    this.featureMeans = Array(m).fill(0)
    this.featureStds = Array(m).fill(0)
    for (let j = 0; j < m; j++) {
      const vals = X.map(row => row[j])
      const mean = vals.reduce((a, b) => a + b, 0) / n
      const variance = vals.reduce((sq, v) => sq + (v - mean) ** 2, 0) / n
      const std = Math.sqrt(variance)
      // For near-constant features, keep the mean (so they center to 0)
      // but set std to 1 to avoid division-by-zero amplification
      this.featureMeans[j] = mean
      this.featureStds[j] = std < 1e-6 ? 1 : std
    }

    // Normalize features
    const XNorm = X.map(row => this.normalize(row))

    // Also normalize target (rent) for stable training
    const targetMean = y.reduce((a, b) => a + b, 0) / n
    const targetStd = Math.sqrt(y.reduce((sq, v) => sq + (v - targetMean) ** 2, 0) / n + 1e-8)
    const yNorm = y.map(v => (v - targetMean) / targetStd)

    // Initialize weights (Xavier-like)
    // Seeded, not Math.random(). Training was non-deterministic: the same
    // properties produced a different model every run, so a logged
    // modelVersion identified a moment in time rather than a reproducible
    // model, and a valuation could never be re-derived. It also made the
    // explainability test flaky — an above-average property occasionally
    // priced below the baseline depending on where the weights started.
    // pricingModel.py has always seeded this; the port did not.
    const random = seededRandom(WEIGHT_INIT_SEED)
    this.weights = Array(m).fill(0).map(() => (random() - 0.5) * Math.sqrt(2 / m))
    this.bias = 0

    let bestLoss = Infinity
    let epochsWithoutImprovement = 0
    let lr = initialLR
    let epoch = 0

    for (; epoch < maxEpochs; epoch++) {
      // Predictions
      const predictions = XNorm.map(xi => this.weights.reduce((s, w, j) => s + w * xi[j], 0) + this.bias)

      // Errors
      const errors = predictions.map((p, i) => p - yNorm[i])

      // Gradients
      const dw = Array(m).fill(0)
      let db = 0
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          dw[j] += errors[i] * XNorm[i][j]
        }
        db += errors[i]
      }
      for (let j = 0; j < m; j++) {
        dw[j] = (dw[j] / n) + l2Lambda * this.weights[j]
      }
      db /= n

      // Update
      for (let j = 0; j < m; j++) {
        this.weights[j] -= lr * dw[j]
      }
      this.bias -= lr * db

      // Loss (MSE)
      const loss = errors.reduce((sq, e) => sq + e * e, 0) / n

      // Learning rate decay
      lr *= lrDecay

      // Early stopping
      if (loss < bestLoss - minImprovement) {
        bestLoss = loss
        epochsWithoutImprovement = 0
      } else {
        epochsWithoutImprovement++
      }

      if (epochsWithoutImprovement >= patience) {
        if (verbose) console.log(`[ML] Early stop at epoch ${epoch}, loss: ${loss.toFixed(6)}`)
        break
      }

      if (verbose && epoch % 1000 === 0) {
        console.log(`[ML] Epoch ${epoch}, loss: ${loss.toFixed(6)}, lr: ${lr.toFixed(6)}`)
      }
    }

    this.finalLoss = bestLoss
    this.epochs = epoch
    this.sampleCount = n
    this.trainedAt = new Date().toISOString()

    // Zero out weights for near-constant features (they don't contribute in normalized space)
    for (let j = 0; j < m; j++) {
      const originalStd = Math.sqrt(X.map(row => row[j]).reduce((sq, v) => {
        const mean = this.featureMeans[j]
        return sq + (v - mean) ** 2
      }, 0) / n)
      if (originalStd < 1e-6) {
        this.weights[j] = 0
      }
    }

    // Convert weights back to raw rent scale for direct prediction
    // Prediction in normalized space: w·x_norm + b
    // x_norm = (x - mean) / std
    // So w·(x - mean)/std + b = (w/std)·x + (b - w·mean/std)
    // We want: raw_pred = (w·x_norm + b) * targetStd + targetMean
    // Let's store de-normalized weights for direct raw prediction
    this.weights = this.weights.map((w, j) => (w * targetStd) / this.featureStds[j])
    this.bias = this.bias * targetStd + targetMean - this.weights.reduce((s, w, j) => s + w * this.featureMeans[j], 0)

    // Compute R² score
    const yMean = y.reduce((a, b) => a + b, 0) / n
    const ssTot = y.reduce((sq, v) => sq + (v - yMean) ** 2, 0)
    const ssRes = y.reduce((sq, v, i) => {
      const pred = this.weights.reduce((s, w, j) => s + w * X[i][j], 0) + this.bias
      return sq + (v - pred) ** 2
    }, 0)
    this.r2Score = ssTot > 0 ? 1 - ssRes / ssTot : 0
    this.isTrained = true

    if (verbose) {
      console.log(`[ML] Training complete: ${n} samples, ${epoch} epochs, R²=${this.r2Score.toFixed(4)}, loss=${this.finalLoss.toFixed(6)}`)
    }
  }

  predict(input: PropertyInput): PredictionResult {
    if (!this.isTrained) throw new Error('Model not trained')

    const features = extractFeatures(input, this.encodings)
    // Same imputation as training. Without it an omitted optional field
    // entered the model as 0 — "unknown year built" priced as year 0 — and
    // the caller got a confident, badly low number with no warning.
    const imputedFields: string[] = []
    for (let j = 0; j < features.length; j++) {
      if (!Number.isFinite(features[j])) {
        imputedFields.push(FEATURE_NAMES[j])
        features[j] = this.featureMeans[j] ?? 0
      }
    }

    const predictedRent = this.weights.reduce((s, w, j) => s + w * features[j], 0) + this.bias
    const clampedRent = Math.max(0, predictedRent)

    // Confidence interval: estimate from training residuals
    // Simple heuristic: ±20% of prediction, tightened by R²
    const uncertainty = 0.2 * (1 - Math.max(0, this.r2Score)) + 0.05
    const margin = clampedRent * uncertainty

    // What the average training property is worth. Every attribution below is
    // stated against it, so a feature's number answers "how much is THIS
    // property worth more or less than typical because of this?".
    //
    // The old version reported weight * value, which is not signed: an
    // absolute value is almost always positive, so the UI showed every
    // feature as value-INCREASING and never surfaced a negative driver.
    const baselineRent = Math.max(
      0,
      this.weights.reduce((s, w, j) => s + w * (this.featureMeans[j] ?? 0), 0) + this.bias,
    )

    const contributions = features.map((v, i) => {
      const delta = this.weights[i] * (v - (this.featureMeans[i] ?? 0))
      return {
        feature: FEATURE_NAMES[i],
        contribution: Math.round(delta * 100) / 100,
        impactPercent: clampedRent > 0 ? Math.round((delta / clampedRent) * 1000) / 10 : 0,
        value: Math.round(v * 10000) / 10000,
      }
    }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))

    const totalFields = FEATURE_NAMES.length
    const dataQuality = {
      suppliedFields: totalFields - imputedFields.length,
      totalFields,
      imputedFields,
      warning: imputedFields.length > 0
        ? `${imputedFields.length} of ${totalFields} inputs were not supplied and were `
          + 'estimated from the training average; the result is less specific to this property.'
        : null,
    }

    return {
      predictedRent: Math.round(clampedRent),
      confidenceInterval: {
        low: Math.round(Math.max(0, clampedRent - margin)),
        high: Math.round(clampedRent + margin),
      },
      featureContributions: contributions,
      baselineRent: Math.round(baselineRent),
      dataQuality,
      modelVersion: this.trainedAt,
      r2Score: Math.round(this.r2Score * 1000) / 1000,
      sampleCount: this.sampleCount,
    }
  }

  save(filePath = DEFAULT_MODEL_PATH): void {
    if (!this.isTrained) throw new Error('Cannot save untrained model')
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const state: ModelState = {
      weights: this.weights,
      bias: this.bias,
      featureMeans: this.featureMeans,
      featureStds: this.featureStds,
      encodings: this.encodings,
      trainedAt: this.trainedAt,
      sampleCount: this.sampleCount,
      finalLoss: this.finalLoss,
      r2Score: this.r2Score,
      epochs: this.epochs,
      featureNames: [...FEATURE_NAMES],
    }
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
  }

  load(filePath = DEFAULT_MODEL_PATH): boolean {
    if (!fs.existsSync(filePath)) return false
    try {
      const state = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ModelState
      this.weights = state.weights
      this.bias = state.bias
      this.featureMeans = state.featureMeans
      this.featureStds = state.featureStds
      this.encodings = state.encodings
      this.trainedAt = state.trainedAt
      this.sampleCount = state.sampleCount
      this.finalLoss = state.finalLoss
      this.r2Score = state.r2Score
      this.epochs = state.epochs
      this.isTrained = true
      return true
    } catch {
      return false
    }
  }

  getStatus(): { isTrained: boolean; trainedAt: string; sampleCount: number; r2Score: number; epochs: number; finalLoss: number } {
    return {
      isTrained: this.isTrained,
      trainedAt: this.trainedAt,
      sampleCount: this.sampleCount,
      r2Score: this.r2Score,
      epochs: this.epochs,
      finalLoss: this.finalLoss,
    }
  }
}

// Singleton instance for the app
export const rentPriceModel = new RentPriceModel()
