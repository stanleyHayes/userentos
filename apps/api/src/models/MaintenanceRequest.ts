import mongoose, { Schema, type Document } from 'mongoose'

export type MaintenanceCategory =
  | 'plumbing'
  | 'electrical'
  | 'structural'
  | 'pest'
  | 'appliance'
  | 'security'
  | 'other'

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent'

export type MaintenanceStatus =
  | 'requested'
  | 'acknowledged'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export interface MaintenanceNote {
  text: string
  by: string
  at: string
}

export interface IMaintenanceRequest extends Document {
  propertyId: string
  agreementId?: string
  tenantId: string
  landlordId: string
  title: string
  description: string
  category: MaintenanceCategory
  priority: MaintenancePriority
  status: MaintenanceStatus
  vendorId?: string
  vendorName?: string
  vendorPhone?: string
  scheduledDate?: string
  completedAt?: string
  cost?: number
  images: string[]
  notes: MaintenanceNote[]
  /** ISO timestamp of last reminder/escalation sent for this request (idempotency for scheduler) */
  lastReminderAt?: string
  createdAt: Date
  updatedAt: Date
}

const maintenanceNoteSchema = new Schema<MaintenanceNote>(
  {
    text: { type: String, required: true },
    by: { type: String, required: true },
    at: { type: String, required: true },
  },
  { _id: false }
)

const maintenanceRequestSchema = new Schema<IMaintenanceRequest>(
  {
    propertyId: { type: String, required: true },
    agreementId: { type: String, index: true },
    tenantId: { type: String, required: true, index: true },
    landlordId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: ['plumbing', 'electrical', 'structural', 'pest', 'appliance', 'security', 'other'],
      default: 'other',
    },
    priority: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    status: {
      type: String,
      required: true,
      enum: ['requested', 'acknowledged', 'scheduled', 'in_progress', 'completed', 'cancelled'],
      default: 'requested',
      index: true,
    },
    vendorId: String,
    vendorName: String,
    vendorPhone: String,
    scheduledDate: String,
    completedAt: String,
    cost: Number,
    images: { type: [String], default: [] },
    notes: { type: [maintenanceNoteSchema], default: [] },
    lastReminderAt: String,
  },
  { timestamps: true }
)

// Performance indexes
maintenanceRequestSchema.index({ status: 1, createdAt: -1 })
maintenanceRequestSchema.index({ propertyId: 1 })
maintenanceRequestSchema.index({ landlordId: 1, status: 1 })

export const MaintenanceRequest = mongoose.model<IMaintenanceRequest>(
  'MaintenanceRequest',
  maintenanceRequestSchema
)
