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
const DEFAULT_MODEL_PATH = path.resolve(__dirname, '../../../../ml-models/pricing-model.json')

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
  featureContributions: { feature: string; contribution: number }[]
  modelVersion: string
  r2Score: number
  sampleCount: number
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
    this.weights = Array(m).fill(0).map(() => (Math.random() - 0.5) * Math.sqrt(2 / m))
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
    const predictedRent = this.weights.reduce((s, w, j) => s + w * features[j], 0) + this.bias
    const clampedRent = Math.max(0, predictedRent)

    // Confidence interval: estimate from training residuals
    // Simple heuristic: ±20% of prediction, tightened by R²
    const uncertainty = 0.2 * (1 - Math.max(0, this.r2Score)) + 0.05
    const margin = clampedRent * uncertainty

    // Feature contributions (each weight * feature value)
    const contributions = features.map((v, i) => ({
      feature: FEATURE_NAMES[i],
      contribution: this.weights[i] * v,
    })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))

    return {
      predictedRent: Math.round(clampedRent),
      confidenceInterval: {
        low: Math.round(Math.max(0, clampedRent - margin)),
        high: Math.round(clampedRent + margin),
      },
      featureContributions: contributions,
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
