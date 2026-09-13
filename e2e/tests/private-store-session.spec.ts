import { test, expect } from '../fixtures/auth'

for (const status of [200, 500]) test(`old favorite ${status} response cannot restore data after a new login`, async ({ authedPage: page }) => {
  let changed = false
  let pending = false
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/properties/favorites/me', route => route.fulfill({ json: { data: { propertyIds: changed ? [] : ['previous-private-property'] } } }))
  await page.route('**/api/properties/previous-private-property/favorite', async route => {
    pending = true; await gate
    return route.fulfill({ status, json: status === 200 ? { data: { favorited: true } } : { error: 'Fixture failure' } })
  })
  await page.goto('/settings')
  const read = () => page.evaluate(async () => {
    const modules = performance.getEntriesByType('resource').map(entry => entry.name)
    const path = modules.find(name => new URL(name).pathname === '/src/stores/favoritesStore.ts')!
    const { useFavoritesStore } = await import(path)
    return useFavoritesStore.getState().ids
  })
  await expect.poll(read).toEqual(['previous-private-property'])
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/notificationStore.ts')!
    const { useNotificationStore } = await import(path)
    useNotificationStore.getState().setNotifications([{ id: 'old-alert', title: 'Previous account notification', read: false }])
  })
  const toggle = page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/favoritesStore.ts')!
    const { useFavoritesStore } = await import(path)
    await useFavoritesStore.getState().toggle('previous-private-property')
  })
  await expect.poll(() => pending).toBe(true)
  changed = true
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore } = await import(path)
    const state = useAuthStore.getState()
    state.login(state.user, state.token, state.refreshToken)
  })
  await expect.poll(read).toEqual([])
  release()
  await toggle
  expect(await read()).toEqual([])
  expect(await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/notificationStore.ts')!
    const { useNotificationStore } = await import(path)
    return { count: useNotificationStore.getState().unreadCount, items: useNotificationStore.getState().notifications }
  })).toEqual({ count: 0, items: [] })
})
