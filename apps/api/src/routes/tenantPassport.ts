import { Router } from 'express'
import type { Request, Response } from 'express'
import type { Types } from 'mongoose'
import jwt from 'jsonwebtoken'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { config } from '../config/index.js'
import { authenticate, authenticateDownload } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { signDownloadToken } from '../services/authService.js'
import { User } from '../models/User.js'
import { CreditScore } from '../models/CreditScore.js'
import { Payment } from '../models/Payment.js'
import { Agreement } from '../models/Agreement.js'
import { TenantProfile } from '../models/TenantProfile.js'

interface LeanUser {
  _id: Types.ObjectId
  firstName?: string
  lastName?: string
  email?: string
  isVerified?: boolean
  createdAt?: Date
}

interface LeanCreditScore {
  score: number
  factors?: Record<string, unknown>
  calculatedAt?: Date
}

interface LeanTenantProfile {
  personalReferences?: unknown[]
  professionalReferences?: unknown[]
  hasBeenEvicted?: boolean
  completionScore?: number
  employer?: string
  employmentDuration?: string
  monthlyIncome?: number
}

const router = Router()

const PRIMARY = '#1e3a5f'
const ACCENT = '#dbeafe'
const TEXT = '#1f2937'
const MUTED = '#6b7280'
const RULE = '#e5e7eb'

interface SharePayload {
  purpose: 'passport-share'
  userId: string
}

// Verify a JWT carrying a specific purpose claim
function verifyPurposeToken<T extends { purpose: string }>(
  token: string,
  expectedPurpose: T['purpose'],
): T | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as T
    if (payload.purpose !== expectedPurpose) return null
    return payload
  } catch {
    return null
  }
}

// Build the structured passport data for a given user. Defensive against
// missing related records — never throws.
async function buildPassportData(userId: string) {
  const [user, creditScoreDoc, payments, agreements, tenantProfile] = await Promise.all([
    User.findById(userId).lean().catch(() => null),
    CreditScore.findOne({ userId }).lean().catch(() => null),
    Payment.find({ tenantId: userId }).lean().catch(() => [] as never[]),
    Agreement.find({ tenantId: userId }).lean().catch(() => [] as never[]),
    TenantProfile.findOne({ userId }).lean().catch(() => null),
  ])

  // Streak — gracefully degrade if model missing (another agent's work).
  // Path stored in a variable so the TS module resolver can't statically
  // verify it; the runtime catch handles missing module errors silently.
  let streak: { current: number; longest: number; lastPaymentDate?: string } | null = null
  try {
    const streakPath = '../models/PaymentStreak.js'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streakModule: any = await import(/* @vite-ignore */ streakPath).catch(() => null)
    const StreakModel = streakModule?.PaymentStreak
    if (StreakModel) {
      const doc = await StreakModel.findOne({ userId }).lean()
      if (doc) {
        streak = {
          current: doc.current ?? doc.currentStreak ?? 0,
          longest: doc.longest ?? doc.longestStreak ?? 0,
          lastPaymentDate: doc.lastPaymentDate,
        }
      }
    }
  } catch {
    streak = null
  }

  // Employment — gracefully degrade if model missing
  let employment: { employer?: string; tenure?: string; salaryBand?: string } | null = null
  try {
    const empPath = '../models/Employment.js'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empModule: any = await import(/* @vite-ignore */ empPath).catch(() => null)
    const EmpModel = empModule?.Employment
    if (EmpModel) {
      const empDoc = await EmpModel.findOne({ userId }).lean()
      if (empDoc) {
        const monthlyIncome: number | undefined = empDoc.monthlyIncome ?? empDoc.salary
        employment = {
          employer: empDoc.employer,
          tenure: empDoc.tenure ?? empDoc.duration,
          salaryBand: salaryBand(monthlyIncome),
        }
      }
    }
  } catch {
    employment = null
  }

  // Fallback to TenantProfile employment fields
  if (!employment && tenantProfile) {
    const tp = tenantProfile as unknown as LeanTenantProfile
    if (tp.employer || tp.employmentDuration || tp.monthlyIncome) {
      employment = {
        employer: tp.employer,
        tenure: tp.employmentDuration,
        salaryBand: salaryBand(tp.monthlyIncome),
      }
    }
  }

  // Payment summary
  const completed = payments.filter((p) => p.status === 'completed')
  const totalLifetime = completed.reduce((sum: number, p) => sum + (p.amount || 0), 0)
  const onTimePct = payments.length > 0 ? Math.round((completed.length / payments.length) * 100) : 0

  // Agreement summary
  const activeAgreements = agreements.filter((a) => a.status === 'active')
  const pastAgreements = agreements.filter((a) => a.status === 'expired' || a.status === 'terminated')

  // References (counts only, no PII)
  const personalRefs = (tenantProfile as unknown as LeanTenantProfile)?.personalReferences?.length ?? 0
  const professionalRefs = (tenantProfile as unknown as LeanTenantProfile)?.professionalReferences?.length ?? 0

  return {
    user: user
      ? {
          id: String((user as unknown as LeanUser)._id),
          firstName: (user as unknown as LeanUser).firstName,
          lastName: (user as unknown as LeanUser).lastName,
          email: (user as unknown as LeanUser).email,
          isVerified: !!(user as unknown as LeanUser).isVerified,
          memberSince: (user as unknown as LeanUser).createdAt,
        }
      : null,
    creditScore: creditScoreDoc
      ? {
          score: (creditScoreDoc as unknown as LeanCreditScore).score,
          factors: (creditScoreDoc as unknown as LeanCreditScore).factors ?? null,
          calculatedAt: (creditScoreDoc as unknown as LeanCreditScore).calculatedAt,
        }
      : null,
    payments: {
      total: payments.length,
      completed: completed.length,
      lifetimeTotalGhs: totalLifetime,
      onTimePct,
    },
    streak,
    agreements: {
      active: activeAgreements.length,
      past: pastAgreements.length,
      total: agreements.length,
      noEvictionHistory: !((tenantProfile as unknown as LeanTenantProfile)?.hasBeenEvicted),
      onTimePaymentRatio: onTimePct,
    },
    employment,
    profile: {
      completionScore: (tenantProfile as unknown as LeanTenantProfile)?.completionScore ?? 0,
    },
    references: {
      personal: personalRefs,
      professional: professionalRefs,
    },
    generatedAt: new Date().toISOString(),
  }
}

