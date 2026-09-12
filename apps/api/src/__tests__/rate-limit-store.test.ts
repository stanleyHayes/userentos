import { describe, it, expect, afterEach, vi } from 'vitest'

/**
 * express-rate-limit defaults to an in-process MemoryStore, which counts
 * requests PER INSTANCE. On a multi-instance deployment that silently
 * multiplies every limit by the instance count: "5 login attempts per 15
 * minutes" becomes 5 x N, and the brute-force protection the number was
 * chosen for is not what is enforced.
 */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function backend() {
  const mod = await import('../middleware/rateLimit.js')
  return mod.rateLimitBackend()
}

describe('rate limit backing store', () => {
  it('reports memory when REDIS_URL is unset', async () => {
    vi.stubEnv('REDIS_URL', '')
    expect(await backend()).toBe('memory')
  })

  it('reports redis when REDIS_URL is configured', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
    expect(await backend()).toBe('redis')
  })

  it('treats a blank REDIS_URL as unset', async () => {
    // `REDIS_URL=` in a Render dashboard field is an empty STRING, and
    // `new Redis('')` would throw rather than fall back.
    vi.stubEnv('REDIS_URL', '   ')
    expect(await backend()).toBe('memory')
  })
})

describe('limiter configuration', () => {
  it('fails open rather than 500ing when the store errors', async () => {
    // A rate limiter that returns 500 for every request during a Redis blip
    // is a worse outage than briefly unlimited traffic: it takes the whole
    // API down in order to protect it.
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../middleware/rateLimit.ts', import.meta.url), 'utf8'))

    const limiterCount = (source.match(/= rateLimit\(\{/g) ?? []).length
    const passOnCount = (source.match(/passOnStoreError: true/g) ?? []).length
    expect(limiterCount).toBeGreaterThan(0)
    expect(passOnCount).toBe(limiterCount)
  })

  it('keeps the offline queue enabled so store init can run before connect', async () => {
    // rate-limit-redis loads a Lua script during init, at module load, before
    // the connection is up. With enableOfflineQueue:false that command throws
    // "Stream isn't writeable", store init fails, and every request 500s —
    // while the log still cheerfully says "Redis connected".
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../middleware/rateLimit.ts', import.meta.url), 'utf8'))

    expect(source).toContain('enableOfflineQueue: true')
    // And a bound, so a dead Redis cannot hang a request instead.
    expect(source).toMatch(/commandTimeout:\s*\d+/)
  })

  it('gives each limiter its own key prefix', async () => {
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../middleware/rateLimit.ts', import.meta.url), 'utf8'))

    const prefixes = [...source.matchAll(/store\('([a-z]+)'\)/g)].map(m => m[1])
    expect(prefixes.length).toBeGreaterThan(1)
    // Sharing a prefix would make one limiter's window consume another's.
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })
})
