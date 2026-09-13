/** Avoid timer overflow for unusually long-lived signed tokens; always recheck
 * the absolute deadline so early timer wakeups do not expire a valid session. */
export function scheduleTokenExpiry(expiresAt: number, expire: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let canceled = false
  function check() {
    if (canceled) return
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) { expire(); return }
    timer = setTimeout(check, Math.min(remaining, 2_147_483_647))
    timer.unref()
  }
  check()
  return () => { canceled = true; if (timer) clearTimeout(timer) }
}
