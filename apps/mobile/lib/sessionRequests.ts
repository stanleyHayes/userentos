export interface RequestSession { version: number; token: string | null }
/** Deduplicate refreshes only within the session that started the request.
 * A rotated token is still the same session; a login/logout is a new version.
 */
export function createSessionRequests(dependencies: {
  session: () => RequestSession
  refresh: (version: number) => Promise<boolean>
  logout: () => void
  /** A credential change (password change) in flight, if any; see credentialChange.ts. */
  pendingCredentialChange?: () => Promise<unknown> | null
}) {
  const refreshes = new Map<number, Promise<boolean>>()
  return async function sessionRequest(send: (token: string | null) => Promise<Response>, allowRefresh: boolean) {
    const origin = dependencies.session()
    const check = () => { if (dependencies.session().version !== origin.version) throw new Error('Account session changed. Please retry from your current account.') }
    let response = await send(origin.token)
    check()
    if (response.status === 401 && allowRefresh) {
      // A password change in flight is replacing this device's credentials:
      // wait for its new pair instead of refreshing with the revoked token.
      // (/auth/ requests never refresh, so the change itself can't wait here.)
      const change = dependencies.pendingCredentialChange?.()
      if (change) { await change.catch(() => {}); check() }
      // A late response can arrive after another request completed rotation.
      // Keep the login boundary above, but reuse its current access credential.
      const current = dependencies.session()
      if (!current.token || current.token === origin.token) {
        let refresh = refreshes.get(origin.version)
        if (!refresh) {
          refresh = dependencies.refresh(origin.version).finally(() => { refreshes.delete(origin.version) })
          refreshes.set(origin.version, refresh)
        }
        const refreshed = await refresh
        check()
        if (!refreshed) { dependencies.logout(); throw new Error('Session expired') }
      }
      response = await send(dependencies.session().token)
      check()
    }
    const text = await response.text()
    check()
    let data: { error?: string; data?: unknown } = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
    return data.data
  }
}
