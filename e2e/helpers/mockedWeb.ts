import type { Page, Route } from '@playwright/test'
import { allRegulatedFeatures } from './regulatedFeatures'

/**
 * Signed-in web session against a fully mocked API, for UI specs that run
 * against a Vite dev server with no backend (playwright.web-mocked.config.ts).
 *
 * `handle` answers the requests a spec cares about; return undefined to fall
 * back to an empty list. Socket.io is refused so nothing reaches a real server.
 */
export type MockedUser = { id: string; email: string; firstName: string; lastName: string; phone: string; roles: string[]; activeRole: string; isVerified?: boolean }
export type MockHandler = (request: { method: string; path: string; body: unknown }) => { status?: number; data?: unknown; error?: string } | undefined

export async function signInWithMockedApi(page: Page, user: MockedUser, handle: MockHandler) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('rentos-auth', JSON.stringify({ state: { user: { ...user, consentRequired: false }, token: 'mocked-token', refreshToken: 'mocked-refresh', isAuthenticated: true, sessionId: 'mocked-session' }, version: 0 }))
    localStorage.setItem('rentos-onboarding', JSON.stringify({ completedTours: Object.fromEntries(['tenant', 'landlord', 'property_manager', 'service_provider', 'financier', 'employer', 'government', 'business', 'admin', 'developer'].map(role => [role, true])) }))
  }, { user })
  await page.route('**/socket.io/**', route => route.abort())
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace(/^\/api/, '')
    let body: unknown = undefined
    try { body = request.postDataJSON() } catch { body = request.postData() }
    const answer = handle({ method: request.method(), path, body })
    if (answer) {
      const status = answer.status ?? 200
      await route.fulfill({ status, json: status >= 400 ? { success: false, error: answer.error ?? 'Request failed' } : { success: true, data: answer.data ?? null } })
      return
    }
    let data: unknown = { items: [], total: 0 }
    if (path === '/users/me') data = { ...user, consentRequired: false }
    else if (path === '/platform/features') data = allRegulatedFeatures
    else if (path === '/chat/unread-count' || path === '/notifications/unread-count') data = { count: 0 }
    else if (path === '/workers/me') data = { worker: null }
    await route.fulfill({ json: { success: true, data } })
  })
}
