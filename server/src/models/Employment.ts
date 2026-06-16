import mongoose, { Schema, type Document } from 'mongoose'

export interface IEmployment extends Document {
  employerId: string
  userId: string
  staffNumber?: string
  jobTitle?: string
  netMonthlySalary: number
  status: 'active' | 'on_leave' | 'terminated' | 'pending'
  startDate: string
  endDate?: string
}

const employmentSchema = new Schema<IEmployment>({
  employerId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  staffNumber: String,
  jobTitle: String,
  netMonthlySalary: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, enum: ['active', 'on_leave', 'terminated', 'pending'], default: 'pending' },
  startDate: { type: String, required: true },
  endDate: String,
}, { timestamps: true })

employmentSchema.index({ employerId: 1, userId: 1 }, { unique: true })

export const Employment = mongoose.model<IEmployment>('Employment', employmentSchema)
