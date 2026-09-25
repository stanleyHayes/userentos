import mongoose, { Schema, type Document } from 'mongoose'
import { ttlSeconds } from '../config/retention.js'

export interface INotification extends Document {
  userId: string
  title: string
  message: string
  channel: string
  read: boolean
  actionUrl?: string
}

const notificationSchema = new Schema<INotification>({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  channel: { type: String, required: true, enum: ['sms', 'email', 'push', 'in_app'], default: 'in_app' },
  read: { type: Boolean, default: false },
  actionUrl: String,
}, { timestamps: true })

// Retention (config/retention.ts): read notifications expire a year after they
// were created; ones never read, two years after they were last touched.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds('readNotification'), partialFilterExpression: { read: true } })
notificationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: ttlSeconds('unreadNotification') })

export const Notification = mongoose.model<INotification>('Notification', notificationSchema)
