import mongoose, { Schema, type Document } from 'mongoose'

// ─── Conversation ───

export interface IConversation extends Document {
  participants: string[]
  propertyId?: string
  lastMessage?: {
    text: string
    senderId: string
    createdAt: Date
  }
  unreadCount: Map<string, number>
}

const conversationSchema = new Schema<IConversation>({
  participants: { type: [String], required: true, validate: [(v: string[]) => v.length === 2, 'Exactly 2 participants required'] },
  propertyId: { type: String },
  lastMessage: {
    text: { type: String },
    senderId: { type: String },
    createdAt: { type: Date },
  },
  unreadCount: { type: Map, of: Number, default: {} },
}, { timestamps: true })

conversationSchema.index({ participants: 1 })
conversationSchema.index({ updatedAt: -1 })

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema)

// ─── Message ───

export interface IMessage extends Document {
  conversationId: string
  senderId: string
  text: string
  read: boolean
}

const messageSchema = new Schema<IMessage>({
  conversationId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  text: { type: String, required: true },
  read: { type: Boolean, default: false },
}, { timestamps: true })

messageSchema.index({ conversationId: 1, createdAt: 1 })

export const Message = mongoose.model<IMessage>('Message', messageSchema)
