import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TERMS_VERSION, PRIVACY_VERSION } from '../types/index.js'

const register = vi.hoisted(() => vi.fn())
vi.mock('../container.js', () => ({ authService: { register } }))

import { authController } from '../controllers/authController.js'
import platformRouter from '../routes/platform.js'
import { reloadSignupRoles, resolveSignupRoles } from '../config/signupRoles.js'

describe('sign-up is open to the two phase-1 journeys only', () => {
  let server: Server
  let base = ''
  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.post('/register', authController.register)
    app.use('/platform', platformRouter)
    server = await new Promise<Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())) })
  afterEach(() => { register.mockReset(); reloadSignupRoles({}) })

  const signUp = (body: Record<string, unknown>) => fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ama@example.com', phone: '0240000000', password: 'Strong!pass1', firstName: 'Ama', lastName: 'Owusu',
      acceptance: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true },
      ...body,
    }),
  })

  it('defaults to tenants and agents / agencies / property managers', () => {
    expect(resolveSignupRoles({})).toEqual(['tenant', 'property_manager'])
    expect(resolveSignupRoles({ SIGNUP_ROLES: 'tenant, property_manager, landlord' })).toEqual(['tenant', 'property_manager', 'landlord'])
    expect(() => resolveSignupRoles({ SIGNUP_ROLES: 'tenant,admin' })).toThrow(/Unknown SIGNUP_ROLES/)
  })

  it.each(['landlord', 'developer', 'business', 'service_provider'])('refuses a new %s account', async (role) => {
    const response = await signUp({ role })
    expect(response.status).toBe(403)
    expect(register).not.toHaveBeenCalled()
  })

  it('creates an agent by default and records the professional type chosen', async () => {
    register.mockResolvedValue({ data: { user: {} }, status: 201 })
    expect((await signUp({ role: 'property_manager' })).status).toBe(201)
    expect(register.mock.calls[0][0]).toMatchObject({ role: 'property_manager', professionalType: 'agent' })
    await signUp({ role: 'property_manager', professionalType: 'agency' })
    expect(register.mock.calls[1][0]).toMatchObject({ professionalType: 'agency' })
  })

  it('does not attach a professional type to a tenant', async () => {
    register.mockResolvedValue({ data: { user: {} }, status: 201 })
    await signUp({ role: 'tenant', professionalType: 'agency' })
    expect(register.mock.calls[0][0]).not.toHaveProperty('professionalType')
  })

  it('reopens an account type from configuration alone', async () => {
    reloadSignupRoles({ SIGNUP_ROLES: 'tenant,property_manager,landlord' })
    register.mockResolvedValue({ data: { user: {} }, status: 201 })
    expect((await signUp({ role: 'landlord' })).status).toBe(201)
  })

  it('publishes the open account types so clients offer exactly those', async () => {
    const body = await (await fetch(`${base}/platform/features`)).json()
    expect(body.data.signupRoles).toEqual(['tenant', 'property_manager'])
  })
})
