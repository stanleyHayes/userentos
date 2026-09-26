/**
 * How a push that arrives while the app is in the foreground is presented.
 *
 * Every notify() on the server also emits 'notification:new' on the socket,
 * which hooks/useAppSocket turns into an in-app toast. With the app active and
 * the socket connected the system banner would show the same notice a second
 * time, so it stays in the notification list only, silently. notify() pushes
 * carry at most a `url`; a push with a `type` (service bookings) comes from a
 * sender with no toast, so it keeps its banner.
 */
export interface ForegroundPresentation {
  shouldShowBanner: boolean
  shouldShowList: boolean
  shouldPlaySound: boolean
  shouldSetBadge: boolean
}

export function foregroundPresentation(input: {
  appState: string
  socketConnected: boolean
  data?: Record<string, unknown> | null
}): ForegroundPresentation {
  const toastShown = input.appState === 'active' && input.socketConnected && typeof input.data?.type !== 'string'
  return { shouldShowBanner: !toastShown, shouldShowList: true, shouldPlaySound: !toastShown, shouldSetBadge: true }
}
