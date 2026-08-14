import mongoose, { Schema, type Document } from 'mongoose'

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

export const Notification = mongoose.model<INotification>('Notification', notificationSchema)
