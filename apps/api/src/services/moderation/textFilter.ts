/**
 * Objectionable-content filter for user-generated text (App Store Review
 * Guideline 1.2, Google Play UGC policy).
 *
 * Deterministic on purpose: the same text always gets the same answer, it runs
 * in-process with no provider call, and every decision can be explained by
 * pointing at a line in the lists below. It is a first line, not the whole
 * defence — user reports and the admin queue (routes/contentReports.ts) handle
 * what a word list cannot.
 *
 * Two outcomes besides "allow":
 *  - reject: slurs, sexual content involving children, threats of violence and
 *    abuse aimed at the reader. The request fails with NEUTRAL_REJECTION.
 *  - flag: profanity, sexual terms and insults that also have innocent uses
 *    ("a chink of light", "spic and span", "rape" in a report of one). The
 *    content is kept and an automated report goes to the moderation queue.
 *
 * Matching is on whole words after normalisation, so "Scunthorpe" and
 * "spices" never match a shorter term inside them. Normalisation undoes the
 * common evasions: case, accents, leetspeak inside a word (sh!t, n1gger),
 * punctuation inside a word (f.u.c.k), letters spaced apart (f u c k) and
 * stretched letters (fuuuck).
 *
 * Maintaining the lists: add the exact word; add inflections that are not just
 * a trailing "s" explicitly (bitches, fucking). Put a term under the flag
 * lists if it has any common innocent meaning. Twi is normalised the same way
 * (ɛ→e, ɔ→o), so write it in plain Latin letters.
 */

export type ModerationCategory = 'slur' | 'sexual' | 'threat' | 'harassment' | 'profanity'

export type FilterVerdict =
  | { action: 'allow' }
  | { action: 'flag' | 'reject'; categories: ModerationCategory[]; matches: string[] }

/** Shown to the author of rejected content. Deliberately says nothing about which word. */
export const NEUTRAL_REJECTION = 'This content appears to contain abusive, threatening or sexually explicit language, so it cannot be posted. Please rephrase it.'

type Rule = { term: string; category: ModerationCategory }
const rules = (category: ModerationCategory, terms: string[]): Rule[] => terms.map((term) => ({ term, category }))

/** Whole words that are never acceptable here. */
const REJECT_WORDS: Rule[] = [
  ...rules('slur', ['nigger', 'niggers', 'faggot', 'faggots', 'kike', 'kikes', 'wetback', 'wetbacks']),
  ...rules('sexual', ['childporn', 'kiddieporn']),
  ...rules('threat', ['kys']),
]

/** Multi-word phrases that are never acceptable here. */
const REJECT_PHRASES: Rule[] = [
  ...rules('sexual', ['child porn', 'kiddie porn', 'sex with a child', 'sex with children']),
  ...rules('threat', ['kill yourself', 'hang yourself']),
  ...rules('harassment', ['fuck you', 'fuck u', 'fuck off', 'fuck your mother', 'fuck your mum']),
  // Twi: "your mother's genitals" — a grave insult.
  ...rules('harassment', ['wo maame twe', 'wo maame etwe', 'wo ni twe', 'wo nie twe']),
]

/** Words kept for a human to judge: offensive in most uses, innocent in some. */
const FLAG_WORDS: Rule[] = [
  ...rules('slur', ['nigga', 'niggas', 'fag', 'fags', 'chink', 'chinks', 'coon', 'coons', 'spic', 'spics', 'retard', 'retards', 'retarded', 'tranny', 'trannies', 'dyke', 'dykes']),
  ...rules('sexual', ['porn', 'porno', 'pornography', 'nudes', 'blowjob', 'handjob', 'pussy', 'rape', 'raped', 'rapist', 'whore', 'whores', 'slut', 'sluts', 'pedo', 'paedo', 'pedophile', 'paedophile', 'etwe']),
  ...rules('profanity', ['fuck', 'fucks', 'fucking', 'fucked', 'fucker', 'fuckers', 'motherfucker', 'motherfuckers', 'shit', 'shits', 'shitty', 'bullshit', 'bitch', 'bitches', 'bastard', 'bastards', 'asshole', 'assholes', 'dickhead', 'cunt', 'cunts']),
  // Twi insults: "fool", "stupid".
  ...rules('harassment', ['kwasia', 'kwasea', 'gyimii', 'gyimi']),
]

const FLAG_PHRASES: Rule[] = [
  // Sex-for-rent solicitation is a known abuse of rental platforms.
  ...rules('sexual', ['sex for rent', 'sleep with me', 'send nudes', 'send me nudes']),
  ...rules('slur', ['kojo besia']),
]

const INSULTS = '(?:bitch|whore|slut|cunt|bastard|asshole|motherfucker|faggot|retard|kwasia|kwasea|gyimii)'
/** Words that may sit between a speaker and a violent verb without changing who is threatening whom. */
const FILLER = '(?:will|ll|shall|would|am|m|going|gonna|to|go|come|and|dey|really|just|definitely|surely|swear|promise|personally|find|you|then)'

/**
 * Patterns over the normalised text. A threat needs a first-person speaker and
 * only filler in between, so "the traffic will kill you" and "I think the fees
 * will kill you" pass.
 */
