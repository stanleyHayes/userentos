import { test, expect } from '@playwright/test'
import { registerSessionPush } from '../../apps/mobile/lib/pushSession'

for (const stop of ['logout', 'effect cleanup']) test(`push token acquisition finishing after ${stop} cannot register`, async () => {
  let active = true
  let release!: (token: string) => void
  const pending = new Promise<string>(resolve => { release = resolve })
  const registered: string[] = []
  const result = registerSessionPush(() => active, () => pending, async token => { registered.push(token) })
  active = false
  release('fixture-device-token')
  expect(await result).toBeNull()
  expect(registered).toEqual([])
})

test('push registration errors are contained and not reported as successful enrollment', async () => {
  expect(await registerSessionPush(() => true, async () => { throw new Error('OS unavailable') }, async () => {})).toBeNull()
  expect(await registerSessionPush(() => true, async () => 'fixture-token', async () => { throw new Error('Server unavailable') })).toBeNull()
})

test('push enrollment reports only a current acknowledged registration', async () => {
  let active = true
  const tokens: string[] = []
  expect(await registerSessionPush(() => active, async () => 'current-token', async token => { tokens.push(token) })).toBe('current-token')
  expect(tokens).toEqual(['current-token'])
  expect(await registerSessionPush(() => active, async () => 'late-token', async () => { active = false })).toBeNull()
})
