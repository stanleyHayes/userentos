import { test, expect } from '@playwright/test'
import { createSessionCallbackGuard } from '../../apps/mobile/lib/sessionCallbacks'
import { useNotificationStore } from '../../apps/mobile/stores/notificationStore'

test.beforeEach(() => useNotificationStore.getState().reset())
test.afterEach(() => useNotificationStore.getState().reset())

test('queued old-session events cannot repopulate cleared notifications', () => {
  let version = 1
  const guard = createSessionCallbackGuard(() => version)
  const notify = guard.wrap((body: string) => {
    useNotificationStore.getState().incrementUnread()
    useNotificationStore.getState().pushToast({ title: 'Message', body, type: 'message' })
  })
  notify('Original private message')
  expect(useNotificationStore.getState().toasts).toHaveLength(1)
  version++
  useNotificationStore.getState().reset()
  notify('Late private message')
  expect(useNotificationStore.getState().toasts).toEqual([])
  expect(useNotificationStore.getState().unreadMessages).toBe(0)
  const current = createSessionCallbackGuard(() => version)
  current.wrap(notice => useNotificationStore.getState().pushToast({ title: 'Message', body: notice as string, type: 'message' }))('Current message')
  expect(useNotificationStore.getState().toasts.map(item => item.body)).toEqual(['Current message'])
})

test('disposed socket effect ignores queued callbacks even without a new login', () => {
  const guard = createSessionCallbackGuard(() => 1)
  const unread = guard.wrap((count: number) => useNotificationStore.getState().setUnreadMessages(count))
  unread(2)
  guard.dispose()
  unread(99)
  expect(useNotificationStore.getState().unreadMessages).toBe(2)
})

test('a delayed foreground response cannot update unread count after session replacement', async () => {
  let version = 1
  let resolve!: (count: number) => void
  const pending = new Promise<number>(done => { resolve = done })
  const guard = createSessionCallbackGuard(() => version)
  const result = pending.then(guard.wrap(count => useNotificationStore.getState().setUnreadMessages(count)))
  version++
  useNotificationStore.getState().setUnreadMessages(3)
  resolve(77)
  await result
  expect(useNotificationStore.getState().unreadMessages).toBe(3)
})