const REJECT_PATTERNS: Array<{ pattern: RegExp; category: ModerationCategory; label: string }> = [
  {
    pattern: new RegExp(`\\b(?:i|we|ill|im|imma|ima)(?:\\s+${FILLER}){0,6}\\s+(?:kill|murder|stab|shoot|rape|behead|butcher|burn)\\s+(?:you|u|ya|yu|ur|your|yall)\\b`),
    category: 'threat', label: 'threat of violence',
  },
  { pattern: /\b(?:youre|you are|u are)\s+(?:dead|a dead man|dead meat)\b(?!\s+(?:right|on|set|serious|tired|end))/, category: 'threat', label: 'threat of violence' },
  // Twi: "I will kill you" (me be kum wo / mekum wo).
  { pattern: /\bme\s*(?:be\s*)?kum\s+wo\b/, category: 'threat', label: 'threat of violence' },
  {
    pattern: new RegExp(`\\b(?:you|u|youre|woye|wo ye|wo)\\s+(?:are\\s+)?(?:a\\s+|an\\s+|such\\s+a\\s+)?(?:stupid\\s+|fucking\\s+|dirty\\s+|useless\\s+)?${INSULTS}s?\\b`),
    category: 'harassment', label: 'abuse aimed at the reader',
  },
]

const LEET: Record<string, string> = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' }

/** One raw token to plain lowercase letters, undoing leetspeak and inner punctuation. */
function normalizeToken(raw: string): string {
  // Leading and trailing punctuation is punctuation ("you!"); inside a word it is evasion ("sh!t").
  const core = raw.replace(/^[^\p{L}\p{N}@$]+|[^\p{L}\p{N}]+$/gu, '')
  return core.replace(/[0-9@$!|+]/g, (c) => LEET[c] ?? c).replace(/[^a-z]/g, '')
}

/** The text as whole words, with spaced-out single letters rejoined ("f u c k" → "fuck"). */
export function normalizeText(text: string): string[] {
  const plain = text
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ɛ/g, 'e').replace(/ɔ/g, 'o')
  const tokens = plain.split(/\s+/).map(normalizeToken).filter(Boolean)

  const words: string[] = []
  for (let i = 0; i < tokens.length;) {
    let j = i
    while (j < tokens.length && tokens[j].length === 1) j++
    if (j - i >= 3) { words.push(tokens.slice(i, j).join('')); i = j; continue }
    words.push(tokens[i]); i++
  }
  return words
}

// Stretched letters: "fuuuck" is "fuck", "cooon" is "coon". Runs of two are
// left alone ("good" must not become "god"), so both shrinks are tried.
const shrinkToOne = (w: string) => w.replace(/(.)\1{2,}/g, '$1')
const shrinkToTwo = (w: string) => w.replace(/(.)\1{2,}/g, '$1$1')

/** Spellings a word may be written in: as typed, shrunk, and without a plural "s". */
function variants(word: string): Set<string> {
  const set = new Set([word, shrinkToOne(word), shrinkToTwo(word)])
  for (const w of [...set]) if (w.length > 3 && w.endsWith('s')) set.add(w.slice(0, -1))
  return set
}

const indexOf = (list: Rule[]) => new Map(list.map((r) => [r.term, r.category]))
const REJECT_WORD_INDEX = indexOf(REJECT_WORDS)
const FLAG_WORD_INDEX = indexOf(FLAG_WORDS)

/** Classify one or more pieces of text written together (a title and body, a review's pros and cons). */
export function screenText(...parts: Array<string | undefined | null>): FilterVerdict {
  const words = parts.filter((p): p is string => typeof p === 'string' && p.length > 0).flatMap(normalizeText)
  if (!words.length) return { action: 'allow' }

  const hits = { reject: new Map<string, ModerationCategory>(), flag: new Map<string, ModerationCategory>() }
  for (const word of words) {
    for (const v of variants(word)) {
      const rejected = REJECT_WORD_INDEX.get(v)
      if (rejected) hits.reject.set(v, rejected)
      const flagged = FLAG_WORD_INDEX.get(v)
      if (flagged) hits.flag.set(v, flagged)
    }
  }

  const texts = new Set([words.join(' '), words.map(shrinkToOne).join(' '), words.map(shrinkToTwo).join(' ')])
  for (const text of texts) {
    const padded = ` ${text} `
    for (const { term, category } of REJECT_PHRASES) if (padded.includes(` ${term} `)) hits.reject.set(term, category)
    for (const { term, category } of FLAG_PHRASES) if (padded.includes(` ${term} `)) hits.flag.set(term, category)
    for (const { pattern, category, label } of REJECT_PATTERNS) if (pattern.test(text)) hits.reject.set(label, category)
  }

  const verdict = (action: 'reject' | 'flag', found: Map<string, ModerationCategory>): FilterVerdict =>
    ({ action, categories: [...new Set(found.values())], matches: [...found.keys()] })
  if (hits.reject.size) return verdict('reject', hits.reject)
  if (hits.flag.size) return verdict('flag', hits.flag)
  return { action: 'allow' }
}
