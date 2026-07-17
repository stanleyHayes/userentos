import { Router, Request, Response } from 'express'
import { Types } from 'mongoose'
import QRCode from 'qrcode'
import { authenticate, authenticateDownload } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { agreementController } from '../controllers/agreementController.js'
import { Agreement } from '../models/Agreement.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { Payment } from '../models/Payment.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { signDownloadToken } from '../services/authService.js'
import { SimplePdfBuilder } from '../utils/simplePdf.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

function formatGhs(n: number): string {
  return `GHS ${(Number(n) || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateLong(iso?: string | Date | null): string {
  if (!iso) return '-'
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(iso)
  }
}

function buildPublicAgreementUrl(req: Request, agreementId: string): string {
  const fwdProto = req.headers['x-forwarded-proto']
  const fwdHost = req.headers['x-forwarded-host']
  const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto) ?? req.protocol
  const host = (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) ?? req.headers.host ?? ''
  return `${proto}://${host}/agreements/${agreementId}`
}

router.get('/', authenticate, asyncHandler(agreementController.list))

// GET /agreements/tenants — landlord's tenant list with full details
router.get('/tenants', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const roles = req.user!.roles
  if (!roles.includes('landlord') && !roles.includes('property_manager') && !roles.includes('admin') && !roles.includes('super_admin')) {
    error(res, 'Only landlords can view tenants', 403); return
  }

  const isAdmin = roles.includes('admin') || roles.includes('super_admin')
  const agreements = await Agreement.find(isAdmin ? {} : { landlordId: userId }).sort({ createdAt: -1 }).lean()
  if (agreements.length === 0) { success(res, { items: [] }); return }

  // Collect IDs
  const tenantIds = [...new Set(agreements.map((a) => a.tenantId))]
  const propertyIds = [...new Set(agreements.map((a) => a.propertyId))]

  // Batch fetch users, properties, payments
  const [tenants, properties, payments] = await Promise.all([
    User.find({ _id: { $in: tenantIds } }).select('firstName lastName email phone profileImage isVerified').lean(),
    Property.find({ _id: { $in: propertyIds } }).select('title address type').lean(),
    Payment.find({ agreementId: { $in: agreements.map((a) => (a._id as Types.ObjectId).toString()) }, status: 'completed' }).lean(),
  ])

  const tenantMap = new Map(tenants.map((t) => [(t._id as Types.ObjectId).toString(), t]))
  const propertyMap = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p]))

  // Group payments by agreement
  const paymentsByAgreement = new Map<string, typeof payments>()
  for (const p of payments) {
    const key = p.agreementId
    if (!key) continue // non-rent payments (wallet deposits, subscriptions)
    if (!paymentsByAgreement.has(key)) paymentsByAgreement.set(key, [])
    paymentsByAgreement.get(key)!.push(p)
  }

  // Build tenant items grouped by tenant
  const tenantDataMap = new Map<string, { id: string; firstName?: string; lastName?: string; email?: string; phone?: string; profileImage?: string; isVerified?: boolean; agreements: Record<string, unknown>[] }>()
  for (const a of agreements) {
    const tenant = tenantMap.get(a.tenantId)
    if (!tenant) continue
    const property = propertyMap.get(a.propertyId)
    const agreementPayments = paymentsByAgreement.get((a._id as Types.ObjectId).toString()) ?? []
    const totalPaid = agreementPayments.reduce((sum, p) => sum + p.amount, 0)

    const agreement = {
      id: (a._id as Types.ObjectId).toString(),
      status: a.status,
      rentAmount: a.rentAmount,
      startDate: a.startDate,
      endDate: a.endDate,
      propertyId: a.propertyId,
      propertyTitle: property?.title ?? 'Unknown',
      propertyAddress: property?.address,
      propertyType: property?.type,
      totalPaid,
      paymentCount: agreementPayments.length,
      lastPaymentDate: agreementPayments.length > 0
        ? agreementPayments.sort((x, y) => new Date(y.paidAt ?? '').getTime() - new Date(x.paidAt ?? '').getTime())[0].paidAt ?? null
        : null,
    }

    if (tenantDataMap.has(a.tenantId)) {
      tenantDataMap.get(a.tenantId)!.agreements.push(agreement)
    } else {
      tenantDataMap.set(a.tenantId, {
        id: a.tenantId,
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        email: tenant.email,
        phone: (tenant as { phone?: string }).phone,
        profileImage: (tenant as { profileImage?: string }).profileImage,
        isVerified: (tenant as { isVerified?: boolean }).isVerified,
        agreements: [agreement],
      })
    }
  }

  const items = [...tenantDataMap.values()]
  success(res, { items, total: items.length })
}))

