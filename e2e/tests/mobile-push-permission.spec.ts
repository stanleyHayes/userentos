import { test, expect } from '@playwright/test'
import { notifyPushOptIn, onPushOptIn, resolvePushPermission, type PushPermissionStatus } from '../../apps/mobile/lib/pushSession'

test.describe('push permission is requested only in context', () => {
  const status = (value: PushPermissionStatus['status'], canAskAgain = true) => async (): Promise<PushPermissionStatus> => ({ status: value, canAskAgain })

  test('sign-in registration never shows the OS prompt', async () => {
    let prompted = 0
    expect(await resolvePushPermission(() => true, status('undetermined'))).toBe(false)
    expect(await resolvePushPermission(() => true, status('granted'))).toBe(true)
    expect(prompted).toBe(0)
    // With an explicit opt-in the prompt is shown once.
    expect(await resolvePushPermission(() => true, status('undetermined'), async () => { prompted++; return { status: 'granted' } })).toBe(true)
    expect(prompted).toBe(1)
  })

  test('a permanently denied permission is not re-requested and a stale session gets nothing', async () => {
    let prompted = 0
    const ask = async (): Promise<PushPermissionStatus> => { prompted++; return { status: 'granted' } }
    expect(await resolvePushPermission(() => true, status('denied', false), ask)).toBe(false)
    expect(prompted).toBe(0)
    let current = true
    expect(await resolvePushPermission(() => current, async () => { current = false; return { status: 'granted' } })).toBe(false)
  })

  test('an in-context opt-in notifies subscribers until they unsubscribe', () => {
    let calls = 0
    const unsubscribe = onPushOptIn(() => { calls++ })
    notifyPushOptIn()
    unsubscribe()
    notifyPushOptIn()
    expect(calls).toBe(1)
  })
})
