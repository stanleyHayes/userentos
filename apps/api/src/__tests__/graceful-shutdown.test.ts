import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { drainInFlight, inFlightCount, trackInFlight } from '../services/inFlight.js'

describe('work a deploy must let finish', () => {
  it('waits for tracked webhook or cron work before the database closes', async () => {
    let finish!: () => void
    const work = trackInFlight(new Promise<void>((resolve) => { finish = resolve }))
    expect(inFlightCount()).toBe(1)
    let drained = false
    const drain = drainInFlight(5_000).then(() => { drained = true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(drained).toBe(false)
    finish()
    await work
    await drain
    expect(drained).toBe(true)
    expect(inFlightCount()).toBe(0)
  })

  it('never waits past its bound for work that hangs', async () => {
    void trackInFlight(new Promise(() => undefined))
    const started = Date.now()
    await drainInFlight(50)
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('stops tracking work that failed', async () => {
    const failing = trackInFlight(Promise.reject(new Error('boom')))
    await failing.catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    // Only the hung promise from the previous test remains.
    expect(inFlightCount()).toBe(1)
  })

  it('gracefulShutdown stops cron tasks, drains in-flight work, and outlasts the 20s provider timeout', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8')
    const shutdown = src.slice(src.indexOf('function gracefulShutdown'), src.indexOf("process.on('SIGTERM'"))
    expect(shutdown).toContain('stopScheduler(')
    expect(shutdown).toContain('drainInFlight(')
    expect(shutdown).toMatch(/process\.exit\(1\)\n\s*\}, 25_000\)/)
    // The Paystack webhook registers its processing.
    expect(readFileSync(join(process.cwd(), 'src', 'routes', 'paystackWebhooks.ts'), 'utf8')).toContain('trackInFlight(')
  })
})
