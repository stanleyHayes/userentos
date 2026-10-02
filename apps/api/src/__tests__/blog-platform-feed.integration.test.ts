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
import { Storefront } from '../models/Storefront.js'
import blog from '../routes/blog.js'
import authoring from '../routes/authoring.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('platform blog feed', () => {
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
    await Storefront.deleteMany({ ownerId: String(author) })
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

  it('lets the news desk publish without choosing a slug, and keeps legacy editorial listed after an edit', async () => {
    const created = await fetch(`${url}/blog`, {
      method: 'POST', headers: asStaff,
      body: JSON.stringify({ title: `${tag} Desk post`, excerpt: `${tag} excerpt`, content: 'Body', published: true }),
    })
    expect(created.status).toBe(201)
    const post = (await created.json()).data as { slug: string; status: string; publishedAt?: string }
    expect(post.slug).toBe(`${tag}-desk-post`)
    expect(post).toMatchObject({ status: 'published' })
    expect(post.publishedAt).toBeTruthy()
    expect(await feedSlugs()).toContain(post.slug)

    // Same title again: a fresh slug rather than a duplicate-key failure.
    const again = await fetch(`${url}/blog`, { method: 'POST', headers: asStaff, body: JSON.stringify({ title: `${tag} Desk post`, excerpt: `${tag} excerpt`, content: 'Body' }) })
    expect(again.status).toBe(201)
    expect((await again.json()).data.slug).not.toBe(post.slug)

    // A legacy editorial row (no platform flag, default status) edited and re-published stays on the feed.
    const { insertedId } = await BlogPost.collection.insertOne({ title: 'Legacy to edit', slug: `${tag}-legacy-edit`, excerpt: `${tag} excerpt`, content: 'Body', author: 'RentOS Team', published: true, status: 'draft', tags: [], createdAt: new Date() })
    const edited = await fetch(`${url}/blog/${insertedId}`, { method: 'PATCH', headers: asStaff, body: JSON.stringify({ title: 'Legacy edited', published: true }) })
    expect(edited.status).toBe(200)
    expect(await feedSlugs()).toContain(`${tag}-legacy-edit`)
    expect(await BlogPost.findById(insertedId).lean()).toMatchObject({ platform: true, status: 'published' })
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

  it("syndicates a live website's posts into RentOS Real Estate News, credited to the website", async () => {
    const site = await Storefront.create({ ownerType: 'user', ownerId: String(author), slug: `${tag}-homes`, name: 'ABC Properties', status: 'active', published: true })
    const post = await BlogPost.create({ title: 'How rental prices are changing in Accra', slug: `${tag}-prices`, excerpt: `${tag} excerpt`, content: 'Body text for the article.', author: 'Blog Fixture', authorId: String(author), storefrontId: String(site._id), platform: false, status: 'published', published: true, publishedAt: new Date() })

    const all = (await (await fetch(`${url}/blog?search=${tag}`)).json()).data.items as { slug: string; source: string; website: { name: string; url: string } | null }[]
    const item = all.find((p) => p.slug === post.slug)
    expect(item).toMatchObject({ source: 'website', website: { name: 'ABC Properties', url: `https://${tag}-homes.userentos.com` } })

    const article = (await (await fetch(`${url}/blog/slug/${post.slug}`)).json()).data
    expect(article.website.name).toBe('ABC Properties')

    const rentosOnly = (await (await fetch(`${url}/blog?search=${tag}&scope=rentos`)).json()).data.items as { slug: string }[]
    expect(rentosOnly.map((p) => p.slug)).not.toContain(post.slug)

    // A website taken back to a draft (or suspended) takes its posts with it.
    await Storefront.updateOne({ _id: site._id }, { $set: { published: false } })
    expect(await feedSlugs()).not.toContain(post.slug)
    expect((await fetch(`${url}/blog/slug/${post.slug}`)).status).toBe(404)
  })
})
