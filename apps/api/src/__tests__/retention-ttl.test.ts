import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RETENTION_DAYS, ttlSeconds } from '../config/retention.js'
import { RegistryPageView } from '../models/RegistryPageView.js'
import { Notification } from '../models/Notification.js'
import { ContentReport } from '../models/ContentReport.js'
import { WebhookEvent } from '../models/WebhookEvent.js'
import { StoreNotification } from '../models/StoreNotification.js'
import { ComplaintLog } from '../models/ComplaintLog.js'
import { StorefrontEvent } from '../models/StorefrontEvent.js'
import { ValuationLog } from '../models/ValuationLog.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

type AnyModel = { schema: mongoose.Schema; collection: mongoose.Collection; createIndexes(): Promise<unknown> }
const ttl = (model: AnyModel, field: string) =>
  model.schema.indexes().filter(([keys, options]) => Object.keys(keys).join() === field && options?.expireAfterSeconds !== undefined).map(([, options]) => options)

describe('retention periods come from config/retention.ts', () => {
  it('expires registry page views after 13 months', () => {
    expect(RETENTION_DAYS.registryPageView).toBeGreaterThanOrEqual(390)
    expect(ttl(RegistryPageView as unknown as AnyModel, 'createdAt')).toEqual([expect.objectContaining({ expireAfterSeconds: ttlSeconds('registryPageView') })])
  })

  it('expires read notifications after a year and untouched unread ones after two', () => {
    expect(ttl(Notification as unknown as AnyModel, 'createdAt')).toEqual([{ expireAfterSeconds: ttlSeconds('readNotification'), partialFilterExpression: { read: true } }])
    expect(ttl(Notification as unknown as AnyModel, 'updatedAt')).toEqual([expect.objectContaining({ expireAfterSeconds: ttlSeconds('unreadNotification') })])
  })

  it('expires only dismissed content reports, never actioned ones', () => {
    expect(ttl(ContentReport as unknown as AnyModel, 'handledAt')).toEqual([{ expireAfterSeconds: ttlSeconds('dismissedContentReport'), partialFilterExpression: { status: 'dismissed' } }])
  })

  it.each([
    [WebhookEvent, 'createdAt', 'webhookEvent'],
    [StoreNotification, 'processedAt', 'storeNotification'],
    [ComplaintLog, 'createdAt', 'complaintLog'],
    [StorefrontEvent, 'createdAt', 'storefrontEvent'],
    [ValuationLog, 'createdAt', 'valuationLog'],
  ] as const)('keeps existing TTLs on %s in the central table', (model, field, key) => {
    expect(ttl(model as unknown as AnyModel, field)).toEqual([expect.objectContaining({ expireAfterSeconds: ttlSeconds(key) })])
  })
})

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('the server accepts the TTL indexes', () => {
  beforeAll(() => mongoose.connect(uri))
  afterAll(() => mongoose.disconnect())

  it.each([RegistryPageView, Notification, ContentReport] as unknown as AnyModel[])('builds TTL indexes for %s', async (model) => {
    await model.createIndexes()
    const indexes = await model.collection.indexes()
    const expected = model.schema.indexes().filter(([, options]) => options?.expireAfterSeconds !== undefined)
    for (const [keys, options] of expected) {
      expect(indexes.find((index) => JSON.stringify(index.key) === JSON.stringify(keys))).toMatchObject({ expireAfterSeconds: options!.expireAfterSeconds })
    }
  })
})
