import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Notification } from '../models/Notification.js'
import { notifyWelcome } from '../services/notify.js'
import { reloadRegulatedFeatures } from '../config/regulatedFeatures.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

/*
 * The first message a new account sees. It promoted RentGuard to everyone,
 * though the wallet behind it is a regulated service switched off in
 * production, and spoke to tenants only.
 */
describe.skipIf(!hasTestMongo)('the welcome message', () => {
  const ids = Array.from({ length: 5 }, () => String(new mongoose.Types.ObjectId()))
  const message = async (userId: string) => (await Notification.findOne({ userId }).sort({ createdAt: -1 }).lean())?.message ?? ''

  beforeAll(async () => { await mongoose.connect(testMongoUri) })
  afterAll(async () => {
    reloadRegulatedFeatures()
    await Notification.deleteMany({ userId: { $in: ids } })
    await mongoose.disconnect()
  })

  it('speaks to what each account comes for, and mentions RentGuard only while the wallet is offered', async () => {
    reloadRegulatedFeatures({ REGULATED_FEATURES: '' })
    await notifyWelcome(ids[0], 'Ama', 'tenant')
    await notifyWelcome(ids[1], 'Yaw', 'landlord')
    await notifyWelcome(ids[2], 'Kwadwo', 'property_manager')
    expect(await message(ids[0])).toContain('Find a home')
    expect(await message(ids[0])).not.toContain('RentGuard')
    expect(await message(ids[1])).toContain('Add your first property')
    expect(await message(ids[2])).toContain('free property website')

    // Staff and regulators are not told to find a home.
    await notifyWelcome(ids[4], 'Kofi', 'government')
    expect(await message(ids[4])).toContain('Your dashboard shows what you can do')

    reloadRegulatedFeatures({ REGULATED_FEATURES: 'wallet' })
    await notifyWelcome(ids[3], 'Esi', 'tenant')
    expect(await message(ids[3])).toContain('RentGuard')
  })
})
