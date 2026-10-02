/**
 * TRUST-2 model features (spec §10). One function builds them for training
 * and for live screening, so the two can never drift apart.
 *
 * Hashed sparse features over the normalized views:
 *  - word unigrams, bigrams and skip-pairs (two words up to three apart, so
 *    "your mobile number" and "your number" share "your…number"), with digit
 *    runs reduced to their shape ("<d10>") so the model learns
 *    "my number is <d10>", not the number, and pronoun spellings folded
 *    (ur → your, u → you);
 *  - light character 3–4-grams of the compact view with digits as '#', a
 *    trace of obfuscation patterns a word tokenizer would destroy (§6.3) —
 *    kept faint, because on a synthetic corpus they memorise templates;
 *  - the deterministic detectors' outputs, so the model weighs structure
 *    together with phrasing (§10 rule_hits).
 */
import type { NormalizedViews } from './normalizer.js'
import type { DetectorResult } from './detectors.js'

export const FEATURE_VERSION = 'trust2-feat-2'
export const HASH_BITS = 15
export const BUCKETS = 1 << HASH_BITS

/** FNV-1a, 32-bit. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const FOLD: Record<string, string> = { ur: 'your', yr: 'your', yo: 'your', u: 'you', ya: 'you', ma: 'my', mi: 'my', pls: 'please', plz: 'please', abeg: 'please', kindly: 'please', wats: 'whats', wat: 'what', gimme: 'give' }

function shapeToken(token: string): string {
  if (FOLD[token]) return FOLD[token]
  if (/^\d+$/.test(token)) {
    const n = token.length
    return n <= 2 ? '<d2>' : n <= 5 ? '<d5>' : n <= 8 ? '<d8>' : n <= 10 ? '<d10>' : '<dlong>'
  }
  return token
}

export type FeatureVector = Map<number, number>

function add(features: FeatureVector, key: string, value = 1) {
  const index = hash(key) & (BUCKETS - 1)
  features.set(index, (features.get(index) ?? 0) + value)
}

export function extractFeatures(views: NormalizedViews, detected: DetectorResult): FeatureVector {
  const features: FeatureVector = new Map()
  const tokens = views.digitWords.split(' ').filter(Boolean).slice(0, 120).map(shapeToken)
  for (let i = 0; i < tokens.length; i++) {
    add(features, `w:${tokens[i]}`)
    if (i + 1 < tokens.length) add(features, `b:${tokens[i]}_${tokens[i + 1]}`)
    for (let gap = 2; gap <= 3 && i + gap < tokens.length; gap++) add(features, `s:${tokens[i]}_${tokens[i + gap]}`, 0.5)
  }
  const chars = `^${views.compact.replace(/\d/g, '#').slice(0, 400)}$`
  for (let n = 3; n <= 4; n++) {
    for (let i = 0; i + n <= chars.length; i++) add(features, `c${n}:${chars.slice(i, i + n)}`, 0.08)
  }
  for (const hit of detected.hits) {
    add(features, `d:${hit.detector}`)
    add(features, `k:${hit.kind}`, hit.confidence)
    if (hit.obfuscated) add(features, `o:${hit.kind}`)
  }
  const digits = (views.digitWords.match(/\d/g) ?? []).length
  add(features, `digits:${digits === 0 ? 0 : digits < 5 ? 1 : digits < 9 ? 2 : 3}`)
  add(features, `len:${tokens.length < 4 ? 0 : tokens.length < 12 ? 1 : tokens.length < 40 ? 2 : 3}`)
  if (views.homoglyphsFound) add(features, 'x:homoglyphs')
  if (views.scriptMixed) add(features, 'x:mixed_script')
  add(features, 'bias')

  // L2-normalise so long messages do not dominate by volume of n-grams.
  let norm = 0
  for (const value of features.values()) norm += value * value
  norm = Math.sqrt(norm) || 1
  for (const [index, value] of features) features.set(index, value / norm)
  return features
}
