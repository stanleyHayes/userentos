import { test, expect } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { safeAppRoute, NOTIFICATIONS_FALLBACK } from '../../apps/mobile/lib/safeRoute'

const repo = resolve(__dirname, '../..')
const appDir = join(repo, 'apps/mobile/app')

/** Does an expo-router screen file exist for this URL path? */
function screenExists(path: string): boolean {
  const clean = path.split('?')[0]
  if (clean === '/') return existsSync(join(appDir, '(tabs)/index.tsx'))
  const segments = clean.slice(1).split('/')
  if (segments.length === 2) return existsSync(join(appDir, segments[0], '[id].tsx'))
  return segments.length === 1 && [join(appDir, `${segments[0]}.tsx`), join(appDir, '(tabs)', `${segments[0]}.tsx`)].some(existsSync)
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : []
  })
}

/** Every notification deep link the API can emit: actionUrl values and push `url` data. */
function apiNotificationUrls(): string[] {
  const urls = new Set<string>()
  for (const file of sourceFiles(join(repo, 'apps/api/src'))) {
    const text = readFileSync(file, 'utf8')
    // `actionUrl: '...'` on notify() calls, and `data: { ..., url: '...' }` on direct pushes.
    for (const match of text.matchAll(/(?:actionUrl:\s*|data:\s*\{[^}]*\burl:\s*)(['`])(\/[^'`]*)\1/g)) {
      urls.add(match[2].replace(/\$\{[^}]+\}/g, '507f1f77bcf86cd799439011'))
    }
  }
  return [...urls].sort()
}

// Destinations with no mobile equivalent; the notifications list is the honest fallback.
const EXPECTED_FALLBACKS = new Set(['/reviews', '/admin/move-outs', '/admin/payments'])

test('every API notification link opens an existing mobile screen', () => {
  const urls = apiNotificationUrls()
  // Guard against the scan silently matching nothing.
  for (const known of ['/dashboard', '/payments', '/subscription', '/financing/mandates']) expect(urls).toContain(known)
  expect(urls.some((u) => u.startsWith('/agreements/') && u.endsWith('/move-out'))).toBe(true)
  expect(urls.some((u) => u.startsWith('/financing/contracts/'))).toBe(true)

  for (const url of urls) {
    const route = safeAppRoute(url)
    expect(route, url).not.toBeNull()
    expect(screenExists(route!), `${url} -> ${route}`).toBe(true)
    if (route === NOTIFICATIONS_FALLBACK) expect(EXPECTED_FALLBACKS.has(url), `${url} has no mobile mapping`).toBe(true)
  }
})

test('web notification paths map to their mobile screens', () => {
  const id = '507f1f77bcf86cd799439011'
  expect(safeAppRoute('/dashboard')).toBe('/')
  expect(safeAppRoute(`/agreements/${id}`)).toBe('/agreements')
  expect(safeAppRoute(`/agreements/${id}/move-out`)).toBe('/agreements')
  expect(safeAppRoute('/subscriptions')).toBe('/subscription')
  expect(safeAppRoute(`/financing/contracts/${id}`)).toBe('/financing')
  expect(safeAppRoute('/financing/mandates')).toBe('/financing-mandates')
  expect(safeAppRoute('/role-capabilities')).toBe('/my-business')
  expect(safeAppRoute('/admin/properties')).toBe('/gov-reviews')
  expect(safeAppRoute('/government')).toBe('/gov-panel')
  expect(safeAppRoute(`/properties/${id}`)).toBe(`/property/${id}`)
  expect(safeAppRoute(`/workers/${id}`)).toBe(`/worker/${id}`)
  expect(safeAppRoute(`/chat/${id}`)).toBe(`/chat/${id}`)
  expect(safeAppRoute('/reviews')).toBe(NOTIFICATIONS_FALLBACK)
  expect(safeAppRoute('/admin/payments')).toBe(NOTIFICATIONS_FALLBACK)
  expect(safeAppRoute('/somewhere/new')).toBe(NOTIFICATIONS_FALLBACK)
  // Existing screens keep their query; trailing slashes and fragments are ignored.
  expect(safeAppRoute('/payments?status=due')).toBe('/payments?status=due')
  expect(safeAppRoute('/disputes/')).toBe('/disputes')
  expect(safeAppRoute('/messages#top')).toBe('/messages')
  for (const route of ['/', '/payments', '/savings', '/disputes', '/maintenance', '/insurance', '/profile-access', '/profile', '/achievements', '/messages', '/applications', '/properties']) {
    expect(safeAppRoute(route)).toBe(route)
    expect(screenExists(route), route).toBe(true)
  }
})

test('unsafe or non-app values are never opened', () => {
  for (const value of [
    undefined, null, 42, '', 'payments', 'https://evil.example/phish', '//evil.example/x', 'javascript:alert(1)',
    '/auth/login', '/auth', '/api/users/me', `/${'a'.repeat(250)}`, '/pay ments', '/<script>',
  ]) expect(safeAppRoute(value), String(value)).toBeNull()
  // Dynamic segments only accept id-shaped values.
  expect(safeAppRoute('/property/..')).toBe(NOTIFICATIONS_FALLBACK)
  expect(safeAppRoute('/chat/a.b')).toBe(NOTIFICATIONS_FALLBACK)
})
