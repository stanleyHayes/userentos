/**
 * An explicit sign-out from this device. The server request starts before the
 * local session is cleared, because it captures the current bearer token
 * synchronously. It carries this device's push token, so the server removes
 * the phone's push registration with the session; without a refresh token
 * the still-valid bearer unregisters it directly. Both are best effort: an
 * offline phone still signs out locally.
 */
export function signOutDevice(dependencies: {
  refreshToken: string | null
  takePushToken: () => string | null
  post: (path: string, body: Record<string, string>) => Promise<unknown>
  clearSession: () => void
}): void {
  const pushToken = dependencies.takePushToken()
  let request: Promise<unknown> | null = null
  if (dependencies.refreshToken) {
    request = dependencies.post('/auth/logout', { refreshToken: dependencies.refreshToken, ...(pushToken ? { pushToken } : {}) })
  } else if (pushToken) {
    request = dependencies.post('/push/unregister', { token: pushToken })
  }
  request?.catch(() => {})
  dependencies.clearSession()
}
