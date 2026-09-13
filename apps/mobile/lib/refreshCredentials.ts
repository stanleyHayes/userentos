/** Only an explicit authentication rejection invalidates the login. Transport,
 * provider and malformed-response failures remain retryable without logout. */
export async function requestRefreshCredentials(send: (signal: AbortSignal) => Promise<Response>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await send(controller.signal)
    if (response.status === 401 || response.status === 403) return null
    if (!response.ok) throw new Error('Session refresh is temporarily unavailable. Please retry.')
    const body = await response.json()
    const token = body?.data?.token, refreshToken = body?.data?.refreshToken
    if (typeof token !== 'string' || !token.trim() || typeof refreshToken !== 'string' || !refreshToken.trim()) {
      throw new Error('Session refresh returned incomplete credentials. Please retry.')
    }
    return { token, refreshToken }
  } finally { clearTimeout(timer) }
}
