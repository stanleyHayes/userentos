import mongoose, { Schema, type Document } from 'mongoose'

export type ExpenseType = 'repair' | 'levy' | 'utility' | 'tax' | 'insurance' | 'other'

export interface IPropertyExpense extends Document {
  propertyId: string
  landlordId: string
  type: ExpenseType
  amount: number
  date: string
  note?: string
  createdAt: Date
  updatedAt: Date
}

const propertyExpenseSchema = new Schema<IPropertyExpense>(
  {
    propertyId: { type: String, required: true, index: true },
    landlordId: { type: String, required: true, index: true },
    type: { type: String, enum: ['repair', 'levy', 'utility', 'tax', 'insurance', 'other'], required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: String, required: true },
    note: String,
  },
  { timestamps: true },
)

propertyExpenseSchema.index({ landlordId: 1, date: -1 })

export const PropertyExpense = mongoose.model<IPropertyExpense>('PropertyExpense', propertyExpenseSchema)
