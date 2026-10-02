/**
 * TRUST-2 normalizer (spec §5). Builds internal views of a message that make
 * disguised contact details machine-detectable. The original text is never
 * changed or shown altered; these views exist only for the detectors and the
 * model, and every candidate keeps a pointer to the view it came from.
 *
 * Mappings are candidates, not assumptions (§5.2): a symbol becomes a digit
 * only inside a run that is already mostly digit-like, so passwords, code and
 * prose are not turned into phone numbers.
 */

export const NORMALIZER_VERSION = 'trust2-norm-1'

/** Latin look-alikes from Cyrillic, Greek and other scripts (§5.1 homoglyphs). */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', ѕ: 's', і: 'i', ј: 'j', ԁ: 'd', ӏ: 'l', ɡ: 'g',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', І: 'I', Ј: 'J',
  α: 'a', β: 'b', ε: 'e', ι: 'i', κ: 'k', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ν: 'v',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
  // Twi and Ewe letters, written as plain Latin in practice.
  ɛ: 'e', Ɛ: 'E', ɔ: 'o', Ɔ: 'O', ŋ: 'n', Ŋ: 'N',
}

/** Number words, including homophones and Twi (§5.1, §7). Mapped only in digit-dense context. */
export const NUMBER_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', nought: '0', nil: '0', hwee: '0',
  one: '1', won: '1', baako: '1',
  two: '2', to: '2', too: '2', mmienu: '2', abien: '2',
  three: '3', tree: '3', mmiensa: '3', abiesa: '3',
  four: '4', for: '4', fore: '4', anan: '4', enan: '4',
  five: '5', fife: '5', enum: '5', anum: '5',
  six: '6', sicks: '6', nsia: '6', asia: '6',
  seven: '7', nson: '7', ason: '7',
  eight: '8', ate: '8', nwotwe: '8', awotwe: '8',
  nine: '9', nein: '9', nkron: '9', akron: '9',
  double: 'x2', triple: 'x3',
}
/** Words that are also ordinary English; never the start of a number-word run on their own. */
const WEAK_NUMBER_WORDS = new Set(['o', 'oh', 'to', 'too', 'for', 'fore', 'won', 'ate', 'tree', 'nil', 'enum', 'asia', 'double', 'triple'])

/** Look-alike characters that stand in for digits inside a digit-like run (§5.1 leetspeak). */
const DIGIT_LOOKALIKES: Record<string, string> = {
  o: '0', O: '0', '@': '0', Q: '0', D: '0',
  i: '1', I: '1', l: '1', L: '1', '|': '1', '!': '1',
  z: '2', Z: '2',
  E: '3',
  A: '4',
  s: '5', S: '5', $: '5',
  b: '6', G: '6',
  t: '7', T: '7',
  B: '8', '&': '8',
  g: '9', q: '9',
}

export interface NormalizedViews {
  original: string
  /** NFKC + homoglyphs folded + lower case. */
  lower: string
  /** lower with punctuation turned into single spaces. */
  spaced: string
  /** lower with everything but letters, digits, @ and . removed: "n a m e @ g m a i l . c o m" → "name@gmail.com". */
  compact: string
  /** spaced with number words turned into digits where they run together. */
  digitWords: string
  /**
   * Each run of number words read with up to two weak words ("oh", "to",
   * "for", "won") dropped from either end: "oh to five … won for viewing" is a
   * number that starts with "oh" and ends with "won", in a sentence that
   * carries on with "for".
   */
  numberRunCandidates: string[]
  /** Digit-like runs with look-alike symbols mapped and separators removed. */
  symbolDigits: string[]
  /** Runs one digit short of a Ghana number with symbols inside: each with one '?' where a symbol may hide a digit. */
  wildcardDigits: string[]
  /** Email-shaped text recovered from "name at gmail dot com" forms. */
  verbalEmail: string
  /** Mixed scripts or homoglyphs were present: a risk feature, not a verdict. */
  homoglyphsFound: boolean
  scriptMixed: boolean
}

const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200D|\uFE0F|\u20E3/gu
const ZERO_WIDTH = /[\u200B-\u200F\u2060-\u2064\uFEFF]/g

function foldHomoglyphs(text: string): { text: string; found: boolean } {
  let found = false
  let out = ''
  for (const ch of text) {
    const mapped = HOMOGLYPHS[ch]
    if (mapped) { found = true; out += mapped } else out += ch
  }
  return { text: out, found }
}

