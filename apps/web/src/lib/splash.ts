import { useSyncExternalStore } from 'react'

/**
 * The launch splash covers the first ~3 seconds of a session. Pages that play
 * an entrance animation wait for it, or the animation runs unseen underneath.
 */
const SEEN_KEY = 'rentos-splash-seen'
const listeners = new Set<() => void>()

function readSeen(): boolean {
  try {
    return typeof window !== 'undefined' && sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true // Storage blocked: the splash can't be remembered, so don't wait on it.
  }
}

let finished = readSeen()

export function isSplashFinished(): boolean {
  return finished
}

export function markSplashFinished(): void {
  try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* storage blocked */ }
  finished = true
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** True once the launch splash is gone (immediately, if it already played this session). */
export function useSplashFinished(): boolean {
  return useSyncExternalStore(subscribe, isSplashFinished, () => true)
}
