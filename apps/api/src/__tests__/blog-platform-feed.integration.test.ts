import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('../services/entitlements.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  requireQuota: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { BlogPost } from '../models/BlogPost.js'
import blog from '../routes/blog.js'
import authoring from '../routes/authoring.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('platform blog feed', () => {
  const author = new mongoose.Types.ObjectId(), staff = new mongoose.Types.ObjectId()
  const tag = `bpf${String(author).slice(-8)}`
  let server: Server, url: string
  const headers = (id: mongoose.Types.ObjectId, roles: string[]) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(id), roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
  })
  const asAuthor = headers(author, ['landlord']), asStaff = headers(staff, ['admin'])
  const feedSlugs = async () => ((await (await fetch(`${url}/blog?search=${tag}`)).json()).data.items as { slug: string }[]).map((p) => p.slug)
  const draft = async (title: string) => {
    const res = await fetch(`${url}/authoring/posts`, {
      method: 'POST', headers: asAuthor,
      body: JSON.stringify({ title, excerpt: `${tag} excerpt`, content: 'Long enough body text.', attachToStorefront: false }),
    })
    expect(res.status).toBe(201)
    return (await res.json()).data as { id: string; slug: string }
  }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([author, staff].map((_id, i) => ({
      _id, email: `blog-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Blog', lastName: 'Fixture',
      passwordHash: 'fixture-only', roles: [i ? 'admin' : 'landlord'], activeRole: i ? 'admin' : 'landlord',
    })))
    const app = express(); app.use(express.json()); app.use('/blog', blog); app.use('/authoring', authoring)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await BlogPost.deleteMany({ excerpt: new RegExp(tag) })
    await User.deleteMany({ _id: { $in: [author, staff] } })
    await mongoose.disconnect()
  })

  it('keeps an author post with no storefront off the official RentOS blog', async () => {
    const post = await draft(`${tag} Author post`)
    expect((await fetch(`${url}/authoring/posts/${post.id}/publish`, { method: 'POST', headers: asAuthor })).status).toBe(200)
    expect(await feedSlugs()).not.toContain(post.slug)
    expect((await fetch(`${url}/blog/slug/${post.slug}`)).status).toBe(404)
  })

  it('lists staff editorial, including posts written before the platform flag', async () => {
    const res = await fetch(`${url}/blog`, {
      method: 'POST', headers: asStaff,
      body: JSON.stringify({ title: `${tag} Editorial`, slug: `${tag}-editorial`, excerpt: `${tag} excerpt`, content: 'Body', published: true }),
    })
    expect(res.status).toBe(201)
    // Legacy rows as they exist today: a staff/seed post keeps the default
    // status while live; an authored post was moved to 'published'.
    await BlogPost.collection.insertMany([
      { title: 'Legacy editorial', slug: `${tag}-legacy-editorial`, excerpt: `${tag} excerpt`, content: 'Body', author: 'RentOS Team', published: true, status: 'draft', tags: [] },
      { title: 'Legacy seed', slug: `${tag}-legacy-seed`, excerpt: `${tag} excerpt`, content: 'Body', author: 'RentOS Team', published: true, tags: [] },
      { title: 'Legacy authored', slug: `${tag}-legacy-authored`, excerpt: `${tag} excerpt`, content: 'Body', author: 'Someone', authorId: String(author), published: true, status: 'published', tags: [] },
    ])
    const slugs = await feedSlugs()
    expect(slugs).toEqual(expect.arrayContaining([`${tag}-editorial`, `${tag}-legacy-editorial`, `${tag}-legacy-seed`]))
    expect(slugs).not.toContain(`${tag}-legacy-authored`)
  })

  it('does not let an author revive a post moderation removed', async () => {
    const post = await draft(`${tag} Removed post`)
    await fetch(`${url}/authoring/posts/${post.id}/publish`, { method: 'POST', headers: asAuthor })
    const takedown = await fetch(`${url}/authoring/posts/${post.id}/takedown`, { method: 'POST', headers: asStaff, body: JSON.stringify({ reason: 'Hate speech' }) })
    expect(takedown.status).toBe(200)

    expect((await fetch(`${url}/authoring/posts/${post.id}/publish`, { method: 'POST', headers: asAuthor })).status).toBe(403)
    expect((await fetch(`${url}/authoring/posts/${post.id}/archive`, { method: 'POST', headers: asAuthor })).status).toBe(403)
    expect((await fetch(`${url}/authoring/posts/${post.id}`, { method: 'PATCH', headers: asAuthor, body: JSON.stringify({ title: `${tag} Edited title` }) })).status).toBe(403)
    expect(await BlogPost.findById(post.id).lean()).toMatchObject({ status: 'removed', published: false })
  })
})
