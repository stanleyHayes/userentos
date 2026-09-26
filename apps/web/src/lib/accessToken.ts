/**
 * Whether a JWT access token has expired, or will within `skewMs` (room for a
 * client clock running behind the server's). False when the token carries no
 * readable expiry, so the server stays the judge.
 */
export function accessTokenExpired(token: string | null, now = Date.now(), skewMs = 30_000): boolean {
  const payload = token?.split('.')[1]
  if (!payload) return false
  try {
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown }
    return typeof exp === 'number' && exp * 1000 <= now + skewMs
  } catch {
    return false
  }
}
