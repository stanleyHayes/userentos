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
  /**
   * The unread-message email (services/messageAlerts.ts): participants with
   * an unread message who have not been emailed yet, and since when.
   */
  pendingEmail: { userId: string; since: Date }[]
  /**
   * Participants already emailed (or alerted by email another way) during
   * their current unread spell. Reading the conversation clears both lists,
   * so there is at most one email per conversation until it is read.
   */
  emailedUnread: string[]
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
  pendingEmail: { type: [{ _id: false, userId: { type: String, required: true }, since: { type: Date, required: true } }], default: [] },
  emailedUnread: { type: [String], default: [] },
}, { timestamps: true })

conversationSchema.index({ participants: 1 })
conversationSchema.index({ updatedAt: -1 })
// The unread-message email job reads only conversations with an email due.
conversationSchema.index({ 'pendingEmail.since': 1 })

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema)

// ─── Message ───

export interface IMessage extends Document {
  removed?: boolean
  removedReason?: string
  conversationId: string
  senderId: string
  text: string
  read: boolean
  createdAt: Date
  updatedAt: Date
}

const messageSchema = new Schema<IMessage>({
  removed: { type: Boolean, default: false },
  removedReason: String,
  conversationId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  text: { type: String, required: true },
  read: { type: Boolean, default: false },
}, { timestamps: true })

messageSchema.index({ conversationId: 1, createdAt: 1 })

export const Message = mongoose.model<IMessage>('Message', messageSchema)