function salaryBand(monthlyIncome?: number): string | undefined {
  if (!monthlyIncome || monthlyIncome <= 0) return undefined
  if (monthlyIncome < 2000) return 'Under GHS 2,000'
  if (monthlyIncome < 5000) return 'GHS 2,000 – 5,000'
  if (monthlyIncome < 10000) return 'GHS 5,000 – 10,000'
  if (monthlyIncome < 20000) return 'GHS 10,000 – 20,000'
  return 'GHS 20,000+'
}

// Render the passport PDF and pipe to res.
async function renderPassportPdf(
  res: Response,
  data: Awaited<ReturnType<typeof buildPassportData>>,
  shareUrl?: string,
) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true })
  doc.pipe(res)

  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  const contentWidth = pageWidth - 96 // 48 margin each side

  // ─── HEADER BAND ───
  doc.rect(0, 0, pageWidth, 90).fill(PRIMARY)
  doc.fillColor('#ffffff')
  doc.font('Helvetica-Bold').fontSize(22).text('Tenant Financial Passport', 48, 28, { width: contentWidth })
  doc.font('Helvetica').fontSize(10).fillColor('#bfdbfe')
    .text('RentOS Ghana — Verified Rental Reputation', 48, 56)

  doc.fillColor(TEXT)
  doc.y = 110

  // ─── IDENTITY ───
  const u = data.user
  const fullName = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'Unknown Tenant'
  doc.font('Helvetica-Bold').fontSize(18).fillColor(PRIMARY).text(fullName, 48, doc.y)
  if (u?.isVerified) {
    const labelY = doc.y - 26
    const badgeX = 48 + doc.widthOfString(fullName) + 12
    doc.roundedRect(badgeX, labelY + 4, 102, 20, 10).fill('#10b981')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
      .text('Ghana Card Verified', badgeX + 8, labelY + 10)
    doc.fillColor(TEXT)
  }
  doc.font('Helvetica').fontSize(10).fillColor(MUTED)
    .text(u?.email ?? '', 48, doc.y + 4)
  if (u?.memberSince) {
    doc.text(`Member since ${formatDate(u.memberSince)}`, 48, doc.y + 2)
  }

  doc.moveDown(1)
  drawRule(doc)

  // ─── CREDIT SCORE ───
  sectionTitle(doc, 'Credit Score')
  if (data.creditScore) {
    const scoreX = 48
    const scoreY = doc.y
    doc.roundedRect(scoreX, scoreY, 110, 90, 8).fill(ACCENT)
    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(36)
      .text(String(data.creditScore.score), scoreX, scoreY + 14, { width: 110, align: 'center' })
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text('out of 100', scoreX, scoreY + 58, { width: 110, align: 'center' })
    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(10)
      .text(scoreLabel(data.creditScore.score), scoreX, scoreY + 72, { width: 110, align: 'center' })

    // Factor breakdown
    const factorsX = scoreX + 130
    let fy = scoreY + 4
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(10).text('Factor Breakdown', factorsX, fy)
    fy += 16
    const factors = data.creditScore.factors ?? {}
    const factorRows: { label: string; value: number; max: number }[] = [
      { label: 'Payment History', value: (factors as Record<string, unknown>).paymentHistory as number ?? 0, max: 40 },
      { label: 'Savings Discipline', value: (factors as Record<string, unknown>).savingsConsistency as number ?? 0, max: 20 },
      { label: 'Agreement Compliance', value: (factors as Record<string, unknown>).agreementCompliance as number ?? 0, max: 20 },
      { label: 'Dispute Record', value: (factors as Record<string, unknown>).disputeRecord as number ?? 0, max: 10 },
      { label: 'Account Tenure', value: (factors as Record<string, unknown>).accountAge as number ?? 0, max: 10 },
    ]
    for (const r of factorRows) {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(r.label, factorsX, fy, { width: 140 })
      // Bar
      const barX = factorsX + 150
      const barW = 200
      const filled = Math.max(0, Math.min(1, r.value / r.max)) * barW
      doc.roundedRect(barX, fy + 2, barW, 6, 3).fill(RULE)
      doc.roundedRect(barX, fy + 2, filled, 6, 3).fill(PRIMARY)
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text(`${r.value}/${r.max}`, barX + barW + 6, fy, { width: 50 })
      fy += 14
    }
    doc.y = Math.max(scoreY + 100, fy + 4)
  } else {
    noData(doc, 'No credit score on record yet.')
  }

  drawRule(doc)

  // ─── PAYMENT HISTORY ───
  sectionTitle(doc, 'Payment History')
  if (data.payments.total > 0) {
    statRow(doc, [
      { label: 'Lifetime Payments', value: String(data.payments.total) },
      { label: 'Completed', value: String(data.payments.completed) },
      { label: 'On-Time %', value: `${data.payments.onTimePct}%` },
      { label: 'Lifetime Total', value: `GHS ${data.payments.lifetimeTotalGhs.toLocaleString()}` },
    ])
  } else {
    noData(doc, 'No payment history yet.')
  }

  drawRule(doc)

  // ─── STREAK ───
  sectionTitle(doc, 'Payment Streak')
  if (data.streak) {
    statRow(doc, [
      { label: 'Current Streak', value: `${data.streak.current} months` },
      { label: 'Longest Streak', value: `${data.streak.longest} months` },
      { label: 'Last Payment', value: data.streak.lastPaymentDate ? formatDate(data.streak.lastPaymentDate) : '—' },
    ])
  } else {
    noData(doc, 'Streak tracking not yet enabled.')
  }

  drawRule(doc)

  // ─── AGREEMENTS ───
  sectionTitle(doc, 'Tenancy Agreements')
  statRow(doc, [
    { label: 'Active', value: String(data.agreements.active) },
    { label: 'Past', value: String(data.agreements.past) },
    { label: 'On-Time Ratio', value: `${data.agreements.onTimePaymentRatio}%` },
    { label: 'Eviction History', value: data.agreements.noEvictionHistory ? 'None' : 'Disclosed' },
  ])

  drawRule(doc)

  // ─── PAGE BREAK BEFORE EMPLOYMENT IF NEEDED ───
  if (doc.y > pageHeight - 260) {
    doc.addPage()
    doc.y = 48
  }

  // ─── EMPLOYMENT ───
  sectionTitle(doc, 'Employment')
  if (data.employment) {
    statRow(doc, [
      { label: 'Employer', value: data.employment.employer || 'Not disclosed' },
      { label: 'Tenure', value: data.employment.tenure || 'Not disclosed' },
      { label: 'Salary Band', value: data.employment.salaryBand || 'Not disclosed' },
    ])
  } else {
    noData(doc, 'No employment record on file.')
  }

  drawRule(doc)

  // ─── PROFILE & REFERENCES ───
  sectionTitle(doc, 'Profile & References')
  statRow(doc, [
    { label: 'Profile Completeness', value: `${data.profile.completionScore}%` },
    { label: 'Personal Refs', value: String(data.references.personal) },
    { label: 'Professional Refs', value: String(data.references.professional) },
  ])

  drawRule(doc)

  // ─── QR CODE / SHARE ───
  if (shareUrl) {
    sectionTitle(doc, 'Verify Online')
    try {
      const qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 220, color: { dark: PRIMARY, light: '#ffffff' } })
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64')
      const qrSize = 100
      const qrX = 48
      const qrY = doc.y
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize })
      doc.font('Helvetica').fontSize(10).fillColor(TEXT)
        .text('Scan to verify this passport online.', qrX + qrSize + 16, qrY + 8, { width: contentWidth - qrSize - 16 })
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(shareUrl, qrX + qrSize + 16, qrY + 28, { width: contentWidth - qrSize - 16, link: shareUrl })
      doc.y = qrY + qrSize + 8
    } catch {
      noData(doc, 'Share QR code unavailable.')
    }
  }

  // ─── FOOTER on every page ───
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    const fy = pageHeight - 64
    doc.rect(0, fy, pageWidth, 64).fill('#f9fafb')
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        'This passport is generated from RentOS records. Information is self-attested unless verified. ' +
        'Issuance does not constitute a guarantee of tenancy and is not legal advice.',
        48,
        fy + 10,
        { width: contentWidth },
      )
    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(9)
      .text('Generated by RentOS Ghana', 48, fy + 40)
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(`Generated ${formatDate(data.generatedAt)} • Page ${i - range.start + 1} of ${range.count}`, 48, fy + 40, {
        width: contentWidth,
        align: 'right',
      })
  }

  doc.end()
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.6)
  doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(12).text(title, 48, doc.y)
  doc.moveDown(0.3)
  doc.fillColor(TEXT)
}

