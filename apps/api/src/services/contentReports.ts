/**
 * Abuse reports and admin takedown (spec §6, §15).
 *
 * Two things this deliberately does NOT do:
 *
 *  - Auto-remove on report volume. Report count is the cheapest thing on the
 *    platform to fake; a competitor with five accounts could delist a rival's
 *    property. Every removal is a human decision, and the queue exists to make
 *    that decision fast rather than to make it automatic.
 *  - Tell the reporter what happened to the reported party. The reporter learns
 *    their report was resolved, not what was done, so reports cannot be used to
 *    probe another account's state.
 */
import { ContentReport, type ReportTargetType, type ReportAction } from '../models/ContentReport.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { Message, Conversation } from '../models/Conversation.js'
import { getIO } from './socket.js'
import { Storefront } from '../models/Storefront.js'
import { BlogPost } from '../models/BlogPost.js'
import { Review } from '../models/Review.js'
import { envNumber } from '../utils/env.js'

/** How many reports one account may file per rolling hour. */
export const REPORTS_PER_HOUR = envNumber('ABUSE_REPORTS_PER_HOUR', 10)

export interface VelocityCheck {
  allowed: boolean
  reason?: string
  retryAfterMinutes?: number
}

/**
 * Rolling-window velocity limit.
 *
 * Pure so it can be tested without a clock or a database: callers pass the
 * timestamps of the reporter's recent reports and the current time.
 */
export function checkReportVelocity(
  recentReportTimes: Date[],
  now: Date,
  limit: number = REPORTS_PER_HOUR,
): VelocityCheck {
  const windowStart = now.getTime() - 60 * 60 * 1000
  const inWindow = recentReportTimes.filter((t) => t.getTime() > windowStart)
  if (inWindow.length < limit) return { allowed: true }

  // Tell them when they can report again rather than a bare refusal — someone
  // hitting this legitimately (a burst of spam listings) needs to know it is
  // temporary.
  const oldest = inWindow.reduce((a, b) => (a.getTime() < b.getTime() ? a : b))
  const freesAt = oldest.getTime() + 60 * 60 * 1000
  return {
    allowed: false,
    reason: `You have filed ${limit} reports in the past hour. Please wait before filing more.`,
    retryAfterMinutes: Math.max(1, Math.ceil((freesAt - now.getTime()) / 60_000)),
  }
}

export interface ResolvedTarget {
  exists: boolean
  label?: string
  ownerId?: string
}

/** Confirm the reported thing exists, and capture who owns it and what it is called. */
export async function resolveReportTarget(type: ReportTargetType, id: string, reporterId?: string): Promise<ResolvedTarget> {
  switch (type) {
    case 'user': {
      const user = await User.findById(id).select('firstName lastName').lean()
      return user ? { exists: true, label: `${user.firstName} ${user.lastName}`, ownerId: id } : { exists: false }
    }
    case 'message': {
      if (!reporterId) return { exists: false }
      const message = await Message.findById(id).lean()
      if (!message || message.removed) return { exists: false }
      const conversation = await Conversation.exists({ _id: message.conversationId, participants: reporterId })
      return conversation ? { exists: true, label: message.text.slice(0, 2000), ownerId: message.senderId } : { exists: false }
    }
    case 'property': {
      const p = await Property.findById(id).select('title landlordId').lean()
      return p ? { exists: true, label: p.title, ownerId: p.landlordId } : { exists: false }
    }
    case 'storefront': {
      const s = await Storefront.findById(id).select('name ownerId').lean()
      return s ? { exists: true, label: s.name, ownerId: s.ownerId } : { exists: false }
    }
    case 'blog_post': {
      const b = await BlogPost.findById(id).select('title authorId').lean()
      return b ? { exists: true, label: b.title, ownerId: b.authorId } : { exists: false }
    }
    case 'review': {
      const r = await Review.findById(id).select('title userId').lean()
      return r ? { exists: true, label: r.title, ownerId: r.userId } : { exists: false }
    }
  }
}

/**
 * Carry out a removal.
 *
 * Each target type has its own idea of "removed", and none of them is a delete:
 * the record stays so the decision is auditable and reversible.
 */
export async function removeReportedContent(
  type: ReportTargetType,
  id: string,
  reason: string,
): Promise<boolean> {
  switch (type) {
    case 'user': return false // Account enforcement uses suspendAccount, never content removal.
    case 'message': {
      const message = await Message.findById(id).lean()
      if (!message) return false
      await Message.updateOne({ _id: id }, { $set: { removed: true, removedReason: reason } })
      await Conversation.updateOne({ _id: message.conversationId, 'lastMessage.text': message.text, 'lastMessage.senderId': message.senderId }, { $unset: { lastMessage: 1 } })
      const conversation = await Conversation.findById(message.conversationId).select('participants').lean()
      try {
        for (const participant of conversation?.participants ?? []) getIO().to(`user:${participant}`).emit('message:removed', { conversationId: message.conversationId, messageId: id })
      } catch { /* HTTP history masks the removed content independently. */ }
      return true
    }
    case 'property': {
      const res = await Property.updateOne(
        { _id: id },
        { $set: { listingStatus: 'suspended', rejectionReason: reason } },
      )
      return res.matchedCount > 0
    }
    case 'storefront': {
      const res = await Storefront.updateOne(
        { _id: id },
        { $set: { status: 'suspended', suspendedReason: reason } },
      )
      return res.matchedCount > 0
    }
    case 'blog_post': {
      const res = await BlogPost.updateOne(
        { _id: id },
        { $set: { status: 'removed', published: false, removedReason: reason } },
      )
      return res.matchedCount > 0
    }
    case 'review': {
      const res = await Review.updateOne({ _id: id }, { $set: { removed: true, removedReason: reason } })
      return res.matchedCount > 0
    }
  }
}

/**
 * Which resolutions are legal from a given status.
 *
 * A report that has already been actioned or dismissed is finished; reopening
 * it would let a second admin quietly undo the first one's decision without a
 * trace. Reversal is a new report, or a direct un-suspend on the item.
 */
const TERMINAL: ReadonlySet<string> = new Set(['actioned', 'dismissed'])

export function canResolveReport(currentStatus: string): { ok: boolean; reason?: string } {
  if (TERMINAL.has(currentStatus)) {
    return { ok: false, reason: `This report is already ${currentStatus} and cannot be changed.` }
  }
  return { ok: true }
}

/** The status a report lands in once an admin picks an action. */
export function statusForAction(action: ReportAction): 'actioned' | 'dismissed' {
  return action === 'none' ? 'dismissed' : 'actioned'
}

/** Count open reports per target so the queue can surface repeat offenders. */
export async function openReportCounts(
  targets: Array<{ targetType: ReportTargetType; targetId: string }>,
): Promise<Map<string, number>> {
  if (targets.length === 0) return new Map()

  const rows = await ContentReport.aggregate<{ _id: { targetType: string; targetId: string }; count: number }>([
    {
      $match: {
        status: { $in: ['open', 'reviewing'] },
        $or: targets.map((t) => ({ targetType: t.targetType, targetId: t.targetId })),
      },
    },
    { $group: { _id: { targetType: '$targetType', targetId: '$targetId' }, count: { $sum: 1 } } },
  ])

  return new Map(rows.map((r) => [`${r._id.targetType}:${r._id.targetId}`, r.count]))
}
