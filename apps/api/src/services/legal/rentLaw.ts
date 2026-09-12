/**
 * Ghanaian rent law: the statutory facts, and the parsing needed to apply them.
 *
 * This module exists because the abuse checker was accusing landlords of
 * crimes they had not committed. Its advance rule fired on the bare word
 * "advance", so "my landlord asked for 3 months rent advance which I paid
 * happily" — a perfectly lawful arrangement — was reported as an Excessive
 * Rent Advance violation at HIGH severity, carrying a stated penalty of
 * imprisonment. "My landlord did not ask for any advance and has been fair"
 * was reported the same way.
 *
 * A tenant acting on that goes to Rent Control to accuse someone who did
 * nothing wrong. A false accusation of a crime is a worse failure than
 * missing a real violation, and it is the failure mode keyword matching is
 * most prone to.
 *
 * So the legal thresholds live here as data with their citations, and the
 * quantities and polarity are extracted deterministically. None of this is a
 * learning problem: "is 3 more than 6" is arithmetic, and getting it wrong is
 * not a matter of model quality.
 *
 * Sources are the curated corpus in bootstrapLegalDocs.ts, which is the
 * team's reviewed statement of the law. Thresholds are NOT invented here.
 */

/** Statutory limits, each carrying the provision it comes from. */
export const RENT_LAW = {
  /**
   * Rent Act, 1963 (Act 220) s.25: a landlord cannot demand more than six
   * months' rent in advance. Six is lawful; seven is not.
   */
  maxAdvanceMonths: 6,
  advanceCitation: 'Rent Act, 1963 (Act 220), Section 25',
  evictionCitation: 'Rent Act, 1963 (Act 220), Sections 17-20',
  receiptCitation: 'Rent Act, 1963 (Act 220), Section 23',
  maintenanceCitation: 'Rent Act, 1963 (Act 220), Section 12',
} as const

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  eighteen: 18, twenty: 20, 'twenty-four': 24, 'twenty four': 24,
  half: 0.5,
}

/**
 * Words that negate a claim when they appear shortly before it.
 *
 * Scope is intentionally short. "did not ask for advance" negates; "did not
 * like the flat, and he asked for 12 months advance" must not.
 */
const NEGATIONS = [
  'not', "n't", 'never', 'no', 'none', 'without', 'neither', 'nor',
  "didn't", "doesn't", "hasn't", "haven't", "wasn't", "isn't", "won't",
  'refused to', 'declined to',
]

/** How many words before a match a negation still reaches. */
const NEGATION_WINDOW = 4

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9'’\s-]/g, ' ').split(/\s+/).filter(Boolean)
}

/**
 * Whether the phrase at `index` is negated by something just before it.
 *
 * Deliberately conservative: a missed negation produces a false accusation,
 * which is the outcome this module exists to prevent.
 */
export function isNegated(text: string, phrase: string): boolean {
  const tokens = tokenize(text)
  const phraseTokens = tokenize(phrase)
  if (phraseTokens.length === 0) return false

  for (let i = 0; i <= tokens.length - phraseTokens.length; i++) {
    if (!phraseTokens.every((t, k) => tokens[i + k] === t)) continue

    const windowStart = Math.max(0, i - NEGATION_WINDOW)
    const before = tokens.slice(windowStart, i)
    const beforeText = ` ${before.join(' ')} `
    if (NEGATIONS.some(n => beforeText.includes(` ${n} `) || beforeText.includes(n))) {
      return true
    }
  }
  return false
}

export interface AdvanceClaim {
  /** Months of advance the text describes, once years are converted. */
  months: number
  /** The phrase the number was read from, for showing our working. */
  matched: string
  /** True when the text says the advance was NOT demanded. */
  negated: boolean
}

/**
 * Read how many months of rent advance the text describes.
 *
 * Handles digits and words, months and years, and the Ghanaian idiom of
 * quoting advance in years ("two years advance" = 24 months). Returns the
 * LARGEST figure found: a complaint that mentions both what was asked and
 * what was paid is about the larger demand.
 */
export function extractAdvanceMonths(text: string): AdvanceClaim | null {
  const lower = text.toLowerCase()
  const numberWordAlternatives = Object.keys(NUMBER_WORDS)
    .sort((a, b) => b.length - a.length)
    .map(w => w.replace(/[-\s]/g, '[-\\s]'))
    .join('|')

  // "<n> months/years" appearing within a sentence that also mentions advance.
  const quantity = new RegExp(
    `(\\d+(?:\\.\\d+)?|${numberWordAlternatives})\\s*(?:-|\\s)?\\s*(month|months|year|years|yr|yrs)`,
    'gi',
  )

  let best: AdvanceClaim | null = null
  for (const sentence of lower.split(/[.;!?\n]+/)) {
    if (!/\b(advance|upfront|up front|pay ahead|in advance|deposit ahead)\b/.test(sentence)) continue

    quantity.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = quantity.exec(sentence)) !== null) {
      const raw = m[1].trim()
      const value = /^\d/.test(raw) ? parseFloat(raw) : NUMBER_WORDS[raw.replace(/[-\s]+/g, ' ')] ?? NUMBER_WORDS[raw]
      if (value === undefined || Number.isNaN(value)) continue

      const months = /^y/.test(m[2]) ? value * 12 : value
      if (!best || months > best.months) {
        best = { months, matched: m[0].trim(), negated: isNegated(sentence, 'advance') }
      }
    }
  }

  return best
}

export type AdvanceVerdict =
  /** A figure was stated and it exceeds the statutory maximum. */
  | { kind: 'violation'; months: number; matched: string }
  /** A figure was stated and it is within the law. */
  | { kind: 'lawful'; months: number; matched: string }
  /** Advance is discussed but no figure given — we cannot say either way. */
  | { kind: 'unclear' }
  /** The text says no advance was demanded. */
  | { kind: 'not_applicable' }

/**
 * Apply s.25 to whatever the text actually says about advance.
 *
 * The three-way outcome is the point. The old code had two — violation or
 * silence — so any mention of advance became an accusation. "Unclear" is an
 * honest answer and the common one: most people describe a situation without
 * stating a number.
 */
export function assessAdvance(text: string): AdvanceVerdict {
  const lower = text.toLowerCase()
  const mentionsAdvance = /\b(advance|upfront|up front|pay ahead|in advance)\b/.test(lower)
  if (!mentionsAdvance) return { kind: 'not_applicable' }

  if (isNegated(text, 'advance')) return { kind: 'not_applicable' }

  const claim = extractAdvanceMonths(text)
  if (!claim) return { kind: 'unclear' }
  if (claim.negated) return { kind: 'not_applicable' }

  return claim.months > RENT_LAW.maxAdvanceMonths
    ? { kind: 'violation', months: claim.months, matched: claim.matched }
    : { kind: 'lawful', months: claim.months, matched: claim.matched }
}
