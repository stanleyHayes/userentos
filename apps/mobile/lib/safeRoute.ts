/**
 * Validate a navigation route coming from an untrusted payload (push
 * notification data, socket notification actionUrl). Only internal app paths
 * are allowed — anything else (external URLs, javascript:, malformed strings,
 * web admin paths that don't exist in the app) is dropped.
 */
export function safeAppRoute(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return null
  // Must be a single slash-prefixed path (no scheme, no protocol-relative URLs)
  if (!/^\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/.test(value)) return null
  if (value.startsWith('//')) return null
  // Web-only routes that don't exist in the mobile app
  const blocked = ['/admin', '/auth', '/api', '/passport']
  if (blocked.some((p) => value === p || value.startsWith(`${p}/`))) return null
  return value
}
