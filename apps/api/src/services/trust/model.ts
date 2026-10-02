/**
 * TRUST-2 intent model runtime (spec §6.2): a calibrated multinomial logistic
 * regression over the hashed features in features.ts, trained offline by
 * src/scripts/trainContactModel.ts on synthetic and adversarial data and
 * shipped as a generated module (int8 weights with a per-class scale).
 *
 * It answers what a message is trying to do — share contact details, ask for
 * them, move the conversation elsewhere, discuss the policy, or nothing of the
 * kind. The structural detectors find the details themselves; the policy
 * engine combines both (§11).
 */
import { CONTACT_INTENT_MODEL } from './model/contactIntentModel.js'
import { BUCKETS, FEATURE_VERSION, type FeatureVector } from './features.js'
import { NORMALIZER_VERSION } from './normalizer.js'

export const INTENT_LABELS = ['NO_CONTACT', 'SHARE_CONTACT', 'REQUEST_CONTACT', 'MOVE_OFF_PLATFORM', 'DISCUSS_CONTACT_POLICY', 'BENIGN_CONTACT_REFERENCE'] as const
export type IntentLabel = (typeof INTENT_LABELS)[number]

export interface IntentPrediction {
  label: IntentLabel
  probabilities: Record<IntentLabel, number>
  modelVersion: string
  /** False when no trained model is deployed; the policy then relies on the rule layers. */
  available: boolean
}

interface Decoded { weights: Int8Array; scale: number[]; bias: number[]; temperature: number }
let decoded: Decoded | null | undefined

function decode(): Decoded | null {
  if (decoded !== undefined) return decoded
  const model = CONTACT_INTENT_MODEL as unknown as { buckets: number; weights: string; scale: number[]; bias: number[]; temperature: number; featureVersion: string; normalizerVersion: string }
  // A model trained on other features or another normalizer would score
  // nonsense: it is not used, and the rule layers decide alone.
  if (!model.weights || model.buckets !== BUCKETS || model.featureVersion !== FEATURE_VERSION || model.normalizerVersion !== NORMALIZER_VERSION) {
    if (model.weights) console.warn(`[trust] intent model ${CONTACT_INTENT_MODEL.version} does not match features ${FEATURE_VERSION} / normalizer ${NORMALIZER_VERSION}; retrain it`)
    decoded = null
    return decoded
  }
  const bytes = Buffer.from(model.weights, 'base64')
  decoded = { weights: new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), scale: [...model.scale], bias: [...model.bias], temperature: model.temperature || 1 }
  return decoded
}

export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits)
  const exps = logits.map((v) => Math.exp(v - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((v) => v / sum)
}

export function predictIntent(features: FeatureVector): IntentPrediction {
  const model = decode()
  const classes = INTENT_LABELS.length
  if (!model) {
    const probabilities = Object.fromEntries(INTENT_LABELS.map((label) => [label, label === 'NO_CONTACT' ? 1 : 0])) as Record<IntentLabel, number>
    return { label: 'NO_CONTACT', probabilities, modelVersion: CONTACT_INTENT_MODEL.version, available: false }
  }
  const logits = [...model.bias]
  for (const [index, value] of features) {
    const base = index * classes
    for (let c = 0; c < classes; c++) logits[c] += model.weights[base + c] * model.scale[c] * value
  }
  const probs = softmax(logits.map((v) => v / model.temperature))
  let best = 0
  for (let c = 1; c < classes; c++) if (probs[c] > probs[best]) best = c
  const probabilities = Object.fromEntries(INTENT_LABELS.map((label, c) => [label, probs[c]])) as Record<IntentLabel, number>
  return { label: INTENT_LABELS[best], probabilities, modelVersion: CONTACT_INTENT_MODEL.version, available: true }
}

/** Tests only: drop the decoded weights so a re-generated module is picked up. */
export function resetModelCache() { decoded = undefined }
