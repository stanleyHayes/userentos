import { Router } from 'express'
import type { Types } from 'mongoose'
import crypto from 'crypto'
import { authenticate } from '../middleware/auth.js'
import { WebhookSubscription } from '../models/WebhookSubscription.js'
import { success, error } from '../utils/response.js'
import { dispatchWebhook, assertSafeWebhookUrl } from '../services/webhooks.js'
import type { WebhookEvent } from '../services/webhooks.js'

const router = Router()

const MAX_SUBSCRIPTIONS_PER_USER = 10

const VALID_EVENTS: WebhookEvent[] = [
  'application.created',
  'application.approved',
  'application.rejected',
  'agreement.signed',
  'agreement.activated',
  'agreement.expiring',
  'payment.completed',
  'payment.failed',
  'lease.expiring',
  'maintenance.escalated',
  'dispute.filed',
  'dispute.resolved',
]

router.get('/subscriptions', authenticate, async (req, res) => {
  const subs = await WebhookSubscription.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).lean()
  success(res, {
    items: subs.map((s) => ({
      id: (s._id as Types.ObjectId).toString(),
      url: s.url,
      events: s.events,
      isActive: s.isActive,
      lastDeliveredAt: s.lastDeliveredAt,
      lastFailureAt: s.lastFailureAt,
      failureCount: s.failureCount,
      createdAt: s.createdAt,
    })),
  })
})

router.post('/subscriptions', authenticate, async (req, res) => {
  const { url, events } = req.body
  if (!url || !events || !Array.isArray(events) || events.length === 0) {
    error(res, 'url and events[] are required')
    return
  }

  try {
    await assertSafeWebhookUrl(url)
  } catch (e) {
    error(res, (e as Error).message || 'Invalid URL')
    return
  }

  const invalid = events.filter((e: string) => e !== '*' && !VALID_EVENTS.includes(e as WebhookEvent))
  if (invalid.length > 0) {
    error(res, `Invalid events: ${invalid.join(', ')}`)
    return
  }

  // Cap active subscriptions per user to limit delivery amplification
  const activeCount = await WebhookSubscription.countDocuments({ userId: req.user!.userId, isActive: true })
  if (activeCount >= MAX_SUBSCRIPTIONS_PER_USER) {
    error(res, `Subscription limit reached (max ${MAX_SUBSCRIPTIONS_PER_USER} active subscriptions)`, 409)
    return
  }

  const secret = crypto.randomBytes(32).toString('hex')
  const sub = await WebhookSubscription.create({
    userId: req.user!.userId,
    url,
    events,
    secret,
  })

  success(res, {
    id: (sub._id as Types.ObjectId).toString(),
    url: sub.url,
    events: sub.events,
    secret,
    isActive: sub.isActive,
  }, 'Subscription created', 201)
})

router.delete('/subscriptions/:id', authenticate, async (req, res) => {
  const sub = await WebhookSubscription.findOne({ _id: req.params.id, userId: req.user!.userId })
  if (!sub) { error(res, 'Subscription not found', 404); return }
  await WebhookSubscription.deleteOne({ _id: req.params.id })
  success(res, null, 'Subscription deleted')
})

router.patch('/subscriptions/:id', authenticate, async (req, res) => {
  const sub = await WebhookSubscription.findOne({ _id: req.params.id, userId: req.user!.userId })
  if (!sub) { error(res, 'Subscription not found', 404); return }

  const { isActive, events } = req.body
  if (typeof isActive === 'boolean') sub.isActive = isActive
  if (events && Array.isArray(events)) {
    const invalid = events.filter((e: string) => e !== '*' && !VALID_EVENTS.includes(e as WebhookEvent))
    if (invalid.length > 0) {
      error(res, `Invalid events: ${invalid.join(', ')}`)
      return
    }
    sub.events = events
  }
  await sub.save()
  success(res, null, 'Subscription updated')
})

// Test endpoint: trigger a test event
router.post('/subscriptions/:id/test', authenticate, async (req, res) => {
  const sub = await WebhookSubscription.findOne({ _id: req.params.id, userId: req.user!.userId })
  if (!sub) { error(res, 'Subscription not found', 404); return }

  dispatchWebhook('payment.completed', { test: true, message: 'This is a test event' }, { userId: req.user!.userId })
  success(res, null, 'Test event dispatched')
})

export default router
