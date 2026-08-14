import { logger } from './utils/logger.js'
import {
  UserRepository,
  PropertyRepository,
  AgreementRepository,
  PaymentRepository,
  ConversationRepository,
  MessageRepository,
  WalletRepository,
} from './repositories/index.js'
import { AuthService } from './services/authService.js'
import { PropertyService } from './services/propertyService.js'

// ─── Repositories ───

export const userRepo = new UserRepository()
export const propertyRepo = new PropertyRepository()
export const agreementRepo = new AgreementRepository()
export const paymentRepo = new PaymentRepository()
export const conversationRepo = new ConversationRepository()
export const messageRepo = new MessageRepository()
export const walletRepo = new WalletRepository()

// ─── Services ───

export const authService = new AuthService(userRepo, walletRepo, logger)
export const propertyService = new PropertyService(propertyRepo, logger)
