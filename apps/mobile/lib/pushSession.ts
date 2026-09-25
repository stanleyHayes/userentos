/** OS permission/token work may finish after logout or effect cleanup. */
export async function registerSessionPush(
  isCurrent: () => boolean,
  acquireToken: () => Promise<string | null>,
  register: (token: string) => Promise<unknown>,
): Promise<string | null> {
  try {
    if (!isCurrent()) return null
    const token = await acquireToken()
    if (!token || !isCurrent()) return null
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
