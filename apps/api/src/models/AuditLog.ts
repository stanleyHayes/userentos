import mongoose, { Schema, type Document } from 'mongoose'

export interface IAuditLog extends Document {
  userId: string
  action: string
  entityType: string
  entityId: string
  details?: string
  ipAddress?: string
}

const auditLogSchema = new Schema<IAuditLog>({
  userId: { type: String, required: true, index: true },
  action: { type: String, required: true }, // 'create', 'update', 'delete', 'sign', 'upload', 'view'
  entityType: { type: String, required: true }, // 'agreement', 'property', 'payment', 'document', etc.
  entityId: { type: String, required: true },
  details: String,
  ipAddress: String,
}, { timestamps: true })

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema)
