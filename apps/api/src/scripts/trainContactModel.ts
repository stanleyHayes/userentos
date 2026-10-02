/**
 * Trains the TRUST-2 intent model (spec §6.2, §19) and writes it to
 * src/services/trust/model/contactIntentModel.ts.
 *
 *   npx tsx src/scripts/trainContactModel.ts [--seed 20261002] [--examples 48000] [--epochs 10]
 *       [--labels reviewed.json]   extra labelled examples (exportTrustLabels.ts output)
 *       [--check]                  train and report, but do not write the model
 *
 * What it does, reproducibly from the seed:
 *  1. generates synthetic and adversarial examples (services/trust/training)
 *     and splits them by template family — a family in test never appears in
 *     training, so the test score measures unseen phrasings (§8.3);
 *  2. builds features with the same code the live screen uses (features.ts);
 *  3. trains a multinomial logistic regression with class weights (AdaGrad,
 *     L2), then fits a temperature on the validation split for calibration;
 *  4. quantises the weights to int8 with a per-class scale;
 *  5. evaluates the quantised model through the real policy engine and
 *     refuses to write it if a release gate fails (docs/trust/MODEL_CARD.md).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalize, NORMALIZER_VERSION } from '../services/trust/normalizer.js'
import { runDetectors } from '../services/trust/detectors.js'
import { extractFeatures, BUCKETS, FEATURE_VERSION, hash, type FeatureVector } from '../services/trust/features.js'
import { INTENT_LABELS, softmax, type IntentLabel, type IntentPrediction } from '../services/trust/model.js'
import { decide } from '../services/trust/policy.js'
import { generateExamples, makeRng, type Example } from '../services/trust/training/generator.js'

const args = process.argv.slice(2)
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const SEED = Number(arg('seed', '20261002'))
const COUNT = Number(arg('examples', '48000'))
const EPOCHS = Number(arg('epochs', '4'))
const CHECK_ONLY = args.includes('--check')
const EXTRA = arg('labels', '')
const OUT = fileURLToPath(new URL('../services/trust/model/contactIntentModel.ts', import.meta.url))

const C = INTENT_LABELS.length
const labelIndex = (label: IntentLabel) => INTENT_LABELS.indexOf(label)

interface Row { x: FeatureVector; y: number; ex: Example }

function featurize(examples: Example[]): Row[] {
  return examples.map((ex) => {
    const views = normalize(ex.text)
    return { x: extractFeatures(views, runDetectors(views)), y: labelIndex(ex.label), ex }
  })
}

// ─── Data ───

const generated = generateExamples(SEED, COUNT)
const extra: Example[] = EXTRA ? (JSON.parse(readFileSync(EXTRA, 'utf8')) as Example[]) : []
const seen = new Set<string>()
const examples = [...generated, ...extra].filter((ex) => {
  const key = `${ex.label}\u0000${ex.text}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
const split = (ex: Example) => {
  const bucket = hash(`split:${ex.family}`) % 10
  return bucket === 0 ? 'test' : bucket === 1 ? 'validation' : 'train'
}
const train = featurize(examples.filter((ex) => split(ex) === 'train'))
const validation = featurize(examples.filter((ex) => split(ex) === 'validation'))
const test = featurize(examples.filter((ex) => split(ex) === 'test'))
const datasetHash = createHash('sha256').update(examples.map((ex) => `${ex.label}\t${ex.text}`).join('\n')).digest('hex').slice(0, 16)
console.log(`examples ${examples.length} (train ${train.length}, validation ${validation.length}, test ${test.length}), dataset ${datasetHash}`)

// ─── Training: multinomial logistic regression, AdaGrad, class weights ───

const W = new Float32Array(BUCKETS * C)
const G = new Float32Array(BUCKETS * C)
const bias = new Float64Array(C)
const biasG = new Float64Array(C)
const LR = Number(arg('lr', '0.15'))
const L2 = Number(arg('l2', '1e-5'))
/** Label smoothing: the targets are 1 − ε and ε/(C − 1), which keeps a synthetic corpus from producing overconfident weights. */
const SMOOTH = Number(arg('smooth', '0.05'))

