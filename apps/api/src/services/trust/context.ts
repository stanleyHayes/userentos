/**
 * TRUST-2 conversation context (spec §13, mandatory). Catches contact details
 * spread across several sends — "024", "412", "3456"; "zero" → "two" → "four";
 * "0@" → "2$" → "7-0"; "kofi" → "at gmail" → "dot com" — by reassembling the
 * same author's recent messages in the same conversation and checking the
 * result.
 *
 * Bounded by design: only the author's last few messages in one conversation,
 * inside a short time window, and a long gap resets it. Nothing from other
 * authors or conversations is ever joined. The current message is blocked
 * when it is the one that completes a contact detail; earlier fragments stay
 * a "partial" score until then (§13.4).
 *
 * Reassembled phone numbers must match the Ghana numbering plan in full (a
 * leading 0, or 233): joining a conversation's prices, dates and counts must
 * not "find" a number. The shorter form without the 0 counts only when the
 * window also shows contact intent.
 */
import { normalize, NUMBER_WORDS } from './normalizer.js'
import { phonePlausibility, runDetectors, type RuleHit } from './detectors.js'

export interface ContextMessage {
  id: string
  text: string
  createdAt: Date
}

export interface ContextResult {
  /** 0..1: how strongly the reassembled window forms a contact detail completed by this message. */
  assemblyScore: number
  /** 0..1: a partial contact hypothesis (digits building up) that has not completed yet (§13.4). */
  partialScore: number
  hits: RuleHit[]
  /** The messages whose fragments formed the detail, for the audit trail (§13 provenance). */
  contributingIds: string[]
}

/**
 * Spec §13.2 suggests 5–10 author messages or 10–15 minutes as a start. Twenty
 * messages within 15 minutes covers an international number sent one digit at
 * a time with filler turns in between (§13.5), and costs little: only this
 * author's messages in this conversation are read.
 */
export const CONTEXT_WINDOW = { maxMessages: 20, maxAgeMs: 15 * 60 * 1000, resetGapMs: 10 * 60 * 1000 }

/** Messages inside the window, oldest first, cut at the first long gap going back. */
export function windowOf(history: ContextMessage[], now: Date): ContextMessage[] {
  const recent = history
    .filter((m) => now.getTime() - m.createdAt.getTime() <= CONTEXT_WINDOW.maxAgeMs)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-CONTEXT_WINDOW.maxMessages)
  let start = 0
  let previous = now
  for (let i = recent.length - 1; i >= 0; i--) {
    if (previous.getTime() - recent[i].createdAt.getTime() > CONTEXT_WINDOW.resetGapMs) { start = i + 1; break }
    previous = recent[i].createdAt
  }
  return recent.slice(start)
}

const LOOKALIKE_DIGITS: Record<string, string> = { o: '0', O: '0', '@': '0', i: '1', I: '1', l: '1', '|': '1', '!': '1', $: '5', s: '5', S: '5', B: '8', '&': '8' }

/** "zero", "two four", "oh", "double four": a message made only of number words and digits. */
function wordDigits(tokens: string[]): string | null {
  if (!tokens.length || tokens.length > 8) return null
  let out = ''
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (/^\d+$/.test(token)) { out += token; continue }
    const mapped = NUMBER_WORDS[token]
    if (mapped === undefined) return null
    if (mapped === 'x2' || mapped === 'x3') {
      const next = tokens[i + 1]
      const digit = next && (/^\d$/.test(next) ? next : NUMBER_WORDS[next])
      if (!digit || !/^\d$/.test(digit)) return null
      out += digit.repeat(mapped === 'x2' ? 2 : 3)
      i++
      continue
    }
    out += mapped
  }
  return out
}

export interface FragmentReading {
  /** Symbols dropped: "0@" → "0". */
  stripped: string
  /** Symbols read as look-alike digits: "0@" → "00". */
  mapped: string
}

/** The digits a message contributes when it is a fragment, or null when it is not one. */
export function fragmentReading(text: string): FragmentReading | null {
  const views = normalize(text)
  const tokens = views.spaced.split(' ').filter(Boolean)
  const words = wordDigits(tokens)
  if (words) return { stripped: words, mapped: words }
  const digits = views.digitWords.replace(/\D/g, '')
  if (!digits) return null
  const numericTokens = views.digitWords.split(' ').filter((t) => /\d/.test(t)).length
  const totalTokens = views.digitWords.split(' ').filter(Boolean).length
  const short = views.original.trim().length <= 14
  if (!(numericTokens / Math.max(1, totalTokens) >= 0.5 || short)) return null
  // Read symbols as stand-ins only in a compact, digit-led fragment like "0@" or "2$7".
  const compact = views.original.replace(/\s+/g, '')
  let mapped = ''
  if (compact.length <= 8 && /^\d/.test(compact)) {
    for (const ch of compact) mapped += /\d/.test(ch) ? ch : LOOKALIKE_DIGITS[ch] ?? ''
  }
  return { stripped: digits, mapped: mapped.length > digits.length ? mapped : digits }
}

/** A message that is mostly a number fragment. Ordinary sentences with a price or a date are not. */
export function isFragmentLike(text: string): boolean {
  return fragmentReading(text) !== null
}

/** The last digit group of an ordinary sentence ("and 3456 too"): a possible final fragment (§13.5). */
function trailingGroup(text: string): string | null {
  const groups = normalize(text).digitWords.match(/\d+/g)
  const last = groups?.[groups.length - 1]
  return last && last.length >= 2 && last.length <= 6 ? last : null
}

const STRONG = 0.85
/** Full Ghana formats: local with 0, or with 233 / 00233. */
const FULL_FORMATS = new Set(['phone.gh_mobile', 'phone.gh_mobile_intl', 'phone.gh_landline'])

