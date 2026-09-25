import http from 'node:http'
import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { REGULATED_FEATURES, reloadRegulatedFeatures, regulatedFeatureStatus, resolveRegulatedFeatures } from '../config/regulatedFeatures.js'
import { requireRegulatedFeature } from '../middleware/regulatedFeature.js'
import platformRoutes from '../routes/platform.js'

describe('regulated feature configuration', () => {
  it('enables nothing in production unless the operator opts in', () => {
    expect([...resolveRegulatedFeatures({ NODE_ENV: 'production' })]).toEqual([])
    expect([...resolveRegulatedFeatures({ NODE_ENV: 'production', REGULATED_FEATURES: '' })]).toEqual([])
  })

  it('refuses to start production with a regulated feature but no recorded basis', () => {
    expect(() => resolveRegulatedFeatures({ NODE_ENV: 'production', REGULATED_FEATURES: 'lending' }))
      .toThrow('REGULATED_BASIS_LENDING')
    expect(() => resolveRegulatedFeatures({ NODE_ENV: 'production', REGULATED_FEATURES: 'wallet', REGULATED_BASIS_WALLET: '   ' }))
      .toThrow('REGULATED_BASIS_WALLET')
  })

  it('enables a production feature only with its basis, and nothing else', () => {
    const enabled = resolveRegulatedFeatures({ NODE_ENV: 'production', REGULATED_FEATURES: 'rent_collection', REGULATED_BASIS_RENT_COLLECTION: 'Paystack split settlement agreement 2026-09' })
    expect([...enabled]).toEqual(['rent_collection'])
  })

  it('rejects unknown feature names instead of silently ignoring a typo', () => {
    expect(() => resolveRegulatedFeatures({ NODE_ENV: 'development', REGULATED_FEATURES: 'wallet,lendng' })).toThrow('lendng')
  })

  it('keeps every feature available in development and tests by default', () => {
    expect([...resolveRegulatedFeatures({ NODE_ENV: 'development' })]).toEqual([...REGULATED_FEATURES])
    expect([...resolveRegulatedFeatures({ NODE_ENV: 'test' })]).toEqual([...REGULATED_FEATURES])
  })
})

describe('regulated feature enforcement', () => {
  afterEach(() => reloadRegulatedFeatures(process.env))

  async function request(app: express.Express, path: string) {
    const server = http.createServer(app)
    await new Promise<void>(resolve => server.listen(0, resolve))
    try {
      const { port } = server.address() as { port: number }
      const res = await fetch(`http://127.0.0.1:${port}${path}`)
      return { status: res.status, body: await res.json() as Record<string, unknown> }
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  }

  function gatedApp() {
    const app = express()
    let reached = 0
    app.use('/api/platform', platformRoutes)
    app.use('/api/loans', requireRegulatedFeature('lending'), (_req, res) => { reached++; res.json({ reached }) })
    app.use('/api/payouts', requireRegulatedFeature('rent_collection', 'wallet'), (_req, res) => { reached++; res.json({ reached }) })
    return { app, reached: () => reached }
  }

  it('refuses a disabled feature before any handler runs', async () => {
    reloadRegulatedFeatures({ NODE_ENV: 'production' })
    const { app, reached } = gatedApp()
    const res = await request(app, '/api/loans/apply')
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ success: false, code: 'FEATURE_UNAVAILABLE', feature: 'lending' })
    expect(reached()).toBe(0)
  })

  it('admits a route when any one of its permitted bases is enabled', async () => {
    reloadRegulatedFeatures({ NODE_ENV: 'production', REGULATED_FEATURES: 'rent_collection', REGULATED_BASIS_RENT_COLLECTION: 'licence' })
    const { app, reached } = gatedApp()
    expect((await request(app, '/api/payouts')).status).toBe(200)
    expect((await request(app, '/api/loans')).status).toBe(403)
    expect(reached()).toBe(1)
  })

  it('publishes the enabled set so clients can hide unavailable features', async () => {
    reloadRegulatedFeatures({ NODE_ENV: 'production', REGULATED_FEATURES: 'insurance', REGULATED_BASIS_INSURANCE: 'NIC licence ref' })
    const res = await request(gatedApp().app, '/api/platform/features')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ regulated: regulatedFeatureStatus() })
    expect((res.body.data as { regulated: Record<string, boolean> }).regulated).toMatchObject({ insurance: true, lending: false, wallet: false })
  })
})