const counts = new Array(C).fill(0)
for (const row of train) counts[row.y]++
const classWeight = counts.map((n) => (n ? train.length / (C * n) : 0))

function logits(x: FeatureVector, weights: (index: number, c: number) => number, b: ArrayLike<number>): number[] {
  const out = Array.from({ length: C }, (_, c) => b[c])
  for (const [index, value] of x) for (let c = 0; c < C; c++) out[c] += weights(index, c) * value
  return out
}
const floatWeight = (index: number, c: number) => W[index * C + c]

const rng = makeRng(SEED ^ 0x5eed)
const order = train.map((_, i) => i)
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  let loss = 0
  for (const i of order) {
    const { x, y } = train[i]
    const p = softmax(logits(x, floatWeight, bias))
    const weight = classWeight[y]
    loss -= weight * Math.log(Math.max(p[y], 1e-12))
    for (let c = 0; c < C; c++) {
      const target = c === y ? 1 - SMOOTH : SMOOTH / (C - 1)
      const g = weight * (p[c] - target)
      biasG[c] += g * g
      bias[c] -= (LR * g) / (Math.sqrt(biasG[c]) + 1e-8)
      for (const [index, value] of x) {
        const k = index * C + c
        const grad = g * value + L2 * W[k]
        G[k] += grad * grad
        W[k] -= (LR * grad) / (Math.sqrt(G[k]) + 1e-8)
      }
    }
  }
  console.log(`epoch ${epoch + 1}/${EPOCHS} loss ${(loss / order.length).toFixed(4)}`)
}

// ─── Quantise (int8, per-class scale) ───

const scale = Array.from({ length: C }, (_, c) => {
  let max = 0
  for (let i = 0; i < BUCKETS; i++) max = Math.max(max, Math.abs(W[i * C + c]))
  return max / 127 || 1
})
const Q = new Int8Array(BUCKETS * C)
for (let i = 0; i < BUCKETS; i++) for (let c = 0; c < C; c++) Q[i * C + c] = Math.max(-127, Math.min(127, Math.round(W[i * C + c] / scale[c])))
const quantWeight = (index: number, c: number) => Q[index * C + c] * scale[c]

// ─── Calibration: temperature on the validation split ───

function nll(rows: Row[], temperature: number): number {
  let total = 0
  for (const { x, y } of rows) total -= Math.log(Math.max(softmax(logits(x, quantWeight, bias).map((v) => v / temperature))[y], 1e-12))
  return total / Math.max(1, rows.length)
}
let temperature = 1
let best = Infinity
for (let t = 0.2; t <= 4.001; t += 0.02) {
  const value = nll(validation, t)
  if (value < best) { best = value; temperature = Math.round(t * 100) / 100 }
}
console.log(`temperature ${temperature} (validation NLL ${best.toFixed(4)})`)

// ─── Evaluation ───

const predict = (x: FeatureVector): IntentPrediction => {
  const probs = softmax(logits(x, quantWeight, bias).map((v) => v / temperature))
  let top = 0
  for (let c = 1; c < C; c++) if (probs[c] > probs[top]) top = c
  return { label: INTENT_LABELS[top], probabilities: Object.fromEntries(INTENT_LABELS.map((l, c) => [l, probs[c]])) as Record<IntentLabel, number>, modelVersion: 'candidate', available: true }
}

