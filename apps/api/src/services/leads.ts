import type { Types } from 'mongoose'
import { Lead, type ILead, type LeadChannel, type LeadStatus } from '../models/Lead.js'
import { Property } from '../models/Property.js'
import { Delegation } from '../models/Delegation.js'
import { notify } from './notify.js'
import { NEW_LEAD_TITLE, enquiryNotice, enquirySms } from './enquiryNotices.js'
import { publicBaseUrl } from '../utils/env.js'
import { logger } from '../utils/logger.js'

/**
 * Who receives a property's enquiries: an active delegate with the 'leads'
 * scope, else the manager, else the owner.
 */
export async function agentForProperty(propertyId: string) {
  const property = await Property.findById(propertyId).lean()
  if (!property) return null
  const p = property as unknown as { landlordId?: string; managerId?: string }
  const ownerId = p.managerId ?? p.landlordId ?? null
  if (!ownerId) return { property, agentId: null }

  const delegation = await Delegation.findOne({ propertyId, status: 'active', scopes: 'leads' }).lean()
  return { property, agentId: delegation?.delegateId ?? ownerId }
}

export interface EnquiryInput {
  /** Absent for a general enquiry from the agent's website contact page. */
  propertyId?: string
  propertyTitle?: string
  agentId: string
  /** The enquirer's name. Their phone and email stay private (contact protection). */
  contact: { name: string }
  /** The signed-in enquirer, when there is one. */
  requesterId?: string
  message?: string
  channel: LeadChannel
  /** The RentOS conversation the enquiry opened, where the agent replies. */
  conversationId?: string
}

// The same person asking about the same listing again (a second WhatsApp tap,
// "I'm interested" after a message) reuses their open lead instead of filling
// the agent's inbox, and the agent is not alerted twice.
const OPEN_STATUSES: LeadStatus[] = ['new', 'contacted', 'viewing']
const REPEAT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export const leadUrl = (leadId: string) => `${publicBaseUrl()}/agent/leads?lead=${leadId}`

/**
 * Records an enquiry as a lead and tells the agent: in the app, by email and
 * push, and by SMS (brief §05), each where their settings allow. The alert
 * names the property, never the enquirer. The lead carries the enquirer's name
 * and the conversation to reply in; their phone number and email are not
 * shared with the agent, so the deal stays on RentOS.
 */
/** The enquirer's open lead with this agent about this listing (or in general), if any. */
export async function findOpenLead(query: { propertyId?: string; agentId: string; requesterId?: string }) {
  if (!query.requesterId) return null
  return Lead.findOne({
    propertyId: query.propertyId ?? { $exists: false },
    agentId: query.agentId,
    requesterId: query.requesterId,
    status: { $in: OPEN_STATUSES },
    createdAt: { $gte: new Date(Date.now() - REPEAT_WINDOW_MS) },
  }).sort({ createdAt: -1 })
}

export async function recordEnquiry(input: EnquiryInput): Promise<{ lead: ILead; created: boolean }> {
  if (input.requesterId) {
    const existing = await findOpenLead(input)
    if (existing) {
      if (input.message) existing.message = input.message
      if (input.conversationId && !existing.conversationId) existing.conversationId = input.conversationId
      if (!existing.channels?.includes(input.channel)) existing.channels = [...(existing.channels ?? []), input.channel]
      await existing.save()
      return { lead: existing, created: false }
    }
  }

  const lead = await Lead.create({
    propertyId: input.propertyId,
    agentId: input.agentId,
    requesterId: input.requesterId,
    contactName: input.contact.name,
    message: input.message,
    conversationId: input.conversationId,
    channel: input.channel,
    channels: [input.channel],
  })

  const id = (lead._id as Types.ObjectId).toString()
  notify({
    userId: input.agentId,
    title: NEW_LEAD_TITLE,
    message: enquiryNotice(input.channel, input.propertyTitle),
    actionUrl: `/agent/leads?lead=${id}`,
    sms: enquirySms(input.channel, input.propertyTitle, leadUrl(id)),
  }).catch((err) => logger.warn(`[Leads] agent notification failed: ${(err as Error).message}`))

  return { lead, created: true }
}

/** The agent's view of a lead: no phone number or email (contact protection). */
export function leadForAgent<T extends { contactPhone?: string; contactEmail?: string }>(lead: T): Omit<T, 'contactPhone' | 'contactEmail'> {
  const { contactPhone: _phone, contactEmail: _email, ...rest } = lead
  return rest
}
