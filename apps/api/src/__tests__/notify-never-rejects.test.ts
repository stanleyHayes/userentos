import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * notify() must never reject.
 *
 * It is called about forty times across the routes without `await` and
 * without a `.catch`, deliberately: a notification is a side effect and a
 * request should not wait for it. But the first statement was an unguarded
 * `await Notification.create(...)`, so a transient database error rejected a
 * promise that nothing was handling.
 *
 * Node terminates the process on an unhandled rejection and the server had no
 * handler, so a database blip while telling a landlord about a maintenance
 * request took the entire API down for every user.
 */

const create = vi.fn()
vi.mock('../models/Notification.js', () => ({ Notification: { create } }))

const findById = vi.fn(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) }))
vi.mock('../models/User.js', () => ({ User: { findById } }))

vi.mock('../services/socket.js', () => ({
  getIO: () => { throw new Error('socket not initialised') },
}))
vi.mock('../services/email.js', () => ({ sendEmail: vi.fn() }))
vi.mock('../services/push.js', () => ({ sendPushToUser: vi.fn() }))
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { notify } = await import('../services/notify.js')

const OPTS = { userId: 'u1', title: 't', message: 'm', skipEmail: true, skipPush: true }

beforeEach(() => {
  create.mockReset()
  findById.mockClear()
})

describe('notify', () => {
  it('resolves rather than rejecting when the database write fails', async () => {
    create.mockRejectedValue(new Error('connection reset'))
    await expect(notify(OPTS)).resolves.toBe(false)
  })

  it.each([
    ['a validation error', new Error('Notification validation failed')],
    ['a timeout', new Error('operation exceeded time limit')],
    ['a non-Error rejection', 'something odd'],
  ])('survives %s', async (_label, thrown) => {
    create.mockRejectedValue(thrown)
    await expect(notify(OPTS)).resolves.toBe(false)
  })

  it('leaves no unhandled rejection behind when called fire-and-forget', async () => {
    // The real call shape: no await, no .catch. This is what crashed.
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)

    create.mockRejectedValue(new Error('connection reset'))
    void notify(OPTS)
    await new Promise((resolve) => setTimeout(resolve, 50))

    process.off('unhandledRejection', onUnhandled)
    expect(unhandled).toEqual([])
  })

  it('reports success when the write succeeds', async () => {
    create.mockResolvedValue({ _id: { toString: () => 'n1' } })
    await expect(notify(OPTS)).resolves.toBe(true)
  })

  it('survives the socket layer being unavailable', async () => {
    // getIO throws before initSocket runs; that path was already guarded, and
    // this pins it so the guard is not removed as redundant.
    create.mockResolvedValue({ _id: { toString: () => 'n1' } })
    await expect(notify(OPTS)).resolves.toBe(true)
  })
})
