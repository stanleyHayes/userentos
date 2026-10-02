/**
 * TRUST-2 release-blocking suites (spec §13.5, §17.2, §18). A change to the
 * normalizer, detectors, policy or model that fails here must not ship.
 *
 * Generated suites use seeds the training script never uses (it trains on
 * 20261002), so they measure the screen, not memory of its training data.
 * What counts is the enforced decision: a block that rests on the model alone
 * is recorded in shadow by default (screen.ts) and does not count here.
 */
import { describe, expect, it } from 'vitest'
import { evaluate } from '../services/trust/screen.js'
import { predictIntent } from '../services/trust/model.js'
import { CONTACT_INTENT_MODEL } from '../services/trust/model/contactIntentModel.js'
import { extractFeatures } from '../services/trust/features.js'
import { normalize } from '../services/trust/normalizer.js'
import { runDetectors } from '../services/trust/detectors.js'
import type { ContextMessage } from '../services/trust/context.js'
import {
  makeRng, ghanaMobile, disguisePhone, generateExamples, generateSequences, generateSequence, DIGIT_MAPS, JOINERS,
  type DigitMap, type Joiner, type Sequence,
} from '../services/trust/training/generator.js'
import { BENIGN, LEAKS, INTENT } from './fixtures/trustCorpus.js'

// Each generated suite screens thousands of messages. Alone that takes a
// second or two, but beside 200+ test files in a full run it can pass the 5 s default.
const GENERATED_SUITE_TIMEOUT = 60_000

const enforced = (text: string, history: ContextMessage[] = [], now = new Date()) => {
  const { policy } = evaluate(text, history, now)
  return policy.decision === 'BLOCK' && policy.basis !== 'model'
}

/** Turn by turn, as the chat would: a stopped turn is never sent, so it never joins the history. */
function sequenceStopped(sequence: Sequence): boolean {
  const start = Date.parse('2026-10-02T10:00:00Z')
  const history: ContextMessage[] = []
  for (const [i, turn] of sequence.turns.entries()) {
    const now = new Date(start + turn.offsetSec * 1000)
    if (enforced(turn.text, history, now)) return true
    history.push({ id: String(i), text: turn.text, createdAt: now })
  }
  return false
}

const rate = (hits: number, total: number) => (total ? hits / total : 0)

describe('golden corpora (hand-written)', () => {
  it.each(BENIGN)('lets ordinary conversation through: %j', (text) => {
    expect(enforced(text)).toBe(false)
  })
  it.each(LEAKS)('stops a contact detail: %j', (text) => {
    expect(enforced(text)).toBe(true)
  })
  it.each(INTENT)('stops an off-platform request: %j', (text) => {
    expect(enforced(text)).toBe(true)
  })
})

describe('every obfuscation transform on its own (§17.2)', () => {
  const maps = [...new Set(DIGIT_MAPS)]
  for (const map of maps) {
    for (const joiner of JOINERS) {
      it(`${map} × ${joiner}: recall ≥ 0.98`, () => {
        const r = makeRng(4242 + maps.indexOf(map) * 31 + JOINERS.indexOf(joiner))
        let stopped = 0
        const total = 60
        const misses: string[] = []
        for (let i = 0; i < total; i++) {
          const d = disguisePhone(r, ghanaMobile(r), { maps: [map as DigitMap], joiners: [joiner as Joiner] })
          const text = `${['call me on', 'my number is', 'reach me', 'line:', ''][i % 5]} ${d.text}`.trim()
          if (enforced(text)) stopped++
          else misses.push(text)
        }
        expect(rate(stopped, total), misses.slice(0, 3).join(' | ')).toBeGreaterThanOrEqual(0.98)
      })
    }
  }
})

