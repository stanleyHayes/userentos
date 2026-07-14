import { Request, Response } from 'express'
import { z } from 'zod'
import { authService } from '../container.js'
import { success, error } from '../utils/response.js'

const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(10),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['tenant', 'landlord', 'property_manager', 'financier', 'employer']),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function getClientMeta(req: Request) {
  const deviceLabel = req.headers['x-device-label'] as string | undefined
  const ipAddress = req.ip || (req as unknown as { socket?: { remoteAddress?: string } }).socket?.remoteAddress || undefined
  return { deviceLabel, ipAddress }
}

export const authController = {
  register: async (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const meta = getClientMeta(req)
    const result = await authService.register(parsed.data, meta.deviceLabel, meta.ipAddress)
    if (result.error) { error(res, result.error, result.status); return }
    success(res, result.data, 'Registration successful', result.status)
  },

  login: async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const meta = getClientMeta(req)
    const result = await authService.login(parsed.data.email, parsed.data.password, meta.deviceLabel, meta.ipAddress)
    if (result.error) { error(res, result.error, result.status); return }
    success(res, result.data)
  },

  refresh: async (req: Request, res: Response) => {
    const schema = z.object({ refreshToken: z.string().min(1) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const meta = getClientMeta(req)
    const result = await authService.refresh(parsed.data.refreshToken, meta.deviceLabel, meta.ipAddress)
    if (result.error) { error(res, result.error, result.status); return }
    success(res, result.data)
  },

  logout: async (req: Request, res: Response) => {
    const schema = z.object({ refreshToken: z.string().min(1) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    await authService.logout(parsed.data.refreshToken)
    success(res, null, 'Logged out successfully')
  },

  logoutAll: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    await authService.logoutAll(userId)
    success(res, null, 'Logged out from all devices')
  },

  changePassword: async (req: Request, res: Response) => {
    const userId = req.user!.userId

    const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const result = await authService.changePassword(userId, parsed.data.currentPassword, parsed.data.newPassword)
    if (result.error) { error(res, result.error, result.status); return }
    success(res, result.data, result.message)
  },

  forgotPassword: async (req: Request, res: Response) => {
    const { email } = req.body
    if (!email) { error(res, 'Email required'); return }

    const result = await authService.forgotPassword(email)
    success(res, result.data, result.message)
  },

  resetPassword: async (req: Request, res: Response) => {
    const schema = z.object({ token: z.string().min(1), newPassword: z.string().min(8) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const result = await authService.resetPassword(parsed.data.token, parsed.data.newPassword)
    if (result.error) { error(res, result.error, result.status); return }
    success(res, result.data, result.message)
  },

  verifyMfaLogin: async (req: Request, res: Response) => {
    const schema = z.object({ mfaToken: z.string().min(1), code: z.string().min(6).max(6) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const meta = getClientMeta(req)
    const result = await authService.verifyMfaLogin(parsed.data.mfaToken, parsed.data.code, meta.deviceLabel, meta.ipAddress)
    if (result.error) { error(res, result.error, result.status); return }
    success(res, result.data)
  },

  mfaSetup: async (req: Request, res: Response) => {
    const result = await authService.mfaSetup(req.user!.userId)
    if (result.error) { error(res, result.error, result.status); return }
    success(res, result.data)
  },

  mfaEnable: async (req: Request, res: Response) => {
    const schema = z.object({ code: z.string().min(6).max(6) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const result = await authService.mfaEnable(req.user!.userId, parsed.data.code)
    if (result.error) { error(res, result.error, result.status); return }
    success(res, result.data, result.message)
  },

  mfaDisable: async (req: Request, res: Response) => {
    const schema = z.object({ code: z.string().min(6).max(6) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const result = await authService.mfaDisable(req.user!.userId, parsed.data.code)
    if (result.error) { error(res, result.error, result.status); return }
    success(res, result.data, result.message)
  },
}
