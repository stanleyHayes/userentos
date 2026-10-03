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

let signUpLanding: string | null = null

/**
 * Sign-up chooses where a new account lands (an agent's website, a tenant's
 * search). The root guard moves a signed-in user off the auth screens as soon
 * as the session starts, so it must take this route, once, instead of Home:
 * navigating from the sign-up screen itself lost the race and always landed on Home.
 */
export function setSignUpLanding(route: string) { signUpLanding = route }

export function takeSignUpLanding(): string | null {
  const route = signUpLanding
  signUpLanding = null
  return route
}

/** Where the root auth guard must send the user for the current route, if anywhere. */
export function authRedirect(segments: readonly string[], isAuthenticated: boolean): AuthRedirect {
  const inAuthGroup = segments[0] === 'auth'
  if (isAuthenticated) return inAuthGroup ? '/(tabs)' : null
  if (inAuthGroup) return null
  const isPublicScreen = segments.length === 1 && PUBLIC_SCREENS.has(segments[0])
  return isPublicScreen ? null : '/auth/login'
}
