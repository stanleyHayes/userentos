import { BaseRepository } from './BaseRepository.js'
import { User, type IUser } from '../models/User.js'
import { Property, type IProperty } from '../models/Property.js'
import { Agreement, type IAgreement } from '../models/Agreement.js'
import { Payment, type IPayment } from '../models/Payment.js'
import { Conversation, Message, type IConversation, type IMessage } from '../models/Conversation.js'
import { Wallet, type IWallet } from '../models/Wallet.js'

// ─── User ───

export class UserRepository extends BaseRepository<IUser> {
  constructor() {
    super(User)
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return this.findOne({ email: email.toLowerCase() })
  }

  async findByPhone(phone: string): Promise<IUser | null> {
    return this.findOne({ phone })
  }

  async findByRole(role: string): Promise<IUser[]> {
    return this.findMany({ roles: role })
  }
}

// ─── Property ───

export class PropertyRepository extends BaseRepository<IProperty> {
  constructor() {
    super(Property)
  }

  async findByLandlord(landlordId: string): Promise<IProperty[]> {
    return this.findMany({ landlordId }, { sort: { createdAt: -1 } })
  }

  async findAvailable(filter: Record<string, unknown> = {}): Promise<IProperty[]> {
    return this.findMany({ ...filter, status: 'available' }, { sort: { createdAt: -1 } })
  }

  async incrementViews(ids: string[]): Promise<void> {
    await this.model.updateMany({ _id: { $in: ids } }, { $inc: { views: 1 } }).exec()
  }

  async search(filter: Record<string, unknown>, sort: Record<string, 1 | -1> = { createdAt: -1 }): Promise<IProperty[]> {
    return this.findMany(filter as Record<string, unknown>, { sort, lean: true })
  }
}

// ─── Agreement ───

export class AgreementRepository extends BaseRepository<IAgreement> {
  constructor() {
    super(Agreement)
  }

  async findByProperty(propertyId: string): Promise<IAgreement[]> {
    return this.findMany({ propertyId })
  }

  async findByTenant(tenantId: string): Promise<IAgreement[]> {
    return this.findMany({ tenantId }, { sort: { createdAt: -1 } })
  }

  async findByLandlord(landlordId: string): Promise<IAgreement[]> {
    return this.findMany({ landlordId }, { sort: { createdAt: -1 } })
  }

  async findActive(userId: string): Promise<IAgreement[]> {
    return this.findMany({
      $or: [{ tenantId: userId }, { landlordId: userId }],
      status: 'active',
    })
  }
}

// ─── Payment ───

export class PaymentRepository extends BaseRepository<IPayment> {
  constructor() {
    super(Payment)
  }

  async findByAgreement(agreementId: string): Promise<IPayment[]> {
    return this.findMany({ agreementId }, { sort: { createdAt: -1 } })
  }

  async findByTenant(tenantId: string): Promise<IPayment[]> {
    return this.findMany({ tenantId }, { sort: { createdAt: -1 } })
  }

  async findByReference(reference: string): Promise<IPayment | null> {
    return this.findOne({ reference })
  }
}

// ─── Conversation ───

export class ConversationRepository extends BaseRepository<IConversation> {
  constructor() {
    super(Conversation)
  }

  async findByParticipant(userId: string): Promise<IConversation[]> {
    return this.findMany({ participants: userId }, { sort: { updatedAt: -1 } })
  }

  async findBetween(userA: string, userB: string): Promise<IConversation | null> {
    return this.findOne({ participants: { $all: [userA, userB] } })
  }
}

// ─── Message ───

export class MessageRepository extends BaseRepository<IMessage> {
  constructor() {
    super(Message)
  }

  async findByConversation(conversationId: string, options?: { limit?: number; skip?: number }): Promise<IMessage[]> {
    return this.findMany(
      { conversationId },
      { sort: { createdAt: 1 }, limit: options?.limit, skip: options?.skip },
    )
  }
}

// ─── Wallet ───

export class WalletRepository extends BaseRepository<IWallet> {
  constructor() {
    super(Wallet)
  }

  async findByUserId(userId: string): Promise<IWallet | null> {
    return this.findOne({ userId })
  }
}

export { BaseRepository } from './BaseRepository.js'
