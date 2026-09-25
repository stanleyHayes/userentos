import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

/*
 * The public registry detail page used to print "Landlord identity verified /
 * Property ownership confirmed / Compliant with Ghana Rent Control Act" on
 * every listing, because it treated `publishedAt` as proof of all three. The
 * API now exposes the one landlord signal that is backed by a real review.
 */

const findOne = vi.fn()
vi.mock('../models/Property.js', () => ({ Property: { findOne: (...a: unknown[]) => ({ lean: () => findOne(...a) }) } }))
const findById = vi.fn()
vi.mock('../models/User.js', () => ({ User: { findById: (...a: unknown[]) => ({ select: () => ({ lean: () => findById(...a) }) }) } }))
vi.mock('../models/RegistryPageView.js', () => ({ RegistryPageView: { create: vi.fn() } }))

const { default: router } = await import('../routes/publicRegistry.js')

const listing = {
  _id: { toString: () => '64b000000000000000000001' },
  landlordId: 'landlord-1',
  title: 'Two-bed flat',
  address: { city: 'Accra', region: 'Greater Accra' },
  listingStatus: 'approved',
  publishedAt: new Date('2026-09-01'),
  images: [],
}

describe('public registry detail — landlord trust signal', () => {
  let server: Server
  let base: string
  beforeAll(async () => {
    const app = express(); app.use('/p', router)
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/p`
  })
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)) })

  it.each([
    [{ verificationStatus: 'verified' }, true],
    [{ verificationStatus: 'pending' }, false],
    // isVerified alone (admin-created / invited accounts) is not a document review.
    [{ verificationStatus: 'none', isVerified: true }, false],
    [null, false],
  ])('landlord %j → landlordIdentityVerified %s', async (landlord, expected) => {
    findOne.mockResolvedValue(listing)
    findById.mockResolvedValue(landlord)
    const res = await fetch(`${base}/64b000000000000000000001`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.landlordIdentityVerified).toBe(expected)
    expect(body.data).not.toHaveProperty('landlordId')
  })
})