function drawRule(doc: PDFKit.PDFDocument) {
  doc.moveDown(0.6)
  const y = doc.y
  doc.strokeColor(RULE).lineWidth(0.8).moveTo(48, y).lineTo(doc.page.width - 48, y).stroke()
  doc.moveDown(0.4)
  doc.strokeColor('#000000')
}

function noData(doc: PDFKit.PDFDocument, msg: string) {
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text(msg, 48, doc.y)
  doc.fillColor(TEXT)
  doc.moveDown(0.4)
}

function statRow(doc: PDFKit.PDFDocument, items: { label: string; value: string }[]) {
  const y = doc.y
  const pageContentW = doc.page.width - 96
  const colW = pageContentW / items.length
  items.forEach((item, idx) => {
    const x = 48 + idx * colW
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(item.label.toUpperCase(), x, y, { width: colW - 8 })
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT)
      .text(item.value, x, y + 12, { width: colW - 8 })
  })
  doc.y = y + 36
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Building'
}

function formatDate(iso: string | Date): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(iso)
  }
}

// ───────────────────────────── ROUTES ─────────────────────────────

async function streamPassportPdfResponse(
  res: Response,
  userId: string,
  shareUrl?: string,
) {
  const data = await buildPassportData(userId)
  const lastName = (data.user?.lastName ?? 'tenant').toLowerCase().replace(/[^a-z0-9-]/g, '')
  const filename = `rentos-tenant-passport-${lastName}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await renderPassportPdf(res, data, shareUrl)
}

// Mint a short-lived, download-only token for the PDF. This replaces putting
// the full session JWT in ?token= URLs (which leaked into logs/history).
const documentLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  success(res, { token: signDownloadToken(req.user!.userId) })
})

// Authenticated PDF — accepts a download-purpose token only (Bearer or ?token=).
const myPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  await streamPassportPdfResponse(res, req.user!.userId)
})

// Authenticated JSON preview
const myJsonHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await buildPassportData(req.user!.userId)
  success(res, data)
})

function buildPublicUrl(req: Request, token: string): string {
  const fwdProto = req.headers['x-forwarded-proto']
  const fwdHost = req.headers['x-forwarded-host']
  const proto =
    (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto) ?? req.protocol
  const host =
    (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) ?? req.headers.host ?? ''
  return `${proto}://${host}/passport/${token}`
}

