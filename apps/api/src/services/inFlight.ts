/**
 * Work a deploy must let finish.
 *
 * Render sends SIGTERM on every push to main. A webhook half-processed when
 * the process exits is retried (it was stored first), but one that finished
 * its provider call and was killed before recording the outcome costs a
 * reconciliation round-trip at best. gracefulShutdown waits — bounded — for
 * everything registered here before closing the database.
 */
const pending = new Set<Promise<unknown>>()

/** Register `work` so shutdown waits for it; returns it unchanged. */
export function trackInFlight<T>(work: Promise<T>): Promise<T> {
  pending.add(work)
  const done = () => { pending.delete(work) }
  work.then(done, done)
  return work
}

/** Resolve once all tracked work has settled, or after `timeoutMs`, whichever is first. */
export async function drainInFlight(timeoutMs: number): Promise<void> {
  if (!pending.size) return
  let timer: NodeJS.Timeout | undefined
  await Promise.race([
    Promise.allSettled([...pending]),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs) }),
  ])
  if (timer) clearTimeout(timer)
}

/** For tests and diagnostics. */
export const inFlightCount = () => pending.size
