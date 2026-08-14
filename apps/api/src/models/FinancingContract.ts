import mongoose, { Schema, type Document } from 'mongoose'

export interface IRepaymentScheduleItem {
  installmentNumber: number
  dueDate: string
  principal: number
  interest: number
  amountDue: number
  amountPaid: number
  status: 'scheduled' | 'paid' | 'partial' | 'overdue' | 'waived'
  paidAt?: string
}

export interface IFinancingContract extends Document {
  applicationId: string
  financierId: string
  applicantId: string
  applicantName?: string
  agreementId?: string
  landlordId?: string
  productType: 'rent_advance' | 'deposit_loan' | 'rent_to_own'
  principal: number
  annualInterestRate: number
  tenureMonths: number
  processingFee: number
  monthlyPayment: number
  totalRepayable: number
  amountRepaid: number
  status: 'pending_disbursement' | 'active' | 'in_grace' | 'in_arrears' | 'closed' | 'defaulted' | 'settled'
  disbursedAt?: string
  disbursementReference?: string
  schedule: IRepaymentScheduleItem[]
  payrollDeductionMandateId?: string
  signedByApplicant: boolean
  signedByFinancier: boolean
  signedAt?: string
  notes?: { text: string; by: string; at: string }[]
  lastReminderAt?: string
  lastArrearsCheckAt?: string
  lastContactAt?: string
}

const scheduleItemSchema = new Schema<IRepaymentScheduleItem>({
  installmentNumber: { type: Number, required: true },
  dueDate: { type: String, required: true },
  principal: { type: Number, required: true },
  interest: { type: Number, required: true },
  amountDue: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  status: { type: String, required: true, enum: ['scheduled', 'paid', 'partial', 'overdue', 'waived'], default: 'scheduled' },
  paidAt: String,
}, { _id: false })

const contractSchema = new Schema<IFinancingContract>({
  applicationId: { type: String, required: true, index: true },
  financierId: { type: String, required: true, index: true },
  applicantId: { type: String, required: true, index: true },
  applicantName: String,
  agreementId: { type: String, index: true },
  landlordId: { type: String, index: true },
  productType: { type: String, required: true, enum: ['rent_advance', 'deposit_loan', 'rent_to_own'] },
  principal: { type: Number, required: true },
  annualInterestRate: { type: Number, required: true },
  tenureMonths: { type: Number, required: true },
  processingFee: { type: Number, default: 0 },
  monthlyPayment: { type: Number, required: true },
  totalRepayable: { type: Number, required: true },
  amountRepaid: { type: Number, default: 0 },
  status: { type: String, required: true, enum: ['pending_disbursement', 'active', 'in_grace', 'in_arrears', 'closed', 'defaulted', 'settled'], default: 'pending_disbursement' },
  disbursedAt: String,
  disbursementReference: String,
  schedule: [scheduleItemSchema],
  payrollDeductionMandateId: String,
  signedByApplicant: { type: Boolean, default: false },
  signedByFinancier: { type: Boolean, default: false },
  signedAt: String,
  notes: [{ text: String, by: String, at: String }],
  lastReminderAt: String,
  lastArrearsCheckAt: String,
  lastContactAt: String,
  // optimisticConcurrency: every save() is guarded by the document version, so two
  // concurrent modifications of the same contract (e.g. a manual repayment racing the
  // arrears cron) can't silently lose-update the schedule/amountRepaid — the loser
  // throws a VersionError and is handled by the caller (repay refunds, cron skips+retries).
}, { timestamps: true, optimisticConcurrency: true })

export const FinancingContract = mongoose.model<IFinancingContract>('FinancingContract', contractSchema)
