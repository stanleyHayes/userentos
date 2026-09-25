/** National ID (Ghana Card) PIN: GHA-<9 digits>-<check digit>. */
export const GHANA_CARD_RE = /^GHA-\d{9}-\d$/

/** Uppercases and trims; returns null when the value is not a Ghana Card PIN. */
export function normalizeGhanaCardId(raw: string): string | null {
  const value = raw.trim().toUpperCase()
  return GHANA_CARD_RE.test(value) ? value : null
}
