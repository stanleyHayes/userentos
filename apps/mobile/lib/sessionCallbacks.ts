/** Prevent queued events and request completions from updating a later session. */
export function createSessionCallbackGuard(readVersion: () => number) {
  const version = readVersion()
  let active = true
  return {
    wrap<Args extends unknown[]>(callback: (...args: Args) => void) {
      return (...args: Args) => { if (active && readVersion() === version) callback(...args) }
    },
    dispose() { active = false },
  }
}
