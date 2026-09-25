import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { RenewalOffer, type IRenewalOffer } from '../models/RenewalOffer.js'
import { Agreement, type IAgreement } from '../models/Agreement.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { round2 } from '../utils/money.js'
import { notify } from '../services/notify.js'
import { logger } from '../utils/logger.js'
import { checkAgreementCompliance } from '../services/legal/agreementCompliance.js'
import { agreementTermsHash, evidenceForViewer, signatureEvidence, SIGNATURE_CONSENT_STATEMENT } from '../services/agreementEvidence.js'

const router = Router()

/* ================================================================
   RENEWAL OFFERS — landlord proposes a new term (optionally with a
   rent adjustment) and signs it; the tenant signs to accept (the
   agreement moves to a new version) or declines.

   A renewal changes the rent and end date of a binding lease, so it
   is a new version of the contract (Act 772): each party types their
   name over the SHA-256 of the renewed terms, and nothing changes on
   the agreement until the tenant has signed.
   ================================================================ */

const signatureFields = {
  signatureName: z.string({ error: 'Type your full legal name to sign' }).trim().min(2, 'Type your full legal name to sign').max(100),
  consent: z.literal(true, { error: 'You must agree to sign electronically' }),
}

type Offer = Pick<IRenewalOffer, 'proposedRent' | 'proposedEndDate'>

/** The agreement as it will read once renewed: the next version of the same lease. */
function renewedTerms(agreement: IAgreement, offer: Offer) {
  return {
    _id: agreement._id,
    version: (agreement.version ?? 1) + 1,
    propertyId: agreement.propertyId,
    landlordId: agreement.landlordId,
    tenantId: agreement.tenantId,
    startDate: agreement.startDate,
    endDate: offer.proposedEndDate,
    rentAmount: offer.proposedRent,
    securityDeposit: agreement.securityDeposit,
    advanceMonths: agreement.advanceMonths,
    terms: agreement.terms,
    specialConditions: agreement.specialConditions,
  }
}

function violations(agreement: IAgreement, offer: Offer) {
  return checkAgreementCompliance(renewedTerms(agreement, offer)).filter((f) => f.type === 'violation')
}

/** Counterparties see each other's signature, not the IP address or device it came from. */
function offerView<T extends { _id: unknown; termsHash?: string; landlordEvidence?: { userId?: string }; tenantEvidence?: { userId?: string } }>(offer: T, viewerId: string, termsHash?: string) {
  const [landlordEvidence] = evidenceForViewer(offer.landlordEvidence ? [offer.landlordEvidence] : [], viewerId, false)
  const [tenantEvidence] = evidenceForViewer(offer.tenantEvidence ? [offer.tenantEvidence] : [], viewerId, false)
  return {
    ...offer,
    id: String(offer._id),
    termsHash: offer.termsHash ?? termsHash,
    landlordEvidence,
    tenantEvidence,
    signatureConsentStatement: SIGNATURE_CONSENT_STATEMENT,
  }
}

// POST /api/renewals/agreement/:agreementId — landlord creates and signs the offer
router.post('/agreement/:agreementId', authenticate, requireRole('landlord', 'property_manager'), async (req, res) => {
  const parsed = z.object({
    proposedRent: z.number().positive(),
    proposedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'proposedEndDate must be a date (YYYY-MM-DD)'),
    message: z.string().max(300).optional(),
    ...signatureFields,
  }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const agreement = await Agreement.findById(param(req.params.agreementId))
  if (!agreement || agreement.landlordId !== req.user!.userId) { error(res, 'Agreement not found', 404); return }
  if (agreement.status !== 'active') { error(res, 'Only active agreements can be renewed', 409); return }
  if (!(Date.parse(parsed.data.proposedEndDate) > Date.parse(agreement.endDate))) {
    error(res, 'A renewal must end after the current end date'); return
  }

  // One open offer per agreement — a second offer would confuse the tenant.
  const existing = await RenewalOffer.findOne({ agreementId: agreement._id.toString(), status: 'pending' })
  if (existing) { error(res, 'There is already a pending renewal offer for this agreement', 409); return }

  const terms = { proposedRent: round2(parsed.data.proposedRent), proposedEndDate: parsed.data.proposedEndDate }
  const illegal = violations(agreement, terms)
  if (illegal.length) { error(res, `Renewal cannot be offered: ${illegal.map((f) => f.message).join(' ')}`); return }
  const termsHash = agreementTermsHash(renewedTerms(agreement, terms))

  const offer = await RenewalOffer.create({
    ...terms,
    message: parsed.data.message,
    agreementId: agreement._id.toString(),
    landlordId: req.user!.userId,
    tenantId: agreement.tenantId,
    agreementVersion: agreement.version,
    termsHash,
    landlordEvidence: signatureEvidence(req, { role: 'landlord', userId: req.user!.userId, signatureName: parsed.data.signatureName }, { termsHash, agreementVersion: agreement.version + 1 }),
  })

  agreement.renewalStatus = 'pending'
  await agreement.save()

  notify({
    userId: agreement.tenantId,
    title: 'Renewal Offer',
    message: `Your landlord offered to renew your agreement at GHS ${terms.proposedRent.toFixed(2)}/month until ${terms.proposedEndDate}. Review and sign to accept.`,
    actionUrl: `/agreements/${agreement._id.toString()}`,
  }).catch((err) => logger.warn('[Renewals] notify failed:', err))

  success(res, offerView(offer.toObject(), req.user!.userId), 'Renewal offer signed and sent', 201)
})

