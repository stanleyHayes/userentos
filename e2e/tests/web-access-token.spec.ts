import { test, expect } from '@playwright/test'
import { accessTokenExpired } from '../../apps/web/src/lib/accessToken.js'

// Contract checks for the expiry test renewSessionWith runs before a password
// or two-factor change, whose auth routes never refresh on a 401.
const now = Date.UTC(2026, 8, 26, 12)
const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`

test('an access token past its expiry, or inside the clock-skew margin, counts as expired', () => {
  const seconds = now / 1000
  expect(accessTokenExpired(jwt({ exp: seconds - 60 }), now)).toBe(true)
  expect(accessTokenExpired(jwt({ exp: seconds + 10 }), now)).toBe(true)
  expect(accessTokenExpired(jwt({ exp: seconds + 10 }), now, 0)).toBe(false)
  expect(accessTokenExpired(jwt({ exp: seconds + 15 * 60 }), now)).toBe(false)
})

test('base64url payloads decode without padding', () => {
  // A name that encodes with '-' and '_' and needs padding in plain base64.
  const token = jwt({ userId: '66f5?>~~', firstName: 'Ãkua', exp: now / 1000 - 1 })
  expect(token.split('.')[1]).toMatch(/[-_]/)
  expect(token.split('.')[1]).not.toContain('=')
  expect(accessTokenExpired(token, now)).toBe(true)
})

test('a token with no readable expiry is left for the server to judge', () => {
  for (const token of [null, '', 'opaque-fixture-token', 'a.b.c', jwt({ userId: 'user-1' }), jwt({ exp: 'soon' })]) {
    expect(accessTokenExpired(token, now)).toBe(false)
  }
})
