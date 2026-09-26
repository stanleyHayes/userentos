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
}) {
  const active = new Map<string, Promise<unknown>>()
  return async function checkout<T>(owner: string, path: string, payload: string, send: (key: string, signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!owner) throw new Error('Sign in before starting a payment.')
    const hash = await deps.digest(JSON.stringify([owner, path, JSON.parse(payload)]))
    const storageKey = `rentos_checkout_v1_${hash}`
    const pending = active.get(storageKey)
    if (pending) return pending as Promise<T>
    const prepare = async () => {
      let key = await deps.read(storageKey)
      if (key !== null && !/^[a-zA-Z0-9-]{16,100}$/.test(key)) throw new Error('Saved payment retry information is invalid. Contact support before trying another payment.')
      if (!key) {
        key = deps.randomId()
        // Fail before sending if persistence is unavailable.
        await deps.write(storageKey, key)
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
      const cleanup = async () => { if (await deps.read(storageKey) === key) await deps.remove(storageKey) }
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
    || (path === '/subscriptions/subscribe' && !!body && typeof body === 'object' && 'method' in body && !!body.method)
}
