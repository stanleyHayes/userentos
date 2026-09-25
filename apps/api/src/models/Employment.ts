import mongoose, { Schema, type Document } from 'mongoose'

export type EmploymentStatus = 'pending' | 'active' | 'on_leave' | 'terminated' | 'declined'

export interface IEmployment extends Document {
  employerId: string
  userId: string
  /** The address the employer invited — shown to the employer instead of a name until the employee accepts. */
  inviteEmail?: string
  /** The employee's own confirmation of the link. No payroll deductions before it. */
  employeeAcceptedAt?: Date
  employeeDeclinedAt?: Date
  staffNumber?: string
  jobTitle?: string
  netMonthlySalary: number
  status: EmploymentStatus
  startDate: string
  endDate?: string
}

const employmentSchema = new Schema<IEmployment>({
  employerId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  inviteEmail: String,
  employeeAcceptedAt: Date,
  employeeDeclinedAt: Date,
  staffNumber: String,
  jobTitle: String,
  netMonthlySalary: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, enum: ['active', 'on_leave', 'terminated', 'pending', 'declined'], default: 'pending' },
  startDate: { type: String, required: true },
  endDate: String,
}, { timestamps: true })

employmentSchema.index({ employerId: 1, userId: 1 }, { unique: true })

export const Employment = mongoose.model<IEmployment>('Employment', employmentSchema)
