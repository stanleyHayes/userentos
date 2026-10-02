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
  propertyId: string
  propertyTitle: string
  agentId: string
  contact: { name: string; phone: string; email?: string }
  /** The signed-in enquirer, when there is one. */
  requesterId?: string
  message?: string
  channel: LeadChannel
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
 * names the property; the enquirer's own details stay on the lead, which is
 * anonymised if they close their account.
 */
export async function recordEnquiry(input: EnquiryInput): Promise<{ lead: ILead; created: boolean }> {
  if (input.requesterId) {
    const existing = await Lead.findOne({
      propertyId: input.propertyId,
      agentId: input.agentId,
      requesterId: input.requesterId,
      status: { $in: OPEN_STATUSES },
      createdAt: { $gte: new Date(Date.now() - REPEAT_WINDOW_MS) },
    }).sort({ createdAt: -1 })
    if (existing) {
      if (input.message) existing.message = input.message
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
    contactPhone: input.contact.phone,
    contactEmail: input.contact.email,
    message: input.message,
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
