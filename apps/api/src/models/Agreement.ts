import mongoose, { Schema, type Document } from 'mongoose'
import { checkAgreementCompliance } from '../services/legal/agreementCompliance.js'

/** One immutable record per signature — see services/agreementEvidence.ts. */
export interface ISignatureEvidence {
  role: 'landlord' | 'tenant'
  userId: string
  signatureName: string
  signedAt: Date
  ipAddress?: string
  userAgent?: string
  /** SHA-256 of canonicalAgreementTerms() for the version the signer saw. */
  termsHash: string
  agreementVersion: number
  consentStatement: string
  consentVersion: number
}

export interface IAgreement extends Document {
  propertyId: string
  landlordId: string
  tenantId: string
  status: string
  startDate: string
  endDate: string
  rentAmount: number
  securityDeposit: number
  advanceMonths: number
  terms: string[]
  specialConditions: string[]
  landlordSignature?: string
  tenantSignature?: string
  /** Typed legal names captured at signing time — the actual e-signature record. */
  landlordSignatureName?: string
  tenantSignatureName?: string
  /** Append-only: entries for superseded versions stay as history after an edit. */
  signatureEvidence: ISignatureEvidence[]
  complianceFlags: { type: string; message: string; clause?: string; law?: string }[]
  version: number
  // Renewal tracking
  renewalStatus: 'none' | 'landlord_declined' | 'tenant_declined' | 'pending' | 'renewed'
  renewalDeclinedBy?: string
  renewalDeclinedAt?: Date
  moverBusinessesNotifiedAt?: Date
  /** ISO timestamp of last lease-expiry reminder (idempotency for scheduler) */
  lastLeaseReminderAt?: string
}

const signatureEvidenceSchema = new Schema<ISignatureEvidence>({
  role: { type: String, enum: ['landlord', 'tenant'], required: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  signatureName: { type: String, required: true, immutable: true },
  signedAt: { type: Date, required: true, immutable: true },
  ipAddress: { type: String, immutable: true },
  userAgent: { type: String, immutable: true },
  termsHash: { type: String, required: true, immutable: true },
  agreementVersion: { type: Number, required: true, immutable: true },
  consentStatement: { type: String, required: true, immutable: true },
  consentVersion: { type: Number, required: true, immutable: true },
})

const agreementSchema = new Schema<IAgreement>({
  propertyId: { type: String, required: true, index: true },
  landlordId: { type: String, required: true, index: true },
  tenantId: { type: String, required: true, index: true },
  status: { type: String, required: true, enum: ['draft', 'pending_signatures', 'active', 'expired', 'terminated', 'disputed'], default: 'draft' },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  rentAmount: { type: Number, required: true },
  securityDeposit: { type: Number, default: 0 },
  advanceMonths: { type: Number, default: 0 },
  terms: [String],
  specialConditions: [String],
  landlordSignature: String,
  tenantSignature: String,
  landlordSignatureName: String,
  tenantSignatureName: String,
  signatureEvidence: { type: [signatureEvidenceSchema], default: [] },
  complianceFlags: [{
    type: { type: String },
    message: String,
    clause: String,
    law: String,
  }],
  version: { type: Number, default: 1 },
  // Renewal tracking
  renewalStatus: { type: String, enum: ['none', 'landlord_declined', 'tenant_declined', 'pending', 'renewed'], default: 'none' },
  renewalDeclinedBy: String,
  renewalDeclinedAt: Date,
  moverBusinessesNotifiedAt: Date,
  lastLeaseReminderAt: String,
}, { timestamps: true })

// Includes application-created drafts and other model-based creation paths.
agreementSchema.pre('validate', function () {
  this.complianceFlags = checkAgreementCompliance(this)
})

/*
 * Signature evidence is append-only. The sign flow adds entries with an
 * atomic $push; nothing may edit, reorder or remove one afterwards — not a
 * document save, not an update operator, not a wholesale replacement.
 */
const EVIDENCE_PATH = /^signatureEvidence(\.|$)/
agreementSchema.pre('save', function () {
  if (!this.isNew && this.isModified('signatureEvidence')) throw new Error('Signature evidence is append-only')
})
agreementSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  const update = this.getUpdate() as Record<string, unknown> | unknown[] | null
  if (!update) return
  if (Array.isArray(update)) {
    if (JSON.stringify(update).includes('signatureEvidence')) throw new Error('Signature evidence is append-only')
    return
  }
  for (const [op, value] of Object.entries(update)) {
    if (!op.startsWith('$')) {
      if (EVIDENCE_PATH.test(op)) throw new Error('Signature evidence is append-only')
    } else if (value && typeof value === 'object' && Object.keys(value).some((path) => EVIDENCE_PATH.test(path))) {
      const pushed = (value as Record<string, unknown>).signatureEvidence
      const plainAppend = op === '$push' && Object.keys(value).every((path) => path === 'signatureEvidence')
        && !(pushed && typeof pushed === 'object' && ('$position' in pushed || '$sort' in pushed || '$slice' in pushed))
      if (!plainAppend) throw new Error('Signature evidence is append-only')
    }
  }
})
agreementSchema.pre(['replaceOne', 'findOneAndReplace'], function () {
  throw new Error('Agreements cannot be replaced wholesale — signature evidence is append-only')
})

// Performance indexes
agreementSchema.index({ status: 1, endDate: 1 })
agreementSchema.index({ landlordId: 1, status: 1 })
agreementSchema.index({ tenantId: 1, status: 1 })

export const Agreement = mongoose.model<IAgreement>('Agreement', agreementSchema)
