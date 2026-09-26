import { test, expect } from '@playwright/test'
import { mapStoreError, restoreSummary } from '../../apps/mobile/lib/storeErrors'
import { createConnectionQueue } from '../../apps/mobile/lib/storeConnection'

test.describe('store checkout errors say what happened and what to do', () => {
  test('cancel is silent, Ask to Buy and slow payments are pending, already-owned restores', () => {
    expect(mapStoreError('user-cancelled', 'App Store')).toEqual({ kind: 'silent' })
    for (const code of ['deferred-payment', 'pending']) {
      expect(mapStoreError(code, 'App Store')).toEqual({ kind: 'pending', message: 'Payment is pending in App Store. Your plan activates after confirmation.' })
    }
    expect(mapStoreError('already-owned', 'Google Play')).toEqual({ kind: 'restore' })
  })

  test('store, network and product failures name the next step', () => {
    expect(mapStoreError('billing-unavailable', 'Google Play')).toEqual({ kind: 'error', message: 'Google Play purchases are unavailable on this device. Sign in to the Play Store and try again.' })
    expect(mapStoreError('iap-not-available', 'App Store')).toEqual({ kind: 'error', message: 'App Store purchases are unavailable on this device. Sign in to the App Store and try again.' })
    expect(mapStoreError('network-error', 'App Store')).toMatchObject({ kind: 'error', message: expect.stringContaining('Check your connection') })
    expect(mapStoreError('item-unavailable', 'Google Play')).toMatchObject({ kind: 'error', message: expect.stringContaining('not available in Google Play') })
    for (const code of ['unknown', 'developer-error', undefined, null]) {
      expect(mapStoreError(code, 'App Store')).toEqual({ kind: 'error', message: 'App Store could not complete checkout. Restore purchases if needed.' })
    }
  })

  test('only a restore the user asked for says nothing was found', () => {
    expect(restoreSummary(0, true, 'App Store')).toBe('No App Store purchases were found for this store account.')
    expect(restoreSummary(0, false, 'Google Play')).toBeNull()
    expect(restoreSummary(2, true, 'Google Play')).toBeNull()
  })
})

test('a late endConnection from the previous account finishes before the next initConnection', async () => {
  const serialize = createConnectionQueue()
  const events: string[] = []
  let finishEnd!: () => void
  const ended = serialize(() => new Promise<void>(resolve => { events.push('end:start'); finishEnd = () => { events.push('end:done'); resolve() } }))
  const init = serialize(async () => { events.push('init') })
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(events).toEqual(['end:start'])
  finishEnd()
  await Promise.all([ended, init])
  expect(events).toEqual(['end:start', 'end:done', 'init'])
  // A failed step does not block the queue.
  await expect(serialize(async () => { throw new Error('store closed') })).rejects.toThrow('store closed')
  expect(await serialize(async () => 'connected')).toBe('connected')
})
