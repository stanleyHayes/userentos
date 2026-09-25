import mongoose, { Schema, type Document } from 'mongoose'

export type LoanStatus = 'pending' | 'pre_qualified' | 'pending_review' | 'approved' | 'active' | 'repaid' | 'defaulted' | 'rejected'

/** Statuses that still tie the borrower to a loan. The partial unique index below allows one per borrower. */
export const LOAN_OPEN_STATUSES = ['pending', 'pre_qualified', 'pending_review', 'approved', 'active', 'defaulted'] as const
/** Awaiting a person's decision. 'pending' is legacy (pre-review applications). */
export const LOAN_REVIEWABLE_STATUSES = ['pending', 'pre_qualified', 'pending_review'] as const

// Google Play's personal-loan policy bars repayment terms of 60 days or less;
// three months keeps every schedule clear of it.
export const LOAN_LIMITS = { minAmount: 50, maxAmount: 10000, minTenureMonths: 3, maxTenureMonths: 12 } as const

export interface ILoanQuoteSnapshot {
  amount: number
  tenure: number
  annualInterestRate: number
  processingFee: number
  netDisbursed: number
  monthlyPayment: number
  totalRepayment: number
  totalCostOfCredit: number
  apr: number
  schedule: { installmentNumber: number; dueDate: string; principal: number; interest: number; amountDue: number }[]
}

export interface ILoan extends Document {
  userId: string
  agreementId: string
  amount: number
  interestRate: number
  tenure: number // months
  processingFee: number
  apr?: number
  monthlyPayment: number
  totalRepayment: number
  amountPaid: number
  status: LoanStatus
  creditScoreAtApproval?: number
  /** Score-only screening. Never an approval: a person decides (Act 843 s.41). */
  automatedAssessment?: { outcome: 'pre_qualified' | 'manual_review' | 'declined'; creditScore: number; reasons: string[]; assessedAt: Date }
  /** The borrower's acceptance of the exact disclosed terms. */
  termsAcceptance?: { acceptedAt: Date; snapshot: ILoanQuoteSnapshot }
  reviewRequestedAt?: Date
  reviewedBy?: string
  reviewedAt?: Date
  decisionReason?: string
  lenderId?: string
  /** Where the disbursed money came from — a disbursement never creates balance. */
  fundingSource?: 'lender_wallet' | 'external_settlement'
  fundingReference?: string
  disbursedBy?: string
  disbursedAt?: string
  reason: string
}

const scheduleItemSchema = new Schema({
  installmentNumber: Number, dueDate: String, principal: Number, interest: Number, amountDue: Number,
}, { _id: false })

const loanSchema = new Schema<ILoan>({
  userId: { type: String, required: true, index: true },
  agreementId: { type: String, required: true },
  amount: { type: Number, required: true, min: LOAN_LIMITS.minAmount, max: LOAN_LIMITS.maxAmount },
  interestRate: { type: Number, required: true },
  tenure: { type: Number, required: true, min: LOAN_LIMITS.minTenureMonths, max: LOAN_LIMITS.maxTenureMonths },
  processingFee: { type: Number, default: 0, min: 0 },
  apr: Number,
  monthlyPayment: { type: Number, required: true },
  totalRepayment: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  status: { type: String, required: true, enum: ['pending', 'pre_qualified', 'pending_review', 'approved', 'active', 'repaid', 'defaulted', 'rejected'], default: 'pending' },
  creditScoreAtApproval: Number,
  automatedAssessment: {
    outcome: { type: String, enum: ['pre_qualified', 'manual_review', 'declined'] },
    creditScore: Number,
    reasons: [String],
    assessedAt: Date,
  },
  termsAcceptance: {
    acceptedAt: Date,
    snapshot: {
      amount: Number, tenure: Number, annualInterestRate: Number, processingFee: Number, netDisbursed: Number,
      monthlyPayment: Number, totalRepayment: Number, totalCostOfCredit: Number, apr: Number,
      schedule: [scheduleItemSchema],
    },
  },
  reviewRequestedAt: Date,
  reviewedBy: String,
  reviewedAt: Date,
  decisionReason: String,
  lenderId: { type: String, index: true },
  fundingSource: { type: String, enum: ['lender_wallet', 'external_settlement'] },
  fundingReference: String,
  disbursedBy: String,
  disbursedAt: String,
  reason: { type: String, required: true },
}, { timestamps: true })

// One open loan per borrower, enforced by the database so parallel
// applications can't all slip past a read-then-create check.
loanSchema.index({ userId: 1 }, { name: 'loan_one_open_per_user', unique: true, partialFilterExpression: { status: { $in: [...LOAN_OPEN_STATUSES] } } })
// One external settlement backs exactly one disbursement.
loanSchema.index({ fundingReference: 1 }, { name: 'loan_funding_reference', unique: true, partialFilterExpression: { fundingReference: { $type: 'string' } } })

export const Loan = mongoose.model<ILoan>('Loan', loanSchema)