function scriptsIn(text: string): Set<string> {
  const scripts = new Set<string>()
  for (const ch of text) {
    if (/\p{Script=Latin}/u.test(ch)) scripts.add('latin')
    else if (/\p{Script=Cyrillic}/u.test(ch)) scripts.add('cyrillic')
    else if (/\p{Script=Greek}/u.test(ch)) scripts.add('greek')
  }
  return scripts
}

const STRONG_WORDS = Object.keys(NUMBER_WORDS).filter((w) => !WEAK_NUMBER_WORDS.has(w) && w !== 'double' && w !== 'triple')

/**
 * "zerotwofourfour" → ["zero", "two", "four", "four"]: a token made entirely
 * of number words, at least three of them unambiguous. Ordinary words do not
 * decompose that way, so prose is left alone.
 */
export function splitJoinedNumberWords(token: string): string[] | null {
  if (token.length < 9 || !/^[a-z]+$/.test(token)) return null
  const words = Object.keys(NUMBER_WORDS).filter((w) => w.length > 1).sort((a, b) => b.length - a.length)
  const best: (string[] | null)[] = new Array(token.length + 1).fill(null)
  best[0] = []
  for (let i = 0; i < token.length; i++) {
    if (!best[i]) continue
    for (const word of words) {
      if (token.startsWith(word, i) && !best[i + word.length]) best[i + word.length] = [...best[i]!, word]
    }
  }
  const parts = best[token.length]
  if (!parts) return null
  return parts.filter((w) => STRONG_WORDS.includes(w)).length >= 3 ? parts : null
}

/**
 * Turns runs of number words (and digits between them) into digits; leaves
 * prose alone. By default weak words at the edges of a run are prose ("…
 * four for viewing", "send to zero …"); `greedy` keeps them, for numbers that
 * start or end with one ("oh to five …"). The phone detector reads both.
 */
export function numberWordsToDigits(spaced: string, options: { greedy?: boolean; keepLeading?: boolean; keepTrailing?: boolean } = {}): string {
  const tokens = spaced.split(' ').flatMap((token) => splitJoinedNumberWords(token) ?? [token])
  type Entry = { orig: string; mapped: string; weak: boolean; multi: boolean }
  const out: string[] = []
  let run: Entry[] = []

  const flush = () => {
    // "double four": the repeat word is as strong as the digit it repeats.
    run.forEach((e, i) => { if ((e.mapped === 'x2' || e.mapped === 'x3') && run[i + 1] && /^\d$/.test(run[i + 1].mapped)) e.weak = false })
    const trailing: string[] = []
    if (!options.greedy && !options.keepLeading) while (run.length && run[0].weak) out.push(run.shift()!.orig)
    if (!options.greedy && !options.keepTrailing) while (run.length && run[run.length - 1].weak) trailing.unshift(run.pop()!.orig)
    // A run becomes digits only if it is long enough to matter and has at
    // least two unambiguous number words or digits, so "go to for" stays prose.
    const strong = run.filter((e) => !e.weak).length
    const digits = expandRepeats(run.map((e) => e.mapped))
    if (digits.length >= 3 && strong >= 2) out.push(digits.join(''))
    else out.push(...run.map((e) => e.orig))
    out.push(...trailing)
    run = []
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const word = token.replace(/[^a-z0-9]/g, '')
    const isDigits = /^\d+$/.test(word)
    const mapped = NUMBER_WORDS[word]
    if (!isDigits && !mapped) {
      if (run.length) flush()
      out.push(token)
      continue
    }
    const weak = !isDigits && WEAK_NUMBER_WORDS.has(word)
    // "2026 to 2029", "1500 for 2": a weak word beside a multi-digit number is prose.
    if (weak) {
      const previous = run[run.length - 1]
      const next = tokens[i + 1]?.replace(/[^a-z0-9]/g, '') ?? ''
      if (previous?.multi || /^\d{2,}$/.test(next)) {
        if (run.length) flush()
        out.push(token)
        continue
      }
    }
    run.push({ orig: token, mapped: isDigits ? word : mapped, weak, multi: isDigits && word.length >= 2 })
  }
  if (run.length) flush()
  return out.join(' ')
}

/**
 * Digit strings from each run of number words and digits, with 0–2 weak words
 * trimmed from each end. Only runs that come to 6 or more digits are returned.
 */
