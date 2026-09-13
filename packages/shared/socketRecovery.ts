/** Recover only the originating login, coalescing repeated expiry signals. */
export function createSocketRecovery(isCurrent: () => boolean, revalidate: () => Promise<unknown>, reconnect: () => void) {
  let disposed = false
  let pending = false
  return {
    async run() {
      if (disposed || pending || !isCurrent()) return
      pending = true
      try {
        await revalidate()
        if (!disposed && isCurrent()) reconnect()
      } catch { /* Existing HTTP/session handling owns errors and rejected credentials. */ }
      finally { pending = false }
    },
    dispose() { disposed = true },
  }
}
