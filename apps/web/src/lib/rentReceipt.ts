import { useAuthStore } from '@/stores/authStore'

/** Keep both receipt operations bound to the session that requested them. */
export async function fetchRentReceipt(paymentId: string, signal: AbortSignal): Promise<string> {
  const token = useAuthStore.getState().token
  if (!token) throw new Error('Sign in to view this receipt.')
  const assertSession = () => {
    if (signal.aborted || useAuthStore.getState().token !== token) throw new Error('Account session changed. Please try again.')
  }
  const base = `${import.meta.env.VITE_API_URL || '/api'}/payments/${encodeURIComponent(paymentId)}/receipt`
  for (const method of ['POST', 'GET']) {
    assertSession()
    const response = await fetch(base + (method === 'GET' ? '.html' : ''), {
      method, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    })
    const body = await response.text()
    assertSession()
    if (!response.ok) {
      let message = response.status === 401 ? 'Your session expired. Sign in again to view this receipt.' : 'Could not retrieve the receipt. Please try again.'
      try { const data = JSON.parse(body); if (typeof data.error === 'string') message = data.error } catch { /* Infrastructure errors may not be JSON. */ }
      throw new Error(message)
    }
    if (method === 'GET') {
      if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('The receipt response was invalid. Please try again.')
      return body
    }
  }
  throw new Error('Could not retrieve the receipt.')
}
