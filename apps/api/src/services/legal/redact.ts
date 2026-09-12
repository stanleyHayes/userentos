/**
 * Strip personal details out of a complaint before it is stored.
 *
 * The abuse checker is a PUBLIC, unauthenticated form on the landing page, and
 * people describing a housing dispute name names: their landlord, their phone
 * number, their street, their GhanaPost digital address. Keeping the raw text
 * to improve the model would build a searchable file of private disputes
 * involving identifiable people who never agreed to that, and some of whom are
 * accused of crimes in it.
 *
 * What the model actually needs from a complaint is its SHAPE — "landlord
 * demanded N months advance and changed the locks" — not who was involved.
 * The identifiers are removed here and only the shape is kept.
 *
 * This is redaction, not anonymisation: free text can always carry something
 * identifying that no pattern catches ("the landlord of the blue house next to
 * the Shell station"). So the stored text is treated as sensitive regardless,
 * with short retention, and is only ever read by a reviewer building training
 * data.
 */

/** Ghanaian mobile numbers: 024 xxx xxxx, +233 24 xxx xxxx, 0244123456. */
const PHONE = /(?:\+?233[\s-]?|0)\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

/** GhanaPost digital address, e.g. GA-492-2894 or AK-039-5028. */
const DIGITAL_ADDRESS = /\b[A-Z]{2}-\d{3,4}-\d{3,4}\b/g

/**
 * Ghana Card and similar identifiers, where the digits are attached to a
 * letter prefix: GHA12345678, GHA-123456789-0, P0012345678.
 *
 * A plain \b\d{7,}\b misses all of these, because there is no word boundary
 * between "A" and "1" — both are word characters — so an unseparated card
 * number was passing through untouched.
 *
 * Currency codes are excluded so a large cedi figure is not mistaken for an
 * identifier: "GHS 1200000" is a price, not an ID.
 */
const NATIONAL_ID = /\b(?!GHS|GHC|USD|EUR|GBP|NGN)[A-Z]{1,4}[-\s]?\d{6,}(?:[-\s]?\d)?\b/gi

/** Any other long digit run — account numbers, meter numbers. */
const LONG_NUMBER = /\b\d{7,}\b/g

/**
 * House numbers and street names, e.g. "14 Jungle Road", "No. 3 Oxford St".
 * Deliberately narrow: it must not eat "6 months advance", which is the
 * single most important quantity in the whole feature.
 */
const STREET = /\b(?:No\.?\s*)?\d{1,4}[A-Za-z]?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Road|Rd|Street|St|Avenue|Ave|Close|Lane|Crescent|Drive|Link|Boulevard|Highway)\b/g

export interface Redaction {
  text: string
  /** What was removed, by kind, for an auditor to judge the redaction by. */
  removed: Record<string, number>
}

/**
 * Redact a complaint for storage.
 *
 * Quantities of months and years survive on purpose — they are the feature,
 * not an identifier.
 */
export function redactComplaint(input: string): Redaction {
  const removed: Record<string, number> = {}

  const apply = (text: string, pattern: RegExp, label: string, token: string): string =>
    text.replace(pattern, () => {
      removed[label] = (removed[label] ?? 0) + 1
      return token
    })

  let text = input
  // Order matters: the specific patterns run before the generic digit run,
  // or a phone number is swallowed as a "long number" and mislabelled.
  text = apply(text, EMAIL, 'email', '[email]')
  text = apply(text, DIGITAL_ADDRESS, 'digitalAddress', '[address]')
  text = apply(text, PHONE, 'phone', '[phone]')
  text = apply(text, STREET, 'street', '[address]')
  text = apply(text, NATIONAL_ID, 'identifier', '[id]')
  text = apply(text, LONG_NUMBER, 'number', '[number]')

  return { text: text.trim(), removed }
}