const hasIntent = (text: string) => runDetectors(normalize(text)).hits.some((h) => h.kind === 'share' || h.kind === 'move_off' || h.kind === 'request')

function phoneAssembly(current: string, window: ContextMessage[], intentInWindow: boolean): ContextResult | null {
  const currentReading = fragmentReading(current)
  const tail = currentReading ? null : trailingGroup(current)
  if (!currentReading && !tail) return null
  const currentDigits = currentReading ?? { stripped: tail!, mapped: tail! }

  const fragments: { id: string; reading: FragmentReading }[] = []
  for (let i = window.length - 1; i >= 0; i--) {
    const reading = fragmentReading(window[i].text)
    if (!reading) continue
    fragments.unshift({ id: window[i].id, reading })
    // A sentence-embedded final piece needs at least two real fragments before it.
    if (!currentReading && fragments.length < 2) continue
    // A number split into pieces starts where a piece starts: only whole
    // fragments are joined, never a tail cut out of the middle of one (so
    // "2500", "2400", "6", "1200" cannot yield 0240061200).
    for (const variant of ['stripped', 'mapped'] as const) {
      const candidate = fragments.map((f) => f.reading[variant]).join('') + currentDigits[variant]
      if (candidate.length < 9 || candidate.length > 15) continue
      const plausible = phonePlausibility(candidate)
      if (!plausible || plausible.score < STRONG) continue
      const accepted = FULL_FORMATS.has(plausible.detector) || (plausible.detector === 'phone.gh_mobile_no_zero' && intentInWindow)
      if (!accepted) continue
      return {
        assemblyScore: plausible.score,
        partialScore: 1,
        hits: [{ detector: 'context.phone_assembly', kind: 'phone', confidence: plausible.score, view: 'context', obfuscated: true, masked: `${candidate.length}-digit number across ${fragments.length + 1} messages` }],
        contributingIds: fragments.map((f) => f.id),
      }
    }
  }
  return null
}

export function reconstruct(current: string, history: ContextMessage[], now = new Date()): ContextResult {
  const window = windowOf(history, now)
  const empty: ContextResult = { assemblyScore: 0, partialScore: 0, hits: [], contributingIds: [] }
  if (!window.length) return empty
  const intentInWindow = window.some((m) => hasIntent(m.text)) || hasIntent(current)

  const phone = phoneAssembly(current, window, intentInWindow)
  if (phone) return phone

  // Emails, handles and links typed in pieces: join the window's text and see
  // whether a detail appears that was not there before this message.
  const strongKinds = (text: string) => runDetectors(normalize(text)).hits.filter((h) => (h.kind === 'email' || h.kind === 'handle' || h.kind === 'domain') && h.confidence >= STRONG && h.detector !== 'handle.at')
  if (strongKinds(current).length === 0) {
    for (let k = 1; k <= window.length; k++) {
      const slice = window.slice(-k)
      const joinedBefore = slice.map((m) => m.text).join(' ')
      const before = strongKinds(joinedBefore).length + strongKinds(joinedBefore.replace(/\s+/g, '')).length
      const after = [...strongKinds(`${joinedBefore} ${current}`), ...strongKinds(`${slice.map((m) => m.text).join('')}${current}`)]
      if (after.length > before) {
        return {
          assemblyScore: Math.max(...after.map((h) => h.confidence)),
          partialScore: 1,
          hits: after.map((h) => ({ ...h, detector: `context.${h.kind}_assembly`, view: 'context' as const, obfuscated: true })),
          contributingIds: slice.map((m) => m.id),
        }
      }
    }
  }

  // A platform named alone, then a bare name: "insta" … "kofimensah".
  const PLATFORM_ONLY = /^(?:my\s+)?(?:ig|insta|instagram|snap|snapchat|tiktok|telegram|tg|facebook|fb|twitter|x|threads)(?:\s+(?:is|name|handle|account|id))?$/
  const lastTurn = window[window.length - 1]
  if (lastTurn && PLATFORM_ONLY.test(normalize(lastTurn.text).spaced) && /^@?[a-z0-9][a-z0-9_.]{3,29}$/i.test(current.trim().replace(/^(?:is|it'?s)\s+/i, ''))) {
    return {
      assemblyScore: 0.9,
      partialScore: 1,
      hits: [{ detector: 'context.handle_assembly', kind: 'handle', confidence: 0.9, view: 'context', obfuscated: true, masked: '<handle> across 2 messages' }],
      contributingIds: [lastTurn.id],
    }
  }

  // Intent in one message, phone-shaped digits in the next: "you can reach me" … "0244123".
  const intentBefore = window.some((m) => hasIntent(m.text))
  const reading = fragmentReading(current)
  const digits = reading?.stripped ?? normalize(current).digitWords.replace(/\D/g, '')
  const phoneShaped = Boolean(reading) || /^(?:0[235]|233|\+233)/.test(digits)
  if (intentBefore && digits.length >= 6 && phoneShaped) {
    return {
      assemblyScore: 0.9,
      partialScore: 1,
      hits: [{ detector: 'context.intent_then_digits', kind: 'phone', confidence: 0.9, view: 'context', obfuscated: true, masked: `${digits.length} digits after a contact request` }],
      contributingIds: window.map((m) => m.id),
    }
  }

  // Not complete yet: how far digit fragments have built up (deferred risk, §13.4).
  const built = window.map((m) => fragmentReading(m.text)?.stripped ?? '').join('') + (reading?.stripped ?? '')
  return { ...empty, partialScore: Math.min(1, built.length / 10) }
}