// POST /agreements/:id/document-link — mint a short-lived, single-purpose
// download token for the PDF. The token is only valid for document downloads
// (5 min), so a leaked URL never grants account access.
router.post('/:id/document-link', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const agreement = await Agreement.findById(param(req.params.id)).select('tenantId landlordId').lean()
  if (!agreement) { error(res, 'Agreement not found', 404); return }
  const userId = req.user!.userId
  if (agreement.tenantId !== userId && agreement.landlordId !== userId) {
    error(res, 'Not a party to this agreement', 403); return
  }
  success(res, { token: signDownloadToken(userId) })
}))

// GET /agreements/:id/document.pdf — downloadable signed Rental Agreement PDF
// Auth: short-lived download-purpose token only (Bearer header OR ?token=).
router.get('/:id/document.pdf', authenticateDownload, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId

  const id = param(req.params.id)
  const agreement = await Agreement.findById(id).lean()
  if (!agreement) { error(res, 'Agreement not found', 404); return }
  const agId = (agreement._id as Types.ObjectId).toString()

  if (agreement.tenantId !== userId && agreement.landlordId !== userId) {
    error(res, 'Not a party to this agreement', 403); return
  }

  const [tenant, landlord, property, tenantProfile] = await Promise.all([
    User.findById(agreement.tenantId).select('firstName lastName email').lean(),
    User.findById(agreement.landlordId).select('firstName lastName email').lean(),
    Property.findById(agreement.propertyId).select('title address').lean(),
    TenantProfile.findOne({ userId: agreement.tenantId }).select('idType idNumber idVerified').lean(),
  ])

  const tenantName = tenant ? `${tenant.firstName ?? ''} ${tenant.lastName ?? ''}`.trim() : 'Unknown Tenant'
  const landlordName = landlord ? `${landlord.firstName ?? ''} ${landlord.lastName ?? ''}`.trim() : 'Unknown Landlord'
  const tenantEmail = tenant?.email ?? '-'
  const propertyTitle = property?.title ?? 'Unknown property'
  const addr = property?.address as { street?: string; city?: string; region?: string; digitalAddress?: string; neighborhood?: string } | undefined
  const propertyAddress = addr
    ? [addr.street, addr.neighborhood, addr.city, addr.region, addr.digitalAddress].filter(Boolean).join(', ')
    : '-'

  const tpAny = tenantProfile as { idType?: string; idNumber?: string; idVerified?: boolean } | null
  const isGhanaCard = (tpAny?.idType ?? '').toLowerCase().includes('ghana')
  const ghanaCardStatus = tpAny?.idVerified && isGhanaCard
    ? `Verified (${(tpAny?.idNumber ?? '').slice(-4).padStart(8, '*')})`
    : tpAny?.idNumber && isGhanaCard
      ? 'On file (not verified)'
      : tpAny?.idType
        ? `${tpAny.idType} on file`
        : 'Not provided'

  const pdf = new SimplePdfBuilder()

  // ─── Header ───
  pdf.heading('Rental Agreement', 1)
  pdf.text('RentOS Ghana — Verified Tenancy Document', { size: 10 })
  pdf.kv('Agreement ID', agId)
  pdf.kv('Generated', formatDateLong(new Date()))
  pdf.hr()

  // ─── Parties ───
  pdf.heading('Parties', 2)
  pdf.kv('Tenant', tenantName)
  pdf.kv('Tenant email', tenantEmail)
  pdf.kv('Tenant Ghana Card', ghanaCardStatus)
  pdf.kv('Landlord', landlordName)
  pdf.kv('Property', propertyTitle)
  pdf.kv('Property address', propertyAddress)
  pdf.hr()

  // ─── Terms ───
  pdf.heading('Terms', 2)
  pdf.kv('Monthly rent', formatGhs(agreement.rentAmount))
  pdf.kv('Security deposit', formatGhs(agreement.securityDeposit))
  pdf.kv('Advance months paid', String(agreement.advanceMonths ?? 0))
  pdf.kv('Start date', formatDateLong(agreement.startDate))
  pdf.kv('End date', formatDateLong(agreement.endDate))
  if (agreement.specialConditions?.length) {
    pdf.moveDown(2)
    pdf.text('Special conditions:', { font: 'Helvetica-Bold', size: 11 })
    agreement.specialConditions.forEach((c, i) => {
      pdf.text(`  ${i + 1}. ${c}`, { size: 10 })
    })
  }
  if (agreement.terms?.length) {
    pdf.moveDown(2)
    pdf.text('Terms & conditions:', { font: 'Helvetica-Bold', size: 11 })
    agreement.terms.forEach((t, i) => {
      pdf.text(`  ${i + 1}. ${t}`, { size: 10 })
    })
  }
  pdf.hr()

  // ─── Compliance ───
  pdf.heading('Compliance', 2)
  if (!agreement.complianceFlags?.length) {
    pdf.text('No compliance flags. This agreement passed all automated checks.', { size: 10 })
  } else {
    for (const flag of agreement.complianceFlags) {
      pdf.text(`• [${flag.type}] ${flag.message}`, { size: 10, font: 'Helvetica-Bold' })
      if (flag.law) pdf.text(`    Reference: ${flag.law}`, { size: 9 })
      if (flag.clause) pdf.text(`    Clause: ${flag.clause}`, { size: 9 })
    }
  }
  pdf.hr()

  // ─── Signatures ───
  pdf.heading('Signatures', 2)
  const tenantSigDate = agreement.tenantSignature ?? (agreement as { updatedAt?: string | Date }).updatedAt
  const landlordSigDate = agreement.landlordSignature ?? (agreement as { updatedAt?: string | Date }).updatedAt
  const tenantSig = agreement.tenantSignature
    ? `${agreement.tenantSignatureName ?? tenantName} — ${formatDateLong(tenantSigDate)}`
    : 'Pending'
  const landlordSig = agreement.landlordSignature
    ? `${agreement.landlordSignatureName ?? landlordName} — ${formatDateLong(landlordSigDate)}`
    : 'Pending'
  pdf.kv('Signed by tenant', tenantSig)
  pdf.kv('Signed by landlord', landlordSig)
  pdf.hr()

  // ─── Renewal status footer ───
  pdf.heading('Renewal Status', 2)
  const renewalLabel = (agreement.renewalStatus ?? 'none').replace(/_/g, ' ')
  pdf.kv('Status', renewalLabel)
  if (agreement.renewalDeclinedAt) {
    pdf.kv('Declined on', formatDateLong(agreement.renewalDeclinedAt))
  }
  pdf.hr()

  // ─── QR + verify URL ───
  pdf.heading('Verify Online', 2)
  const verifyUrl = buildPublicAgreementUrl(req, agId)
  try {
    const qr = QRCode.create(verifyUrl, { errorCorrectionLevel: 'M' })
    const size = qr.modules.size
    const grid: boolean[][] = []
    for (let r = 0; r < size; r++) {
      const row: boolean[] = []
      for (let c = 0; c < size; c++) {
        // qrcode v1 stores modules as a Uint8Array indexed by row * size + col.
        // 1 = dark module, 0 = light.
        row.push(Boolean((qr.modules.data as Uint8Array)[r * size + c]))
      }
      grid.push(row)
    }
    pdf.qr(grid, 110)
  } catch {
    pdf.text('(QR unavailable)', { size: 9 })
  }
  pdf.text(verifyUrl, { size: 9 })
  pdf.moveDown(4)
  pdf.text('This document is generated from RentOS records and is provided for the parties on this agreement only.', { size: 8 })

  const buffer = pdf.build()
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="rental-agreement-${agId.slice(-8)}.pdf"`)
  res.setHeader('Content-Length', String(buffer.length))
  res.end(buffer)
}))

router.get('/:id', authenticate, asyncHandler(agreementController.getById))
router.post('/', authenticate, asyncHandler(agreementController.create))
router.post('/:id/sign', authenticate, asyncHandler(agreementController.sign))
router.patch('/:id', authenticate, asyncHandler(agreementController.update))

// POST /agreements/:id/decline-renewal — tenant or landlord indicates non-renewal
router.post('/:id/decline-renewal', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const agreement = await Agreement.findById(param(req.params.id))
  if (!agreement) { error(res, 'Agreement not found', 404); return }

  const userId = req.user!.userId
  if (userId !== agreement.tenantId && userId !== agreement.landlordId) {
    error(res, 'Not a party to this agreement', 403); return
  }
  if (agreement.status !== 'active') {
    error(res, 'Can only decline renewal on active agreements'); return
  }
  if (agreement.renewalStatus === 'tenant_declined' || agreement.renewalStatus === 'landlord_declined') {
    error(res, 'Renewal has already been declined'); return
  }

  const isTenant = userId === agreement.tenantId
  agreement.renewalStatus = isTenant ? 'tenant_declined' : 'landlord_declined'
  agreement.renewalDeclinedBy = userId
  agreement.renewalDeclinedAt = new Date()
  await agreement.save()

  // Notify the other party
  const { notify } = await import('../services/notify.js')
  const otherPartyId = isTenant ? agreement.landlordId : agreement.tenantId
  const decliner = await User.findById(userId).select('firstName lastName').lean()
  const declinerName = decliner ? `${decliner.firstName} ${decliner.lastName}` : 'A party'
  const property = await Property.findById(agreement.propertyId).select('title').lean()

  notify({
    userId: otherPartyId,
    title: 'Renewal Declined',
    message: `${declinerName} has indicated they will not be renewing the lease for "${property?.title ?? 'a property'}".`,
    actionUrl: '/agreements',
  })

  success(res, { ...agreement.toObject(), id: agreement._id.toString() }, 'Renewal declined')
}))

export default router