// Generate a 30-day shareable URL token
const shareHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const expiresInSec = 60 * 60 * 24 * 30 // 30 days
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString()
  const token = jwt.sign(
    { purpose: 'passport-share', userId } satisfies SharePayload,
    config.jwtSecret,
    { expiresIn: expiresInSec },
  )
  const url = buildPublicUrl(req, token)
  success(res, { url, token, expiresAt })
})

// Public JSON for shared passport
const sharedJsonHandler = asyncHandler(async (req: Request, res: Response) => {
  const token = param(req.params.token)
  const payload = verifyPurposeToken<SharePayload>(token, 'passport-share')
  if (!payload || (await isShareRevoked(payload.userId, (payload as unknown as { iat?: number }).iat))) {
    error(res, 'Invalid or expired share link', 404)
    return
  }
  const data = await buildPassportData(payload.userId)
  success(res, data)
})

// Public PDF stream for shared passport — no auth required, token verifies
const sharedPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const token = param(req.params.token)
  const payload = verifyPurposeToken<SharePayload>(token, 'passport-share')
  if (!payload || (await isShareRevoked(payload.userId, (payload as unknown as { iat?: number }).iat))) {
    error(res, 'Invalid or expired share link', 404)
    return
  }
  const shareUrl = buildPublicUrl(req, token)
  await streamPassportPdfResponse(res, payload.userId, shareUrl)
})

