/*
 * RentOS service worker: browser notifications only.
 *
 * It shows Web Push notifications (new messages, enquiries, account alerts)
 * when RentOS is in the background or closed, and opens the right page when
 * one is clicked. It does not cache pages or intercept requests.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'RentOS', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'RentOS'
  const url = data.url || '/'
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // RentOS is open in front of the person: it shows its own toast instead.
    if (windows.some((client) => client.visibilityState === 'visible' && client.focused)) return
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/email/rentos-mark.png',
      badge: '/email/rentos-mark.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)
  // Only ever open RentOS itself.
  if (target.origin !== self.location.origin) return
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) {
      await existing.focus()
      existing.postMessage({ type: 'rentos:navigate', url: target.pathname + target.search })
      return
    }
    await self.clients.openWindow(target.href)
  })())
})
