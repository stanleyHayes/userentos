/**
 * How long a saved attempt stays retryable. Long enough to survive a lost
 * response or an app restart, short enough that the same details next month
 * start a new payment instead of replaying last month's.
 */
export const CHECKOUT_KEY_LIFETIME_MS = 24 * 60 * 60 * 1000

/** Keep the same attempt across a lost response or app restart. Persist hashes,
 * never the payment payload. A successful response resolves the attempt. */
export function createCheckoutRequests(deps: {
  digest(value: string): Promise<string>
  randomId(): string
  read(key: string): Promise<string | null>
  write(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  timeoutMs?: number
  lock?<T>(key: string, work: () => Promise<T>): Promise<T>
  now?(): number
}) {
  const now = deps.now ?? (() => Date.now())
  const active = new Map<string, Promise<unknown>>()
  return async function checkout<T>(owner: string, path: string, payload: string, send: (key: string, signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!owner) throw new Error('Sign in before starting a payment.')
    const hash = await deps.digest(JSON.stringify([owner, path, JSON.parse(payload)]))
    const storageKey = `rentos_checkout_v1_${hash}`
    // When the attempt was saved, kept apart so the key entry stays the bare key older code reads.
    const savedAtKey = `rentos_checkout_v1_at_${hash}`
    const pending = active.get(storageKey)
    if (pending) return pending as Promise<T>
    const prepare = async () => {
      let key = await deps.read(storageKey)
      if (key !== null && !/^[a-zA-Z0-9-]{16,100}$/.test(key)) throw new Error('Saved payment retry information is invalid. Contact support before trying another payment.')
      if (key) {
        // Attempts saved before the timestamp existed have none and stay retryable.
        const savedAt = Number(await deps.read(savedAtKey))
        if (Number.isFinite(savedAt) && savedAt > 0 && now() - savedAt > CHECKOUT_KEY_LIFETIME_MS) key = null
      }
      if (!key) {
        key = deps.randomId()
        // Fail before sending if persistence is unavailable.
        await deps.write(storageKey, key)
        await deps.write(savedAtKey, String(now()))
      }
      return key
    }
    const work = async () => {
      const key = await (deps.lock ? deps.lock(storageKey, prepare) : prepare())
      const controller = new AbortController()
      let rejectWait!: (reason: Error) => void
      const interrupted = new Promise<never>((_, reject) => { rejectWait = reject })
      const interrupt = (message: string) => {
        const failure = new Error(message)
        rejectWait(failure)
        controller.abort()
      }
      const cancel = () => interrupt('Payment request cancelled. Retry with the same details to check the original payment.')
      const timer = setTimeout(() => interrupt('Payment confirmation timed out. Retry with the same details to check the original payment.'), deps.timeoutMs ?? 30_000)
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) cancel()
      let result: T
      try {
        result = await Promise.race([interrupted, controller.signal.aborted ? interrupted : send(key, controller.signal)])
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
      }
      // If cleanup fails, retaining the key safely replays the known payment.
      const cleanup = async () => {
        if (await deps.read(storageKey) !== key) return
        await deps.remove(storageKey)
        await deps.remove(savedAtKey)
      }
      await (deps.lock ? deps.lock(storageKey, cleanup) : cleanup()).catch(() => undefined)
      return result
    }
    const promise = work()
    active.set(storageKey, promise)
    try { return await promise }
    finally { if (active.get(storageKey) === promise) active.delete(storageKey) }
  }
}

/** Every POST that starts a real collection; the API refuses these without an Idempotency-Key (428). */
export function isProviderCheckout(path: string, body: unknown): boolean {
  return path === '/payments' || path === '/savings/wallet/deposit' || path === '/marketplace/payments/initialize'
    // The GH₵5 pay-per-action fees (apps/api/src/services/actionFees.ts).
    || /^\/agreements\/[a-f0-9]{24}\/signing-fee$/i.test(path) || path === '/tenant-passport/export-fee'
    || (path === '/subscriptions/subscribe' && !!body && typeof body === 'object' && 'method' in body && !!body.method)
}
