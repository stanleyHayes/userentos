/**
 * Ghana-specific input helpers — phone and Ghana Card auto-formatting plus the
 * city list used by signup/profile dropdowns (free-text city entry is avoided
 * so locations stay consistent and searchable).
 */

import { City } from 'country-state-city'

/** Every Ghanaian city/town from country-state-city, deduped and sorted. */
export const GHANA_CITIES: string[] = [
  ...new Set((City.getCitiesOfCountry('GH') ?? []).map((c) => c.name)),
].sort((a, b) => a.localeCompare(b))

/** Strip a phone input down to its digits (drops +, spaces, dashes). */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Auto-format a Ghanaian phone number as the user types.
 * Local:      0244123456      → 024 412 3456
 * Intl:       233244123456    → +233 24 412 3456
 */
export function formatPhoneGH(value: string): string {
  const digits = phoneDigits(value)
  if (!digits) return ''

  if (digits.startsWith('233')) {
    const d = digits.slice(0, 12) // 233 + 9 digits
    const parts = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 12)].filter(Boolean)
    return `+${parts.join(' ')}`
  }

  const d = digits.slice(0, 10)
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ')
}

/** Ghana Card format: GHA-XXXXXXXXX-X (9 digits + check character). */
export const GHANA_CARD_RE = /^GHA-\d{9}-[0-9A-Z]$/

/**
 * Auto-format a Ghana Card ID as the user types — the GHA- prefix and the
 * separating dashes are inserted automatically.
 */
export function formatGhanaCard(value: string): string {
  let body = value.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (body.startsWith('GHA')) body = body.slice(3)
  body = body.slice(0, 10)

  let out = 'GHA'
  if (body.length > 0) out += `-${body.slice(0, 9)}`
  if (body.length > 9) out += `-${body.slice(9)}`
  return out
}
