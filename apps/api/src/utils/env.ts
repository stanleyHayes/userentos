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

/**
 * The WEB APP's public origin, with any trailing slash removed.
 *
 * This is what an emailed link is built from — /login, /reset-password,
 * /payments are all routes on the browser app, not the API.
 */
export function publicBaseUrl(): string {
  return envOr('PUBLIC_BASE_URL', 'https://userentos.com').replace(/\/+$/, '')
}

/**
 * The API's public origin, with any trailing slash removed.
 *
 * Deliberately separate from publicBaseUrl. Both were the same variable, and
 * the two uses want different hosts: emails need the web app, provider
 * callbacks need the API. On a split deployment either choice broke
 * something — point it at the web app and MTN's confirmation hits the SPA,
 * which answers 200 with HTML, so the provider records a successful delivery
 * and the payment silently never completes; point it at the API and every
 * emailed login link 404s.
 *
 * Falls back to PUBLIC_BASE_URL so a single-origin deployment, where the API
 * and the app share a host, keeps working with one variable set.
 */
export function publicApiBaseUrl(): string {
  return envOr('PUBLIC_API_URL', envOr('PUBLIC_BASE_URL', 'https://api.userentos.com'))
    .replace(/\/+$/, '')
}

/**
 * An absolute URL under the API origin, for a provider to call back to.
 *
 * Callback URLs handed to a payment provider MUST be absolute — a provider
 * that receives "/api/webhooks/..." has nowhere to send the confirmation, and
 * the payment silently never completes. Building one by interpolating a
 * possibly-empty env var is how that happens, so callers go through here.
 */
export function publicUrl(path: string): string {
  return `${publicApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
}