export function numberRunCandidates(spaced: string): string[] {
  const tokens = spaced.split(' ').flatMap((token) => splitJoinedNumberWords(token) ?? [token])
  type Entry = { mapped: string; weak: boolean; multi: boolean }
  const runs: Entry[][] = []
  let run: Entry[] = []
  const end = () => { if (run.length) runs.push(run); run = [] }
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].replace(/[^a-z0-9]/g, '')
    const isDigits = /^\d+$/.test(word)
    const mapped = NUMBER_WORDS[word]
    if (!isDigits && !mapped) { end(); continue }
    const weak = !isDigits && WEAK_NUMBER_WORDS.has(word)
    if (weak) {
      const previous = run[run.length - 1]
      const next = tokens[i + 1]?.replace(/[^a-z0-9]/g, '') ?? ''
      if (previous?.multi || /^\d{2,}$/.test(next)) { end(); continue }
    }
    run.push({ mapped: isDigits ? word : mapped, weak, multi: isDigits && word.length >= 2 })
  }
  end()

  const out = new Set<string>()
  for (const entries of runs) {
    entries.forEach((e, i) => { if ((e.mapped === 'x2' || e.mapped === 'x3') && entries[i + 1] && /^\d$/.test(entries[i + 1].mapped)) e.weak = false })
    if (entries.filter((e) => !e.weak).length < 2) continue
    let lead = 0
    while (lead < 2 && lead < entries.length && entries[lead].weak) lead++
    let trail = 0
    while (trail < 2 && trail < entries.length - lead && entries[entries.length - 1 - trail].weak) trail++
    for (let i = 0; i <= lead; i++) {
      for (let j = 0; j <= trail; j++) {
        const digits = expandRepeats(entries.slice(i, entries.length - j).map((e) => e.mapped)).join('')
        if (digits.length >= 6) out.add(digits)
      }
    }
  }
  return [...out]
}

/** "double 4" → "44", "triple 0" → "000". */
function expandRepeats(run: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < run.length; i++) {
    const token = run[i]
    if ((token === 'x2' || token === 'x3') && i + 1 < run.length && /^\d$/.test(run[i + 1])) {
      out.push(run[i + 1].repeat(token === 'x2' ? 2 : 3))
      i++
    } else if (token !== 'x2' && token !== 'x3') {
      out.push(token)
    }
  }
  return out
}

/**
 * Digit-like runs: stretches where digits dominate once separators and
 * look-alike symbols are counted, e.g. "0@2$7-0^4 8 3 1 9" or "O24-I23-4567".
 *
 * A symbol may stand in for a digit or merely separate digits, so each run is
 * read three ways: everything mapped ("0@2" → 002); letters and $, &, @
 * mapped but other symbols dropped ("0|S|4" → 054); and everything dropped
 * ("0@2" → 02). Words at the
 * edges that carry no digit are left out ("price: 0$06…", "… 4567 thanks"),
 * except a single stand-alone look-alike ("Z 3 3 …", "… 9 |"), which is tried
 * both ways. A leading + is kept, so a foreign number is only ever read from an
 * explicit international form.
 */