function evaluateRows(rows: Row[]) {
  const confusion = Array.from({ length: C }, () => new Array(C).fill(0))
  let correct = 0
  const bins = Array.from({ length: 10 }, () => ({ n: 0, conf: 0, acc: 0 }))
  // Enforced: what users see (model-only blocks stay in shadow by default).
  // Full: what would happen with model-only blocks switched on (the canary decision).
  const tally = { enforced: { tp: 0, fp: 0, fn: 0, tn: 0 }, full: { tp: 0, fp: 0, fn: 0, tn: 0 } }
  for (const row of rows) {
    const prediction = predict(row.x)
    const top = labelIndex(prediction.label)
    confusion[row.y][top]++
    if (top === row.y) correct++
    const confidence = prediction.probabilities[prediction.label]
    const bin = bins[Math.min(9, Math.floor(confidence * 10))]
    bin.n++; bin.conf += confidence; bin.acc += top === row.y ? 1 : 0
    const views = normalize(row.ex.text)
    const decision = decide({ hits: runDetectors(views).hits, intent: prediction, text: row.ex.text })
    for (const [mode, blocked] of [['enforced', decision.decision === 'BLOCK' && decision.basis !== 'model'], ['full', decision.decision === 'BLOCK']] as const) {
      const t = tally[mode]
      if (blocked && row.ex.block) t.tp++
      else if (blocked) t.fp++
      else if (row.ex.block) t.fn++
      else t.tn++
    }
  }
  const policyOf = (t: { tp: number; fp: number; fn: number; tn: number }) => ({
    blockPrecision: +(t.tp / Math.max(1, t.tp + t.fp)).toFixed(4),
    blockRecall: +(t.tp / Math.max(1, t.tp + t.fn)).toFixed(4),
    falsePositiveRate: +(t.fp / Math.max(1, t.fp + t.tn)).toFixed(4),
  })
  const perClass = INTENT_LABELS.map((label, c) => {
    const tpc = confusion[c][c]
    const predicted = confusion.reduce((s, r) => s + r[c], 0)
    const actual = confusion[c].reduce((s, v) => s + v, 0)
    const precision = predicted ? tpc / predicted : 0
    const recall = actual ? tpc / actual : 0
    return { label, precision: +precision.toFixed(4), recall: +recall.toFixed(4), f1: precision + recall ? +((2 * precision * recall) / (precision + recall)).toFixed(4) : 0, support: actual }
  })
  const ece = bins.reduce((s, b) => s + (b.n ? (b.n / rows.length) * Math.abs(b.acc / b.n - b.conf / b.n) : 0), 0)
  return {
    accuracy: +(correct / Math.max(1, rows.length)).toFixed(4),
    ece: +ece.toFixed(4),
    perClass,
    policy: policyOf(tally.enforced),
    policyWithModelBlocks: policyOf(tally.full),
  }
}

const testMetrics = evaluateRows(test)
const validationMetrics = evaluateRows(validation)
console.log('test', JSON.stringify(testMetrics, null, 2))

if (args.includes('--report')) {
  const errors = new Map<string, { n: number; wrong: number; samples: string[] }>()
  for (const row of test) {
    const prediction = predict(row.x)
    const views = normalize(row.ex.text)
    const decision = decide({ hits: runDetectors(views).hits, intent: prediction, text: row.ex.text })
    const blocked = decision.decision === 'BLOCK' && decision.basis !== 'model'
    const entry = errors.get(row.ex.family) ?? { n: 0, wrong: 0, samples: [] }
    entry.n++
    if (prediction.label !== row.ex.label || blocked !== row.ex.block) {
      entry.wrong++
      if (entry.samples.length < 3) entry.samples.push(`${JSON.stringify(row.ex.text)} → ${prediction.label} ${prediction.probabilities[prediction.label].toFixed(2)}${blocked !== row.ex.block ? (blocked ? ' BLOCKED' : ' MISSED') : ''}`)
    }
    errors.set(row.ex.family, entry)
  }
  for (const [family, entry] of [...errors].filter(([, e]) => e.wrong).sort((a, b) => b[1].wrong - a[1].wrong)) {
    console.log(`${family.padEnd(20)} ${entry.wrong}/${entry.n}`)
    for (const sample of entry.samples) console.log(`    ${sample}`)
  }
}

