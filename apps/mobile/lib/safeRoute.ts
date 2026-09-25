/**
 * Translate a navigation route coming from an untrusted payload (push
 * notification data, socket notification actionUrl) into a screen that exists
 * in the mobile app.
 *
 * The API writes *web* paths into notifications (/dashboard, /agreements/:id,
 * /financing/contracts/:id, ...). Opening those verbatim landed on Not Found,
 * so each known web path is mapped to its mobile screen, and any other
 * well-formed internal path falls back to the notifications list. Values that
 * are not a plain internal path (external URLs, javascript:, protocol-relative
 * or malformed strings) and auth/API paths return null and are never opened.
 */

/** Screens a notification may open as-is (URL paths; route groups are invisible). */
const MOBILE_SCREENS: ReadonlySet<string> = new Set([
  '/', '/payments', '/savings', '/properties', '/messages', '/profile',
  '/achievements', '/add-property', '/agent-commissions', '/agent-leads', '/agent-viewings',
  '/agreements', '/ai-writer', '/analytics', '/applications', '/become-worker', '/blog',
  '/bookings', '/credit-score', '/disputes', '/documents', '/earnings', '/employer',
  '/financier', '/financing', '/financing-mandates', '/gov-panel', '/gov-reviews', '/help',
  '/insurance', '/investments', '/landlord-expenses', '/landlord-vacancy', '/legal',
  '/legal-assistant', '/loans', '/local-services', '/maintenance', '/my-business',
  '/notifications', '/payout-account', '/pricing', '/privacy', '/profile-access',
  '/rights-check', '/saved-properties', '/settings', '/subscription', '/tenant-passport',
  '/tenant-profile', '/tenants', '/users-admin', '/workers',
])

export const NOTIFICATIONS_FALLBACK = '/notifications'

const ID = '([A-Za-z0-9_-]{1,64})'
const route = (pattern: string) => new RegExp(`^${pattern.replace(/:id/g, ID)}$`)

/** Web paths used by API notifications (and web links) → mobile screens. */
const WEB_ALIASES: ReadonlyArray<readonly [RegExp, (id: string) => string]> = [
  [route('/dashboard'), () => '/'],
  [route('/subscriptions'), () => '/subscription'],
  [route('/properties/:id'), id => `/property/${id}`],
  [route('/property/:id'), id => `/property/${id}`],
  [route('/workers/join'), () => '/become-worker'],
  [route('/workers/:id'), id => `/worker/${id}`],
  [route('/worker/:id'), id => `/worker/${id}`],
  [route('/chat/:id'), id => `/chat/${id}`],
  // The mobile agreements screen lists every agreement, including move-outs.
  [route('/agreements/:id'), () => '/agreements'],
  [route('/agreements/:id/move-out'), () => '/agreements'],
  [route('/disputes/:id'), () => '/disputes'],
  [route('/financing/mandates'), () => '/financing-mandates'],
  [route('/financing/(?:contracts|offers|applications|collections)'), () => '/financing'],
  [route('/financing/contracts/:id'), () => '/financing'],
  // Sent to business owners ("new mover nearby — create an offer").
  [route('/role-capabilities'), () => '/my-business'],
  [route('/government'), () => '/gov-panel'],
  [route('/(?:government/reviews|admin/property-reviews|admin/properties)'), () => '/gov-reviews'],
  [route('/saved'), () => '/saved-properties'],
  [route('/my-profile'), () => '/tenant-profile'],
  [route('/passport'), () => '/tenant-passport'],
  [route('/rental-laws'), () => '/legal'],
  [route('/users'), () => '/users-admin'],
  [route('/landlord/expenses'), () => '/landlord-expenses'],
  [route('/landlord/vacancy'), () => '/landlord-vacancy'],
  [route('/agent/leads'), () => '/agent-leads'],
  [route('/agent/viewings'), () => '/agent-viewings'],
  [route('/agent/commissions'), () => '/agent-commissions'],
  [route('/employer/(?:profile|employees|payroll|reports)'), () => '/employer'],
]

/** Never let a payload drive the auth flow or point the router at the API. */
const REFUSED_PREFIXES = ['/auth', '/api']

export function safeAppRoute(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return null
  // Must be a single slash-prefixed path (no scheme, no protocol-relative URLs)
  if (!/^\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/.test(value)) return null
  if (value.startsWith('//')) return null

  const [beforeHash] = value.split('#')
  const queryStart = beforeHash.indexOf('?')
  const rawPath = queryStart === -1 ? beforeHash : beforeHash.slice(0, queryStart)
  const query = queryStart === -1 ? '' : beforeHash.slice(queryStart)
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath

  if (REFUSED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null
  // Only screens that exist keep their query string; aliases drop it.
  if (MOBILE_SCREENS.has(path)) return `${path}${query}`
  for (const [pattern, target] of WEB_ALIASES) {
    const match = path.match(pattern)
    if (match) return target(match[1] ?? '')
  }
  return NOTIFICATIONS_FALLBACK
}
