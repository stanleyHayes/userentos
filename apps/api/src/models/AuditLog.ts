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

// The admin viewer sorts newest-first and filters on entityType/action, none of
// which the userId index helps with. Without these, every page of the audit log
// is a collection scan — fine now, and the reason the log stops being opened
// once it is large.
auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ entityType: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema)