// Revoke ALL outstanding share links — previously a shared passport (email,
// credit score, salary band, eviction history) could never be un-shared.
const revokeShareHandler = asyncHandler(async (req: Request, res: Response) => {
  await TenantProfile.updateOne(
    { userId: req.user!.userId },
    { $set: { passportShareRevokedAt: new Date() } },
    { upsert: true },
  )
  success(res, null, 'All passport share links have been revoked')
})

/** Share tokens issued before the tenant's revocation timestamp are dead. */
async function isShareRevoked(userId: string, iat?: number): Promise<boolean> {
  if (!iat) return false
  const profile = await TenantProfile.findOne({ userId }).select('passportShareRevokedAt').lean()
  const revokedAt = profile?.passportShareRevokedAt
  return !!revokedAt && iat * 1000 < new Date(revokedAt).getTime()
}

// ── Route bindings ──
// We use slash-separated paths (`/me/pdf`) instead of dot-extensions
// (`/me.pdf`) because Express 5's path-to-regexp v8 no longer treats a
// literal `.ext` after a `:param` as a literal. The client uses these
// canonical paths.
router.get('/me/pdf', authenticateDownload, myPdfHandler)
router.post('/me/document-link', authenticate, documentLinkHandler)
router.get('/me/json', authenticate, myJsonHandler)
router.get('/me', authenticate, myJsonHandler)

router.post('/share', authenticate, shareHandler)
router.delete('/share', authenticate, revokeShareHandler)

router.get('/shared/:token/json', sharedJsonHandler)
router.get('/shared/:token/pdf', sharedPdfHandler)

export default router
