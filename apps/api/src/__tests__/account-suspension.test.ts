import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User } from '../models/User.js'
import { disconnectUser } from '../services/socket.js'
import { suspendAccount } from '../services/accountSuspension.js'
import { suspendedAccess } from '../services/suspendedAccess.js'
vi.mock('../models/User.js', () => ({ User: { exists: vi.fn(), updateOne: vi.fn() } }))
vi.mock('../services/socket.js', () => ({ disconnectUser: vi.fn(), getIO: () => ({ to: () => ({ emit: vi.fn() }) }) }))
beforeEach(() => { vi.resetAllMocks() })
describe('account suspension enforcement', () => {
  it('refuses protected or missing accounts before any update', async () => {
    vi.mocked(User.exists).mockResolvedValue(null)
    expect(await suspendAccount('user', 'report', 'reason')).toBe(false)
    expect(User.exists).toHaveBeenCalledWith(expect.objectContaining({ roles: { $nin: ['admin', 'super_admin'] } }))
    expect(User.updateOne).not.toHaveBeenCalled()
    expect(disconnectUser).not.toHaveBeenCalled()
  })
  it('persists the originating decision and disconnects existing sessions', async () => {
    vi.mocked(User.exists).mockResolvedValue({ _id: 'user' } as never)
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 1 } as never)
    expect(await suspendAccount('user', 'report', 'reason')).toBe(true)
    expect(User.updateOne).toHaveBeenCalledWith(expect.objectContaining({ suspendedAt: { $exists: false } }), { $set: { suspendedAt: expect.any(Date), suspensionReason: 'reason', suspensionReportId: 'report' } })
    expect(disconnectUser).toHaveBeenCalledWith('user', { notify: false })
  })
  it('does not claim success if the account became ineligible during the write', async () => {
    vi.mocked(User.exists).mockResolvedValueOnce({ _id: 'user' } as never).mockResolvedValueOnce(null)
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 0 } as never)
    expect(await suspendAccount('user', 'report', 'reason')).toBe(false)
    expect(disconnectUser).not.toHaveBeenCalled()
  })
  it('accepts an existing suspension without replacing its originating decision', async () => {
    vi.mocked(User.exists).mockResolvedValue({ _id: 'user' } as never)
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 0 } as never)
    expect(await suspendAccount('user', 'another-report', 'reason')).toBe(true)
    expect(User.exists).toHaveBeenLastCalledWith(expect.objectContaining({ suspendedAt: { $exists: true } }))
    expect(disconnectUser).toHaveBeenCalledOnce()
  })
})
describe('suspended access to rent payments', () => {
  const id = 'a'.repeat(24)
  it('lets a suspended payer cancel a stuck payment of their own, as they may still start one', () => {
    expect(suspendedAccess('POST', '/api/payments')).toBe(true)
    expect(suspendedAccess('POST', `/api/payments/${id}/cancel`)).toBe(true)
    expect(suspendedAccess('POST', `/api/payments/${id}/receipt`)).toBe(true)
    expect(suspendedAccess('POST', `/api/payments/${id}/refund`)).toBe(false)
    expect(suspendedAccess('POST', '/api/payments/not-an-id/cancel')).toBe(false)
  })
})
