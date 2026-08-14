import mongoose, { Schema, type Document } from 'mongoose'

export interface IPayrollDeductionRecord {
  mandateId: string
  employeeId: string
  employeeName?: string
  allocationType: 'rent' | 'savings' | 'loan_repayment' | 'wallet_topup'
  targetEntityId?: string
  targetEntityType?: 'agreement' | 'savings_plan' | 'financing_contract' | 'wallet'
  amount: number
  status: 'queued' | 'disbursed' | 'failed' | 'skipped'
  disbursementReference?: string
  failureReason?: string
}

export interface IPayrollRun extends Document {
  employerId: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  scheduledPayDate: string
  totalGross: number
  totalDeductions: number
  totalNet: number
  employeeCount: number
  deductions: IPayrollDeductionRecord[]
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'processed' | 'failed' | 'cancelled'
  approvedBy?: string
  approvedAt?: string
  processedAt?: string
  failureReason?: string
}

const deductionRecordSchema = new Schema<IPayrollDeductionRecord>({
  mandateId: { type: String, required: true },
  employeeId: { type: String, required: true },
  employeeName: String,
  allocationType: { type: String, required: true, enum: ['rent', 'savings', 'loan_repayment', 'wallet_topup'] },
  targetEntityId: String,
  targetEntityType: { type: String, enum: ['agreement', 'savings_plan', 'financing_contract', 'wallet'] },
  amount: { type: Number, required: true },
  status: { type: String, required: true, enum: ['queued', 'disbursed', 'failed', 'skipped'], default: 'queued' },
  disbursementReference: String,
  failureReason: String,
}, { _id: false })

const payrollRunSchema = new Schema<IPayrollRun>({
  employerId: { type: String, required: true, index: true },
  periodLabel: { type: String, required: true },
  periodStart: { type: String, required: true },
  periodEnd: { type: String, required: true },
  scheduledPayDate: { type: String, required: true },
  totalGross: { type: Number, required: true, default: 0 },
  totalDeductions: { type: Number, required: true, default: 0 },
  totalNet: { type: Number, required: true, default: 0 },
  employeeCount: { type: Number, default: 0 },
  deductions: [deductionRecordSchema],
  status: { type: String, required: true, enum: ['draft', 'pending_approval', 'approved', 'processing', 'processed', 'failed', 'cancelled'], default: 'draft' },
  approvedBy: String,
  approvedAt: String,
  processedAt: String,
  failureReason: String,
}, { timestamps: true })

// One run per employer per period — without this, two runs for the same period
// deduct every mandate twice.
payrollRunSchema.index({ employerId: 1, periodLabel: 1 }, { unique: true })

export const PayrollRun = mongoose.model<IPayrollRun>('PayrollRun', payrollRunSchema)
