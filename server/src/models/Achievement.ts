import mongoose, { Schema, type Document } from 'mongoose'

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface IAchievement extends Document {
  userId: string
  code: string
  title: string
  description: string
  icon: string
  tier: AchievementTier
  earnedAt: Date
  metadata?: Record<string, unknown>
}

const achievementSchema = new Schema<IAchievement>({
  userId: { type: String, required: true, index: true },
  code: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  icon: { type: String, required: true },
  tier: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'], required: true },
  earnedAt: { type: Date, default: () => new Date() },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true })

// Idempotency: a user can only earn each code once
achievementSchema.index({ userId: 1, code: 1 }, { unique: true })

export const Achievement = mongoose.model<IAchievement>('Achievement', achievementSchema)
