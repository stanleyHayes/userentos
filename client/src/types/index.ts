export {
  ROLE_DEFAULT_PERMISSIONS,
  ACHIEVEMENT_CATALOG,
} from './shared'

export type {
  UserRole,
  Permission,
  InvitationStatus,
  Invitation,
  PropertyStatus,
  ListingStatus,
  PropertyType,
  AgreementStatus,
  PaymentMethod,
  PaymentStatus,
  DisputeStatus,
  DisputeCategory,
  SavingsPlanFrequency,
  SavingsPlanStatus,
  NotificationChannel,
  TransactionType,
  InvestmentType,
  InvestmentStatus,
  LoanStatus,
  ApplicationStatus,
  ProfileAccessStatus,
  DocumentType,
  User,
  Property,
  PropertyPreferences,
  Address,
  RentalAgreement,
  ComplianceFlag,
  Payment,
  SavingsPlan,
  WalletTransaction,
  Wallet,
  Dispute,
  Evidence,
  Notification,
  LegalArticle,
  ApiResponse,
  PaginatedResponse,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  Conversation,
  ChatMessage,
  TenantProfile,
  PersonalReference,
  ProfessionalReference,
  PreviousRental,
  EmergencyContact,
  SearchPreferences,
  Investment,
  InvestmentOption,
  Loan,
  CreditScore,
  CreditScoreFactors,
  Review,
  Application,
  ProfileAccess,
  BlogPost,
  Document,
  DocumentVersion,
  AuditLog,
  Favorite,
  UserSettings,
  RenewalStatus,
  BadgeCounts,
  FinancingProductType,
  FinancingApplicationStatus,
  FinancingContractStatus,
  RepaymentStatus,
  FinancingOffer,
  FinancingApplication,
  RepaymentScheduleItem,
  FinancingContract,
  EmployerVerificationStatus,
  EmploymentStatus,
  PayrollCycle,
  DeductionAllocationType,
  DeductionTargetType,
  DeductionMandateStatus,
  DeductionAmountType,
  PayrollRunStatus,
  PayrollDeductionStatus,
  Employer,
  Employment,
  DeductionMandate,
  PayrollDeductionRecord,
  PayrollRun,
  PropertyAccessibility,
  AccessibilityFlag,
  InsuranceCategory,
  InsurancePolicyStatus,
  InsuranceClaimStatus,
  InsuranceProduct,
  InsurancePolicy,
  InsuranceClaim,
  AchievementTier,
  AchievementCode,
  AchievementDefinition,
  Achievement,
  PaymentStreak,
  PaymentStreakBreak,
  StreakLeaderboardEntry,
} from './shared'

export interface SubscriptionPackage {
  id: string
  name: string
  slug: string
  description: string
  price: number
  billingCycle: 'monthly' | 'yearly'
  maxProperties: number
  benefits: string[]
  isActive: boolean
  isDefault: boolean
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

// Move-out lifecycle (deposit refund tracker)
export type MoveOutStatus =
  | 'initiated'
  | 'inspection_scheduled'
  | 'inspected'
  | 'disputed'
  | 'refund_pending'
  | 'refund_paid'
  | 'closed'

export interface MoveOutDamage {
  description: string
  cost: number
  photos: string[]
}

export interface MoveOutNote {
  text: string
  by: string
  at: string
}

export interface MoveOut {
  id: string
  agreementId: string
  tenantId: string
  landlordId: string
  propertyId: string
  status: MoveOutStatus
  initiatedBy: 'tenant' | 'landlord' | 'system'
  moveOutDate: string
  inspectionDate?: string
  inspectionNotes?: string
  damages: MoveOutDamage[]
  securityDeposit: number
  deductionsTotal: number
  refundAmount: number
  refundedAt?: string
  refundReference?: string
  tenantAcknowledgedAt?: string
  landlordAcknowledgedAt?: string
  notes: MoveOutNote[]
  // Server enrichment for list responses
  tenantName?: string
  landlordName?: string
  propertyTitle?: string
  createdAt?: string
  updatedAt?: string
}
