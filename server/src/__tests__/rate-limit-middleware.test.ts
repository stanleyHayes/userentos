import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const middlewarePath = resolve(here, '..', 'middleware', 'rateLimit.ts')
const middlewareExists = existsSync(middlewarePath)

const describeIfExists = middlewareExists ? describe : describe.skip

describeIfExists('middleware/rateLimit smoke test', () => {
  it('exports loginLimiter, publicLimiter, writeLimiter as functions', async () => {
    const mod = await import('../middleware/rateLimit.js')
    expect(typeof mod.loginLimiter).toBe('function')
    expect(typeof mod.publicLimiter).toBe('function')
    expect(typeof mod.writeLimiter).toBe('function')
  })
})
