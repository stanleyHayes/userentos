import express from 'express'
import jwt from 'jsonwebtoken'
import { existsSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const uid = '6aa5e860ed2f39b2f1054b99'
const disputeId = '6aa5e860ed2f39b2f1054b98'
const dir = path.join(tmpdir(), `rentos-uploads-${process.pid}-${Date.now()}`, 'nested')
process.env.UPLOADS_DIR = dir

vi.mock('../models/User.js', () => ({ User: { exists: vi.fn().mockResolvedValue({ _id: uid }) } }))
vi.mock('../models/Dispute.js', () => ({ Dispute: { findById: () => ({ select: () => ({ lean: async () => ({ filedBy: uid, filedAgainst: 'someone' }) }) }) } }))
vi.mock('../controllers/disputeController.js', () => ({
  disputeController: { uploadEvidence: async (req: express.Request, res: express.Response) => { res.json({ files: (req.files as Express.Multer.File[]).map((f) => f.path) }) } },
}))

const { config } = await import('../config/index.js')
const { default: disputesRouter } = await import('../routes/disputes.js')

describe('dispute evidence upload directory', () => {
  let server: Server
  let base = ''
  beforeAll(async () => {
    const app = express()
    app.use('/disputes', disputesRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(path.dirname(dir), { recursive: true, force: true })
    delete process.env.UPLOADS_DIR
  })

  it('creates the uploads folder on first upload instead of failing', async () => {
    expect(existsSync(dir)).toBe(false)
    const form = new FormData()
    form.append('files', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'photo.png')
    const token = jwt.sign({ userId: uid, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
    const res = await fetch(`${base}/disputes/${disputeId}/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    expect(res.status).toBe(200)
    const files = await readdir(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^evidence-[a-f0-9]{32}\.png$/)
  })
})