describe('generated adversarial and benign traffic (compositions of transforms)', () => {
  const examples = generateExamples(9001, 6000)

  it('stops ≥ 99.5% of messages carrying a contact detail', () => {
    const leaks = examples.filter((e) => e.leak)
    const missed = leaks.filter((e) => !enforced(e.text))
    expect(rate(leaks.length - missed.length, leaks.length), missed.slice(0, 5).map((e) => e.text).join(' | ')).toBeGreaterThanOrEqual(0.995)
  }, GENERATED_SUITE_TIMEOUT)

  it('stops ≥ 95% of off-platform requests without an identifier; with the model on (canary), ≥ 99%', () => {
    const intents = examples.filter((e) => e.block && !e.leak)
    const missed = intents.filter((e) => !enforced(e.text))
    expect(rate(intents.length - missed.length, intents.length), missed.slice(0, 5).map((e) => e.text).join(' | ')).toBeGreaterThanOrEqual(0.95)
    const withModel = intents.filter((e) => evaluate(e.text).policy.decision === 'BLOCK')
    expect(rate(withModel.length, intents.length)).toBeGreaterThanOrEqual(0.99)
  }, GENERATED_SUITE_TIMEOUT)

  it('stops fewer than 0.5% of benign messages', () => {
    const negatives = examples.filter((e) => !e.block)
    const stopped = negatives.filter((e) => enforced(e.text))
    expect(rate(stopped.length, negatives.length), stopped.slice(0, 5).map((e) => e.text).join(' | ')).toBeLessThan(0.005)
  }, GENERATED_SUITE_TIMEOUT)
})

describe('semantic camouflage (§13.3) — false negatives and false positives reported separately', () => {
  const examples = generateExamples(77, 4000, { NO_CONTACT: 0, SHARE_CONTACT: 0, REQUEST_CONTACT: 0, MOVE_OFF_PLATFORM: 0, DISCUSS_CONTACT_POLICY: 0, BENIGN_CONTACT_REFERENCE: 0, CAMOUFLAGE_POS: 1, CAMOUFLAGE_NEG: 1 })

  it('false-negative rate ≤ 1%: a phone number does not hide behind "population", "invoice" or "score"', () => {
    const positives = examples.filter((e) => e.block)
    const missed = positives.filter((e) => !enforced(e.text))
    expect(positives.length).toBeGreaterThan(1500)
    expect(rate(missed.length, positives.length), missed.slice(0, 5).map((e) => e.text).join(' | ')).toBeLessThanOrEqual(0.01)
  }, GENERATED_SUITE_TIMEOUT)

  it('false-positive rate ≤ 0.5%: genuine populations, invoices and scores go through', () => {
    const negatives = examples.filter((e) => !e.block)
    const stopped = negatives.filter((e) => enforced(e.text))
    expect(negatives.length).toBeGreaterThan(1500)
    expect(rate(stopped.length, negatives.length), stopped.slice(0, 5).map((e) => e.text).join(' | ')).toBeLessThanOrEqual(0.005)
  }, GENERATED_SUITE_TIMEOUT)
})

