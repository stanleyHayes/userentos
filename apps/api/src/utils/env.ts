/**
 * Environment readers that treat an EMPTY value as absent.
 *
 * `process.env.X ?? 'default'` looks right but is a trap: a variable declared
 * with no value (`X=` in a .env file, or a blank field in a hosting dashboard)
 * is an empty STRING, not undefined, so `??` keeps the empty string and the
 * default never applies. For a base URL that turns every request into a
 * relative path; for a provider name it selects nothing.
 *
 * Use these instead of `??` for any variable that has a meaningful default.
 */

/** String value, falling back when unset, empty or whitespace. */
export function envOr(name: string, fallback: string): string {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const trimmed = raw.trim()
  return trimmed === '' ? fallback : trimmed
}

/** Optional string: undefined when unset or empty, never an empty string. */
export function envOptional(name: string): string | undefined {
  const raw = process.env[name]
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Numeric value, falling back when unset, empty or not a number. */
export function envNumber(name: string, fallback: number): number {
  const raw = envOptional(name)
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}
