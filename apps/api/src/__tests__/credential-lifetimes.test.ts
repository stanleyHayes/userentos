import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'

/*
 * The Privacy Policy prints CREDENTIAL_LIFETIMES. These check the lifetimes
 * the API actually issues, not the constant against itself.
 */
const { sendPasswordResetEmail } = vi.hoisted(() => ({ sendPasswordResetEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('../services/email.js', () => ({ sendPasswordResetEmail }))
vi.mock('../utils/audit.js', () => ({ recordAuditEntry: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(true), notifyWelcome: vi.fn().mockResolvedValue(true) }))

const { AuthService } = await import('../services/authService.js')
const { CREDENTIAL_LIFETIMES } = await import('../types/index.js')

describe('credential lifetimes the privacy notice quotes', () => {
  it('issues password-reset links that last as long as the notice says', async () => {
    const user = { _id: { toString: () => 'user-1' }, email: 'ama@example.com' }
    const repo = { findByEmail: vi.fn().mockResolvedValue(user) }
    const service = new AuthService(repo as never, {} as never, { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never)
    await service.forgotPassword('ama@example.com')
    const token = sendPasswordResetEmail.mock.calls[0][1] as string
    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number }
    expect(exp - iat).toBe(CREDENTIAL_LIFETIMES.passwordResetMinutes * 60)
  })
})