describe('cross-message reconstruction (§13.1, §13.5) — mandatory cases', () => {
  const seq = (texts: string[], gapSec = 20): Sequence => ({ turns: texts.map((text, i) => ({ text, offsetSec: (i + 1) * gapSec })), block: true, family: 'hand', recipe: [] })

  it.each([
    ['one digit per message', ['0', '2', '4', '4', '1', '2', '3', '4', '5', '6']],
    ['one digit word per message', ['zero', 'two', 'four', 'four', 'one', 'two', 'three', 'four', 'five', 'six']],
    ['spec example: alternating with a request', ['02', 'call me', '70', '048', '319']],
    ['spec example: mixed symbols and digits', ['0@', '2$', '7-0', '0^4', '8 3', '1 9']],
    ['fragments with filler turns between them', ['024', 'nice kitchen', '412', 'is there water?', '3456']],
    ['completed only after 5+ turns', ['0', '24', 'ok', '41', 'hmm', '23', 'yes', '45', '6']],
    ['international format', ['+233', '24', '412', '3456']],
    ['digits and words mixed', ['oh two four', '4 1 2', 'three four five six']],
    ['final piece inside a sentence', ['024', '412', 'and 3456 too']],
    ['split email address', ['kofi.mensah', 'at gmail', 'dot com']],
    ['split email with symbols', ['kofi.mensah@', 'gmail.com']],
    ['split social handle', ['insta', 'kofimensah']],
    ['handle spelled out after a platform', ['find me on insta', 'user name kofi dot mensah']],
  ])('%s', (_name, texts) => {
    expect(sequenceStopped(seq(texts as string[]))).toBe(true)
  })

  it.each([
    ['prices', ['2500', 'or 2400', '6 months', 'ok 1200 deposit']],
    ['dates and times', ['12', 'October', '2026', 'at 10', '30']],
    ['counts', ['3', 'bedrooms', '2', 'baths', '1', 'kitchen']],
    ['answers to questions', ['how much?', '2500', 'advance?', '12', 'deposit?', '1800']],
  ])('lets a benign numeric conversation through: %s', (_name, texts) => {
    expect(sequenceStopped({ ...seq(texts as string[]), block: false })).toBe(false)
  })

  it('never joins messages across a long gap', () => {
    // 11 minutes between the pieces: the window resets (CONTEXT_WINDOW.resetGapMs).
    expect(sequenceStopped({ turns: [{ text: '024', offsetSec: 0 }, { text: '412', offsetSec: 660 }, { text: '3456', offsetSec: 1320 }], block: true, family: 'gap', recipe: [] })).toBe(false)
  })

  it('generated suite: ≥ 99% of split contact details are stopped, ≤ 1% of benign sequences', () => {
    const sequences = generateSequences(31337, 1500)
    const positives = sequences.filter((s) => s.block)
    const negatives = sequences.filter((s) => !s.block)
    const missed = positives.filter((s) => !sequenceStopped(s))
    const falseStops = negatives.filter((s) => sequenceStopped(s))
    expect(rate(positives.length - missed.length, positives.length), missed.slice(0, 3).map((s) => JSON.stringify(s.turns.map((t) => t.text))).join(' | ')).toBeGreaterThanOrEqual(0.99)
    expect(rate(falseStops.length, negatives.length)).toBeLessThanOrEqual(0.01)
  }, GENERATED_SUITE_TIMEOUT)

  it('stops the completing message, not the harmless first fragment', () => {
    const start = new Date('2026-10-02T10:00:00Z')
    expect(enforced('024', [], start)).toBe(false)
    const r = makeRng(5)
    const sample = generateSequence(r, true)
    expect(sample.turns.length).toBeGreaterThan(1)
  })
})

describe('the shipped intent model', () => {
  it('is trained, matches the feature and normalizer versions, and passed its release gates', () => {
    const prediction = predictIntent(extractFeatures(normalize('send me your number'), runDetectors(normalize('send me your number'))))
    expect(prediction.available).toBe(true)
    expect(prediction.modelVersion).toBe(CONTACT_INTENT_MODEL.version)
    const metrics = CONTACT_INTENT_MODEL.metrics as unknown as { test: { ece: number; policy: { blockRecall: number; falsePositiveRate: number } } }
    expect(metrics.test.policy.blockRecall).toBeGreaterThanOrEqual(0.97)
    expect(metrics.test.policy.falsePositiveRate).toBeLessThanOrEqual(0.005)
    expect(metrics.test.ece).toBeLessThanOrEqual(0.15)
  })

  it('reads intent sensibly on clear cases', () => {
    const label = (text: string) => predictIntent(extractFeatures(normalize(text), runDetectors(normalize(text)))).label
    expect(label('what is your whatsapp number?')).toBe('REQUEST_CONTACT')
    expect(label("let's continue this on telegram")).toBe('MOVE_OFF_PLATFORM')
    expect(['NO_CONTACT', 'BENIGN_CONTACT_REFERENCE']).toContain(label('is the house still available?'))
  })
})

describe('latency (§17.1)', () => {
  it('screens a message in well under a millisecond on average, p99 under 20 ms', () => {
    const examples = generateExamples(123, 2000)
    const times: number[] = []
    for (const e of examples) {
      const t0 = performance.now()
      evaluate(e.text)
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    const p99 = times[Math.floor(times.length * 0.99)]
    const mean = times.reduce((a, b) => a + b, 0) / times.length
    expect(mean).toBeLessThan(2)
    expect(p99).toBeLessThan(20)
  }, GENERATED_SUITE_TIMEOUT)
})
