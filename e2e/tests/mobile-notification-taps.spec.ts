import { test, expect } from '@playwright/test'
import { createNotificationTaps, type NotificationTap } from '../../apps/mobile/lib/notificationTaps'
import { foregroundPresentation } from '../../apps/mobile/lib/notificationPresentation'

const tap = (identifier: string, url: unknown): NotificationTap => ({ notification: { request: { identifier, content: { data: { url } } } } })

function harness(last: NotificationTap | null = null) {
  const opened: string[] = []
  let cleared = 0
  let stored = last
  const taps = createNotificationTaps({
    navigate: route => { opened.push(route) },
    readLast: () => stored,
    clearLast: () => { cleared++; stored = null },
  })
  return { taps, opened, cleared: () => cleared }
}

test.describe('notification taps open their screen exactly once', () => {
  test('the tap that launched a closed app opens after the session is restored, once', () => {
    const { taps, opened, cleared } = harness(tap('launch-1', '/chat/abc123'))
    taps.readLaunchTap()
    expect(opened).toEqual([])
    taps.openWaiting()
    expect(opened).toEqual(['/chat/abc123'])
    expect(cleared()).toBe(1)
    // The listener delivering the same tap, a second read, a later render: nothing more.
    taps.receive(tap('launch-1', '/chat/abc123'), true)
    taps.readLaunchTap()
    taps.openWaiting()
    expect(opened).toEqual(['/chat/abc123'])
  })

  test('a tap already delivered by the listener is not replayed from the stored response', () => {
    const launch = tap('launch-2', '/applications')
    const { taps, opened } = harness(launch)
    taps.receive(launch, true)
    taps.readLaunchTap()
    taps.openWaiting()
    expect(opened).toEqual(['/applications'])
  })

  test('a tap while signed out waits for sign-in', () => {
    const { taps, opened } = harness()
    taps.readLaunchTap()
    taps.receive(tap('signed-out', '/properties/507f1f77bcf86cd799439011'), false)
    expect(opened).toEqual([])
    taps.openWaiting()
    expect(opened).toEqual(['/property/507f1f77bcf86cd799439011'])
    taps.openWaiting()
    expect(opened).toHaveLength(1)
  })

  test('a live tap while signed in opens at once; unsafe routes never open', () => {
    const { taps, opened } = harness()
    taps.receive(tap('live', '/dashboard'), true)
    taps.receive(tap('external', 'https://evil.test/phish'), true)
    taps.receive(tap('auth', '/auth/login'), true)
    taps.receive({ notification: { request: { identifier: '', content: {} } } }, true)
    taps.openWaiting()
    expect(opened).toEqual(['/'])
  })

  test('a platform without stored responses (web) does not break', () => {
    const opened: string[] = []
    const taps = createNotificationTaps({ navigate: route => { opened.push(route) }, readLast: () => { throw new Error('unavailable') }, clearLast: () => { throw new Error('unavailable') } })
    taps.readLaunchTap()
    taps.receive(tap('web', '/payments'), true)
    expect(opened).toEqual(['/payments'])
  })
})

test.describe('foreground pushes are not shown twice', () => {
  test('active app with a connected socket: the in-app toast shows it, the banner does not', () => {
    expect(foregroundPresentation({ appState: 'active', socketConnected: true, data: { url: '/payments' } })).toEqual({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true })
    expect(foregroundPresentation({ appState: 'active', socketConnected: true, data: null }).shouldShowBanner).toBe(false)
  })

  test('no socket, not active, or a push with no toast (bookings) keeps the banner', () => {
    for (const input of [
      { appState: 'active', socketConnected: false, data: { url: '/payments' } },
      { appState: 'background', socketConnected: true, data: { url: '/payments' } },
      { appState: 'inactive', socketConnected: true },
      { appState: 'active', socketConnected: true, data: { type: 'booking:confirmed', bookingId: 'b1' } },
    ]) {
      expect(foregroundPresentation(input)).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true })
    }
  })
})