/** Symbols that read as a digit far more often than as a separator: $ (5), & (8), @ (0). */
const DIGIT_LIKE_SYMBOLS = /[A-Za-z$&@]/
export function digitLikeRuns(text: string): string[] {
  const runs = new Set<string>()
  // Characters that can sit inside a disguised number.
  const run = /[+0-9OoIlL|!@$&SsZzBbGgTtqQDEA^\s.\-_/:;,()[\]{}*#~=•·]+/g
  // A short edge part made only of look-alikes ("OZ", "S", "g!", "|") may be the number's first or last digits.
  const lookalikePart = (part: string) => part.length <= 4 && [...part.replace(/^\+/, '').replace(/[.,;:]+$/, '')].every((ch) => Boolean(DIGIT_LOOKALIKES[ch]))
  for (const match of text.matchAll(run)) {
    const chunk = match[0]
    if ((chunk.match(/\d/g) ?? []).length < 3) continue
    const all = chunk.split(/\s+/).filter(Boolean)
    // A part cut out of a longer word ("O" of "OK", "s" of "thanks") is not part of the number.
    const end = (match.index ?? 0) + chunk.length
    if (/\p{L}/u.test(text[end] ?? '') && /\S$/.test(chunk) && all.length && !/\d/.test(all[all.length - 1])) all.pop()
    if (/\p{L}/u.test(text[(match.index ?? 0) - 1] ?? '') && /^\S/.test(chunk) && all.length && !/\d/.test(all[0])) all.shift()

    // Drop up to three digit-less parts from each end, one at a time; what is
    // left at an edge must be digits, O's or a short run of look-alikes.
    const variants = new Set<string>()
    const digitless = (part: string) => !/\d/.test(part)
    let lead = 0
    while (lead < 3 && lead < all.length && digitless(all[lead])) lead++
    let trail = 0
    while (trail < 3 && trail < all.length - lead && digitless(all[all.length - 1 - trail])) trail++
    for (let i = 0; i <= lead; i++) {
      for (let j = 0; j <= trail; j++) {
        const parts = all.slice(i, all.length - j)
        if (!parts.length) continue
        const edgeOk = (part: string) => !digitless(part) || /^[Oo]+$/.test(part) || lookalikePart(part)
        if (!edgeOk(parts[0]) || !edgeOk(parts[parts.length - 1])) continue
        const body = parts.join(' ')
        variants.add(body)
        variants.add(body.replace(/[!|.,;:]$/, ''))
        variants.add(body.replace(/[!|.,;:]+$/, ''))
      }
    }

    for (const body of variants) {
      const plus = body.trimStart().startsWith('+') ? '+' : ''
      const digits = (body.match(/\d/g) ?? []).length
      if (digits < 3) continue
      let mapped = ''
      let lettersOnly = ''
      let lookalikes = 0
      for (const ch of body) {
        if (/\d/.test(ch)) { mapped += ch; lettersOnly += ch } else if (DIGIT_LOOKALIKES[ch]) {
          mapped += DIGIT_LOOKALIKES[ch]
          lookalikes++
          if (DIGIT_LIKE_SYMBOLS.test(ch)) lettersOnly += DIGIT_LOOKALIKES[ch]
        }
      }
      // Mostly digit-like: a word with a couple of digits in it is not a disguised number.
      if (digits >= Math.max(3, Math.ceil(mapped.length * 0.3)) && lookalikes <= Math.ceil(mapped.length * 0.7)) {
        runs.add(plus + mapped)
        if (lettersOnly.length >= 3) runs.add(plus + lettersOnly)
        const stripped = body.replace(/\D/g, '')
        if (stripped.length >= 3) runs.add(plus + stripped)
      }
    }
  }
  return [...runs]
}

/**
 * "0@2$7-0^4 8 3 1 9": nine (or eleven, with 233) real digits and symbols
 * between them. Each interior symbol is tried as the hidden tenth digit.
 */
export function wildcardRuns(text: string): string[] {
  const out = new Set<string>()
  for (const match of text.matchAll(/\+?\d[\d\s@$^!|*#~&%:;/\\._-]{8,30}\d/g)) {
    const chunk = match[0]
    const digits = chunk.replace(/\D/g, '')
    if (digits.length !== 9 && digits.length !== 11) continue
    const symbols = chunk.replace(/[\d\s.-]/g, '')
    if (!symbols.length) continue
    let built = ''
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]
      if (/\d/.test(ch)) { built += ch; continue }
      if (/[\s.\-+]/.test(ch)) continue
      // A symbol between digits: try it as the missing digit.
      const before = built
      const after = chunk.slice(i + 1).replace(/\D/g, '')
      out.add(`${before}?${after}`)
    }
  }
  return [...out]
}

/** "stan at gmail dot com", "stan[at]gmail(dot)com", "s t a n @ gmail . com" → "stan@gmail.com". */
export function verbaliseEmail(lower: string): string {
  return lower
    .replace(/\s*[[({<]\s*(at|@)\s*[\])}>]\s*/g, '@')
    .replace(/\s*[[({<]\s*(dot|\.)\s*[\])}>]\s*/g, '.')
    .replace(/(\w)\s+(?:at|where)\s+(\w)/g, '$1@$2')
    .replace(/(\w)\s+(?:dot|period|point)\s+(\w)/g, '$1.$2')
    .replace(/\s*@\s*/g, '@')
    .replace(/\s*\.\s*(com|net|org|gh|io|me|co|edu|gov|info|biz|uk|us|ng)\b/g, '.$1')
}

export function normalize(text: string): NormalizedViews {
  const nfkc = text.normalize('NFKC').replace(ZERO_WIDTH, '')
  const { text: folded, found } = foldHomoglyphs(nfkc)
  const scripts = scriptsIn(nfkc)
  const lower = folded.toLowerCase().replace(EMOJI, ' ')
  const spaced = lower.replace(/[^\p{L}\p{N}@]+/gu, ' ').replace(/\s+/g, ' ').trim()
  const compact = lower.replace(/[^a-z0-9@.]+/g, '').replace(/\.{2,}/g, '.')
  const digitWords = numberWordsToDigits(spaced)
  return {
    original: text,
    lower,
    spaced,
    compact,
    digitWords,
    numberRunCandidates: numberRunCandidates(spaced),
    symbolDigits: digitLikeRuns(folded.replace(EMOJI, ' ')),
    wildcardDigits: wildcardRuns(folded.replace(EMOJI, ' ')),
    verbalEmail: verbaliseEmail(lower),
    homoglyphsFound: found,
    scriptMixed: scripts.size > 1,
  }
}
