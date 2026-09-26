const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Loads the profile for a session restored from the keychain, which keeps
 * only the account id and credentials (lib/sessionRecord.ts).
 *
 * The first request gets `timeoutMs`; the app stays on the splash until then.
 * Past it, or offline, the caller opens the app without the profile and this
 * keeps asking in the background (the first request may still answer) until
 * the profile arrives or `current()` turns false: signed out, or the profile
 * reached the store another way.
 */
export async function restoreProfile<U extends { id: string }>(dependencies: {
  userId: string
  load: () => Promise<U>
  current: () => boolean
  apply: (user: U) => void
  timeoutMs?: number
  retryDelaysMs?: readonly number[]
  sleep?: (ms: number) => Promise<void>
}): Promise<'loaded' | 'pending' | 'ended'> {
  const { userId, load, current, apply, timeoutMs = 8_000, retryDelaysMs = [5_000, 15_000, 30_000, 60_000], sleep = wait } = dependencies
  const accept = (user: U) => {
    if (!current() || user?.id !== userId) return false
    apply(user)
    return true
  }
  const first = load().then(accept, () => false)
  const outcome = await Promise.race([first, sleep(timeoutMs).then(() => 'timeout' as const)])
  if (outcome === true) return 'loaded'
  if (!current()) return 'ended'
  void (async () => {
    if (await first) return
    for (let attempt = 0; ; attempt++) {
      await sleep(retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)])
      if (!current()) return
      try { if (accept(await load())) return } catch { /* offline: keep trying */ }
    }
  })()
  return 'pending'
}