// GET /api/renewals?role=landlord|tenant — my offers
router.get('/', authenticate, async (req, res) => {
  const asLandlord = req.query.role === 'landlord'
  const filter: Record<string, unknown> = asLandlord ? { landlordId: req.user!.userId } : { tenantId: req.user!.userId }
  if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status

  const offers = await RenewalOffer.find(filter).sort({ createdAt: -1 }).limit(100).lean()
  // Offers made before signed renewals carry no fingerprint: derive it from the lease as it stands.
  const legacy = offers.filter((o) => o.status === 'pending' && !o.termsHash)
  const agreements = legacy.length ? await Agreement.find({ _id: { $in: legacy.map((o) => o.agreementId) } }) : []
  const hashFor = (o: (typeof offers)[number]) => {
    const agreement = agreements.find((a) => a._id.toString() === o.agreementId)
    return agreement ? agreementTermsHash(renewedTerms(agreement, o)) : undefined
  }
  success(res, { items: offers.map((o) => offerView(o, req.user!.userId, o.termsHash ? undefined : hashFor(o))) })
})

// POST /api/renewals/:id/respond — tenant signs to accept, or declines
router.post('/:id/respond', authenticate, requireRole('tenant'), async (req, res) => {
  const parsed = z.object({ accept: z.boolean() }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const offer = await RenewalOffer.findById(param(req.params.id))
  if (!offer || offer.tenantId !== req.user!.userId) { error(res, 'Offer not found', 404); return }
  if (offer.status !== 'pending') { error(res, `Offer already ${offer.status}`, 409); return }

  const agreement = await Agreement.findById(offer.agreementId)
  if (!agreement) { error(res, 'Agreement not found', 404); return }

  if (!parsed.data.accept) {
    const declined = await RenewalOffer.findOneAndUpdate({ _id: offer._id, status: 'pending' }, { $set: { status: 'declined', respondedAt: new Date() } }, { returnDocument: 'after' }).lean()
    if (!declined) { error(res, 'Offer already answered', 409); return }
    agreement.renewalStatus = 'tenant_declined'
    agreement.renewalDeclinedBy = req.user!.userId
    agreement.renewalDeclinedAt = new Date()
    await agreement.save()
    notify({ userId: offer.landlordId, title: 'Renewal Declined', message: 'Your tenant declined the renewal offer.', actionUrl: '/agreements' })
      .catch((err) => logger.warn('[Renewals] notify failed:', err))
    success(res, offerView(declined, req.user!.userId), 'Renewal declined')
    return
  }

  const signed = z.object({
    termsHash: z.string().regex(/^[a-f0-9]{64}$/i, 'termsHash is required — reload the offer and sign again'),
    ...signatureFields,
  }).safeParse(req.body)
  if (!signed.success) { error(res, signed.error.issues[0].message); return }

  const stale = agreement.status !== 'active' || (offer.agreementVersion !== undefined && offer.agreementVersion !== agreement.version)
  if (stale) { error(res, 'This agreement changed after the offer was made. Ask your landlord to send a new offer.', 409); return }
  const illegal = violations(agreement, offer)
  if (illegal.length) { error(res, `Renewal cannot be accepted: ${illegal.map((f) => f.message).join(' ')}`); return }

  // The signature must cover exactly the renewed terms the tenant reviewed.
  const termsHash = agreementTermsHash(renewedTerms(agreement, offer))
  if ((offer.termsHash && offer.termsHash !== termsHash) || signed.data.termsHash.toLowerCase() !== termsHash) {
    error(res, 'This offer changed after you opened it. Review the latest terms and sign again.', 409); return
  }

  const version = agreement.version + 1
  const tenantEvidence = signatureEvidence(req, { role: 'tenant', userId: req.user!.userId, signatureName: signed.data.signatureName }, { termsHash, agreementVersion: version })
  const landlordEvidence = offer.toObject().landlordEvidence
  const renewed = { endDate: offer.proposedEndDate, rentAmount: offer.proposedRent }
  // Atomic on the version the tenant signed: a concurrent edit, termination or
  // second acceptance cannot land these terms twice or on a different lease.
  const applied = await Agreement.findOneAndUpdate(
    { _id: agreement._id, version: agreement.version, status: 'active' },
    {
      $set: {
        ...renewed,
        version,
        renewalStatus: 'renewed',
        complianceFlags: checkAgreementCompliance({ ...agreement.toObject(), ...renewed }),
        tenantSignature: tenantEvidence.signedAt.toISOString(),
        tenantSignatureName: tenantEvidence.signatureName,
        ...(landlordEvidence ? { landlordSignature: new Date(landlordEvidence.signedAt).toISOString(), landlordSignatureName: landlordEvidence.signatureName } : {}),
      },
      $push: { signatureEvidence: { $each: landlordEvidence ? [landlordEvidence, tenantEvidence] : [tenantEvidence] } },
    },
    { returnDocument: 'after' },
  )
  if (!applied) { error(res, 'This agreement changed while you were signing. Review the latest version and sign again.', 409); return }

  const accepted = await RenewalOffer.findOneAndUpdate(
    { _id: offer._id, status: 'pending' },
    { $set: { status: 'accepted', respondedAt: tenantEvidence.signedAt, tenantEvidence } },
    { returnDocument: 'after' },
  ).lean()

  notify({
    userId: offer.landlordId,
    title: 'Renewal Accepted',
    message: `Your tenant signed the renewal — the agreement now runs until ${offer.proposedEndDate}.`,
    actionUrl: `/agreements/${agreement._id.toString()}`,
  }).catch((err) => logger.warn('[Renewals] notify failed:', err))

  success(res, offerView(accepted ?? { ...offer.toObject(), status: 'accepted', tenantEvidence }, req.user!.userId), 'Renewal signed — agreement updated')
})

export default router
