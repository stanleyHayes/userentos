/**
 * Store connection setup and teardown in strict order, shared by the App
 * Store and Google Play sessions. On a quick account switch the old session's
 * endConnection() can still be running when the new one connects; unordered,
 * it closes the new connection and plans fail to load.
 */
export function createConnectionQueue() {
  let work: Promise<unknown> = Promise.resolve()
  return function serializeConnection<T>(action: () => Promise<T>): Promise<T> {
    const next = work.then(action)
    work = next.then(() => {}, () => {})
    return next
  }
}

/** One queue per app: a single native billing connection backs every session. */
export const serializeConnection = createConnectionQueue()
