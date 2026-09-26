/**
 * OS permission/token work may finish after logout or effect cleanup.
 *
 * `remember` gets the token before the register request is sent, not after
 * it answers: a sign-out tapped while that request is in flight must still
 * carry the token, or a registration the server processed just before the
 * logout would keep sending the account's pushes to the signed-out phone.
 * Removing a token the server never registered does nothing.
 */
export async function registerSessionPush(
  isCurrent: () => boolean,
  acquireToken: () => Promise<string | null>,
  register: (token: string) => Promise<unknown>,
  remember: (token: string) => void = () => {},
): Promise<string | null> {
  try {
    if (!isCurrent()) return null
    const token = await acquireToken()
    if (!token || !isCurrent()) return null
    remember(token)
    await register(token)
    return isCurrent() ? token : null
  } catch {
    // Registration is optional; OS/provider/network errors must not break app boot.
    return null
  }
}

export interface PushPermissionStatus {
  status: 'granted' | 'denied' | 'undetermined'
  canAskAgain?: boolean
}

/**
 * Whether push may be enabled for this registration.
 *
 * The OS permission prompt is only shown when `request` is supplied — i.e.
 * after the user opted in from an in-context pre-prompt — never as a side
 * effect of signing in (App Review 4.5.4 / Play guidance: ask in context).
 */
export async function resolvePushPermission(
  isCurrent: () => boolean,
  getStatus: () => Promise<PushPermissionStatus>,
  request?: () => Promise<PushPermissionStatus>,
): Promise<boolean> {
  const current = await getStatus()
  if (!isCurrent()) return false
  if (current.status === 'granted') return true
  if (!request || current.canAskAgain === false) return false
  const asked = await request()
  return isCurrent() && asked.status === 'granted'
}

const optInListeners = new Set<() => void>()

/** Subscribe to "the user just granted notification permission in context". */
export function onPushOptIn(listener: () => void): () => void {
  optInListeners.add(listener)
  return () => { optInListeners.delete(listener) }
}

export function notifyPushOptIn(): void {
  for (const listener of [...optInListeners]) listener()
}

/**
 * The push token this device last registered for the signed-in account. The
 * sign-out request carries it: once logout() has run there is no session left
 * to call /push/unregister with, and the server would keep sending this
 * account's notifications to the phone.
 */
let registeredToken: string | null = null

export function rememberRegisteredPushToken(token: string): void {
  registeredToken = token
}

/** Returns the remembered token and forgets it; one sign-out uses it. */
export function takeRegisteredPushToken(): string | null {
  const token = registeredToken
  registeredToken = null
  return token
}