// Release gates (docs/trust/MODEL_CARD.md), on template families held out of training.
const gates = [
  ['enforced block recall ≥ 0.97', testMetrics.policy.blockRecall >= 0.97],
  ['enforced false-positive rate ≤ 0.005', testMetrics.policy.falsePositiveRate <= 0.005],
  ['calibration error ≤ 0.15', testMetrics.ece <= 0.15],
] as const
console.log(`with model-only blocks on (canary): ${JSON.stringify(testMetrics.policyWithModelBlocks)}`)
for (const [gate, ok] of gates) console.log(`${ok ? 'PASS' : 'FAIL'} ${gate}`)
if (gates.some(([, ok]) => !ok)) {
  console.error('A release gate failed: the model was not written.')
  process.exit(1)
}
if (CHECK_ONLY) process.exit(0)

// The shipped model learns from every family; the metrics above are the held-out estimate.
{
  const everything = [...train, ...validation, ...test]
  W.fill(0); G.fill(0); bias.fill(0); biasG.fill(0)
  const all = everything.map((_, i) => i)
  const allCounts = new Array(C).fill(0)
  for (const row of everything) allCounts[row.y]++
  const allWeight = allCounts.map((n) => (n ? everything.length / (C * n) : 0))
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [all[i], all[j]] = [all[j], all[i]] }
    for (const i of all) {
      const { x, y } = everything[i]
      const p = softmax(logits(x, floatWeight, bias))
      for (let c = 0; c < C; c++) {
        const target = c === y ? 1 - SMOOTH : SMOOTH / (C - 1)
        const g = allWeight[y] * (p[c] - target)
        biasG[c] += g * g
        bias[c] -= (LR * g) / (Math.sqrt(biasG[c]) + 1e-8)
        for (const [index, value] of x) {
          const k = index * C + c
          const grad = g * value + L2 * W[k]
          G[k] += grad * grad
          W[k] -= (LR * grad) / (Math.sqrt(G[k]) + 1e-8)
        }
      }
    }
  }
  for (let c = 0; c < C; c++) {
    let max = 0
    for (let i = 0; i < BUCKETS; i++) max = Math.max(max, Math.abs(W[i * C + c]))
    scale[c] = max / 127 || 1
  }
  for (let i = 0; i < BUCKETS; i++) for (let c = 0; c < C; c++) Q[i * C + c] = Math.max(-127, Math.min(127, Math.round(W[i * C + c] / scale[c])))
  console.log(`retrained on all ${everything.length} examples for release`)
}

const trainedAt = new Date().toISOString()
// Dataset and weights both name the version: retraining after a feature change gives a new one.
const weightsHash = createHash('sha256').update(Buffer.from(Q.buffer)).update(JSON.stringify([bias, scale, temperature])).digest('hex').slice(0, 6)
const version = `trust2-intent-${trainedAt.slice(0, 10).replace(/-/g, '')}-${datasetHash.slice(0, 6)}${weightsHash}`
const artifact = `// Generated by src/scripts/trainContactModel.ts — do not edit by hand.
// ${examples.length} synthetic and adversarial examples, seed ${SEED}; see docs/trust/MODEL_CARD.md.
export const CONTACT_INTENT_MODEL = {
  version: '${version}',
  featureVersion: '${FEATURE_VERSION}',
  normalizerVersion: '${NORMALIZER_VERSION}',
  labels: ${JSON.stringify(INTENT_LABELS)},
  buckets: ${BUCKETS},
  temperature: ${temperature},
  bias: ${JSON.stringify([...bias].map((v) => +v.toFixed(6)))},
  scale: ${JSON.stringify(scale.map((v) => +v.toPrecision(8)))},
  weights: '${Buffer.from(Q.buffer).toString('base64')}',
  trainedAt: '${trainedAt}',
  seed: ${SEED},
  datasetHash: '${datasetHash}',
  metrics: ${JSON.stringify({ test: testMetrics, validation: validationMetrics, examples: examples.length, train: train.length })},
} as const
`
writeFileSync(OUT, artifact)
console.log(`wrote ${version} (${(artifact.length / 1024).toFixed(0)} KB) to ${OUT}`)
