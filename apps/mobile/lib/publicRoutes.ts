/**
 * Screens a signed-out visitor may open outside the auth group.
 *
 * Keep this list short and deliberate: every entry must work without a session
 * (public API endpoints only) and must not link onward to signed-in screens.
 * `rights-check` is here on purpose — someone being pushed out of their home
 * should not have to register before finding out whether it is legal.
 */
const PUBLIC_SCREENS: ReadonlySet<string> = new Set(['rights-check'])

export type AuthRedirect = '/auth/login' | '/(tabs)' | null

/** Where the root auth guard must send the user for the current route, if anywhere. */
export function authRedirect(segments: readonly string[], isAuthenticated: boolean): AuthRedirect {
  const inAuthGroup = segments[0] === 'auth'
  if (isAuthenticated) return inAuthGroup ? '/(tabs)' : null
  if (inAuthGroup) return null
  const isPublicScreen = segments.length === 1 && PUBLIC_SCREENS.has(segments[0])
  return isPublicScreen ? null : '/auth/login'
}
