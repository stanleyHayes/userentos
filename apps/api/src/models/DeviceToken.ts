import mongoose, { Schema, type Document } from 'mongoose'

export type DevicePlatform = 'expo' | 'fcm' | 'apns'

export interface IDeviceToken extends Document {
  userId: string
  token: string
  platform: DevicePlatform
  lastSeenAt: Date
}

const deviceTokenSchema = new Schema<IDeviceToken>({
  userId: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  platform: { type: String, required: true, enum: ['expo', 'fcm', 'apns'], default: 'expo' },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true })

export const DeviceToken = mongoose.model<IDeviceToken>('DeviceToken', deviceTokenSchema)
