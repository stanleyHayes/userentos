// ============================================
// RentOS Ghana — Shared Domain Types
// ============================================

// --- Enums ---

export type UserRole = 'tenant' | 'landlord' | 'property_manager' | 'government' | 'legal_officer' | 'admin' | 'super_admin' | 'financier' | 'employer'

// --- Permissions ---

export type Permission =
  // User management
  | 'users:view'
  | 'users:create'
  | 'users:edit'
  | 'users:delete'
  | 'users:invite'
  | 'users:manage_permissions'
  // Properties
  | 'properties:view'
  | 'properties:create'
  | 'properties:edit'
  | 'properties:delete'
  | 'properties:review'
  // Agreements
  | 'agreements:view'
  | 'agreements:create'
  | 'agreements:edit'
  | 'agreements:terminate'
  // Payments
  | 'payments:view'
  | 'payments:process'
  | 'payments:refund'
  // Disputes
  | 'disputes:view'
  | 'disputes:manage'
  | 'disputes:assign'
  // Analytics
  | 'analytics:view'
  | 'analytics:export'
  // Blog / CMS
  | 'blog:view'
  | 'blog:create'
  | 'blog:edit'
  | 'blog:delete'
  // Legal
  | 'legal:view'
  | 'legal:create'
  | 'legal:edit'
  // Simulation / Policy
  | 'simulation:run'
  // Subscriptions
  | 'subscriptions:view'
  | 'subscriptions:manage'
  // Financing (financier role)
  | 'financing:view'
  | 'financing:offer'
  | 'financing:approve'
  | 'financing:disburse'
  | 'financing:collect'
  | 'financing:default_manage'
  // Employer / Payroll
  | 'employer:view_employees'
  | 'employer:invite_employees'
  | 'employer:configure_deductions'
  | 'employer:approve_deductions'
  | 'employer:run_payroll'
  | 'employer:disburse'
  | 'employer:view_payroll_reports'
  // Insurance
  | 'insurance:review_claims'
  // System
  | 'system:settings'
  | 'system:audit_logs'

// Default permissions per admin role
export const ROLE_DEFAULT_PERMISSIONS: Partial<Record<UserRole, Permission[]>> = {
  super_admin: [], // super_admin bypasses all checks — no list needed
  admin: [
    'users:view', 'users:create', 'users:edit', 'users:invite',
    'properties:view', 'properties:edit', 'properties:review',
    'agreements:view', 'payments:view', 'payments:process',
    'disputes:view', 'disputes:manage',
    'analytics:view', 'blog:view', 'blog:create', 'blog:edit', 'blog:delete',
    'legal:view', 'simulation:run',
    'insurance:review_claims',
  ],
  government: [
    'users:view',
    'properties:view', 'properties:review',
    'agreements:view', 'payments:view',
    'disputes:view', 'disputes:manage', 'disputes:assign',
    'analytics:view', 'analytics:export',
    'blog:view', 'blog:create', 'blog:edit',
    'legal:view', 'legal:create', 'legal:edit',
    'simulation:run', 'system:audit_logs',
  ],
  legal_officer: [
    'users:view',
    'properties:view', 'agreements:view', 'payments:view',
    'disputes:view', 'disputes:manage',
    'analytics:view',
    'blog:view', 'blog:create', 'blog:edit',
    'legal:view', 'legal:create', 'legal:edit',
  ],
  financier: [
    'users:view',
    'agreements:view', 'payments:view',
    'financing:view', 'financing:offer', 'financing:approve',
    'financing:disburse', 'financing:collect', 'financing:default_manage',
    'analytics:view',
  ],
  employer: [
    'users:view',
    'employer:view_employees', 'employer:invite_employees',
    'employer:configure_deductions', 'employer:approve_deductions',
    'employer:run_payroll', 'employer:disburse',
    'employer:view_payroll_reports',
  ],
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface Invitation {
  id: string
  email: string
  roles: UserRole[]
  permissions: Permission[]
  invitedBy: string
  invitedByName?: string
  status: InvitationStatus
  token: string
  expiresAt: string
  acceptedAt?: string
  createdAt: string
  updatedAt: string
}

export type PropertyStatus = 'available' | 'occupied' | 'under_dispute' | 'maintenance_required'

export type ListingStatus = 'draft' | 'pending_review' | 'approved' | 'rejected'

export type PropertyType = 'apartment' | 'house' | 'room' | 'commercial' | 'warehouse' | 'studio' | 'townhouse' | 'hostel' | 'shared_room'

export type AgreementStatus = 'draft' | 'pending_signatures' | 'active' | 'expired' | 'terminated' | 'disputed'

export type RenewalStatus = 'none' | 'landlord_declined' | 'tenant_declined' | 'pending' | 'renewed'

export type PaymentMethod = 'mtn_momo' | 'telecel_cash' | 'airteltigo_money' | 'bank_transfer'

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'

export type DisputeStatus = 'filed' | 'under_mediation' | 'escalated' | 'resolved' | 'closed'

export type DisputeCategory = 'rent_increase' | 'eviction' | 'maintenance' | 'deposit_refund' | 'illegal_clause' | 'other'

export type SavingsPlanFrequency = 'daily' | 'weekly' | 'monthly'

export type SavingsPlanStatus = 'active' | 'paused' | 'completed' | 'cancelled'

export type NotificationChannel = 'sms' | 'email' | 'push' | 'in_app'

export type TransactionType = 'deposit' | 'withdrawal' | 'rent_payment' | 'investment_return' | 'refund'

// --- Core Models ---

export interface User {
  id: string
  email: string
  phone: string
  firstName: string
  lastName: string
  roles: UserRole[]
  activeRole: UserRole
  permissions: Permission[]
  ghanaCardId?: string
  isVerified: boolean
  mfaEnabled?: boolean
  profileImage?: string
  invitedBy?: string
  createdAt: string
  updatedAt: string
}

export interface Property {
  id: string
  landlordId: string
  title: string
  description: string
  type: PropertyType
  status: PropertyStatus
  listingStatus: ListingStatus
  rejectionReason?: string
  reviewedBy?: string
  reviewedAt?: string
  publishedAt?: string
  address: Address
  rentAmount: number
  rentDurationMonths: number
  advanceMonths: number
  images: string[]
  videos: string[]
  rules: string[]
  amenities: string[]
  bedrooms?: number
  bathrooms?: number
  furnished?: boolean
  floorArea?: number
  floor?: number
  parkingSpaces?: number
  yearBuilt?: number
  availableFrom?: string
  preferences?: PropertyPreferences
  accessibility?: PropertyAccessibility
  views?: number
  inquiries?: number
  favorites?: number
  neighborhood?: string
  createdAt: string
  updatedAt: string
}

export interface Address {
  street: string
  city: string
  region: string
  digitalAddress?: string // Ghana Post GPS
}

export interface RentalAgreement {
  id: string
  propertyId: string
  landlordId: string
  tenantId: string
  status: AgreementStatus
  startDate: string
  endDate: string
  rentAmount: number
  securityDeposit: number
  advanceMonths: number
  terms: string[]
  specialConditions: string[]
  landlordSignature?: string
  tenantSignature?: string
  complianceFlags: ComplianceFlag[]
  version: number
  renewalStatus: RenewalStatus
  renewalDeclinedBy?: string
  renewalDeclinedAt?: string
  tenantName?: string
  tenantEmail?: string
  tenantPhone?: string
  landlordName?: string
  createdAt: string
  updatedAt: string
}

export interface ComplianceFlag {
  type: 'warning' | 'violation'
  message: string
  clause?: string
  law?: string
}

export interface Payment {
  id: string
  agreementId: string
  tenantId: string
  landlordId: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  reference: string
  receiptUrl?: string
  paidAt?: string
  /** Provider-side correlator (MTN X-Reference-Id, Telecel transactionId, bank PSP ref). */
  providerRef?: string
  /** Raw provider status string for audit (e.g. SUCCESSFUL, REJECTED). */
  providerStatus?: string
  /** Reason from the provider on failure / decline. */
  failureReason?: string
  /** ISO timestamp of last reconciliation poll. */
  lastProviderCheckAt?: string
  createdAt: string
}

export interface SavingsPlan {
  id: string
  userId: string
  targetAmount: number
  currentAmount: number
  frequency: SavingsPlanFrequency
  contributionAmount: number
  startDate: string
  targetDate: string
  status: SavingsPlanStatus
  linkedPropertyId?: string
  linkedAgreementId?: string
  autoDebit: boolean
  createdAt: string
  updatedAt: string
}

export interface WalletTransaction {
  id: string
  userId: string
  type: TransactionType
  amount: number
  balanceAfter: number
  reference: string
  description: string
  createdAt: string
}

export interface Wallet {
  id: string
  userId: string
  balance: number
  bankAccountRef?: string
  transactions: WalletTransaction[]
  createdAt: string
  updatedAt: string
}

export interface Dispute {
  id: string
  filedBy: string
  filedAgainst: string
  propertyId: string
  agreementId?: string
  category: DisputeCategory
  status: DisputeStatus
  title: string
  description: string
  evidence: Evidence[]
  mediationNotes?: string
  resolution?: string
  assignedTo?: string
  createdAt: string
  updatedAt: string
}

export interface Evidence {
  id: string
  type: 'image' | 'video' | 'document'
  url: string
  description: string
  uploadedAt: string
}

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  channel: NotificationChannel
  read: boolean
  actionUrl?: string
  createdAt: string
}

export interface LegalArticle {
  id: string
  title: string
  content: string
  simplifiedContent: string
  category: string
  lawReference: string
  effectiveDate: string
  tags: string[]
  language: 'en' | 'tw' | 'ga' | 'ee'
  createdAt: string
  updatedAt: string
}

// --- Property Preferences ---

export interface PropertyPreferences {
  minCreditScore: number
  minIncomeMultiple: number
  maxOccupants: number
  allowSmokers: boolean
  allowPets: boolean
  allowChildren: boolean
  preferredEmployment: string[]
  preferredGender: string
  minAge: number
  maxAge: number
  requireReferences: boolean
  requireEmploymentProof: boolean
  requireProfileComplete: boolean
}

// --- Property Accessibility ---

export interface PropertyAccessibility {
  wheelchairAccessible: boolean
  stepFreeEntry: boolean
  elevator: boolean
  accessibleBathroom: boolean
  hearingLoop: boolean
  brailleSignage: boolean
  groundFloorOnly: boolean
}

export type AccessibilityFlag = keyof PropertyAccessibility

// --- Tenant Profile ---

export interface PersonalReference {
  name: string
  relationship: string
  phone: string
  email?: string
  occupation?: string
  yearsKnown?: number
}

export interface ProfessionalReference {
  name: string
  title: string
  company: string
  phone: string
  email?: string
}

export interface PreviousRental {
  address: string
  city: string
  duration: string
  monthlyRent?: number
  landlordName?: string
  landlordPhone?: string
  reasonForLeaving?: string
  canContact: boolean
}

export interface EmergencyContact {
  name?: string
  relationship?: string
  phone?: string
  address?: string
}

export interface SearchPreferences {
  preferredRegions: string[]
  preferredCities: string[]
  preferredType: string[]
  minBudget: number
  maxBudget: number
  minBedrooms: number
  needsFurnished: boolean
  needsParking: boolean
  preferredAmenities: string[]
}

export interface TenantProfile {
  id: string
  userId: string
  dateOfBirth?: string
  gender?: string
  maritalStatus?: string
  nationality?: string
  religion?: string
  ethnicGroup?: string
  hometown?: string
  languagesSpoken: string[]
  bio?: string
  highestEducation?: string
  institution?: string
  fieldOfStudy?: string
  graduationYear?: number
  currentlyStudying: boolean
  employmentStatus?: string
  occupation?: string
  employer?: string
  employerAddress?: string
  monthlyIncome?: number
  employmentDuration?: string
  workPhone?: string
  linkedinUrl?: string
  professionalLicense?: string
  hasSpouse: boolean
  spouseName?: string
  spouseOccupation?: string
  hasChildren: boolean
  numberOfChildren?: number
  childrenAges?: string
  numberOfDependents: number
  numberOfOccupants: number
  occupantDetails?: string
  smoker: boolean
  drinker: boolean
  pets: boolean
  petType?: string
  petCount?: number
  noiseLevel?: string
  workSchedule?: string
  hobbies: string[]
  clubs: string[]
  dietaryRestrictions?: string
  vehicleOwner: boolean
  vehicleType?: string
  personalReferences: PersonalReference[]
  professionalReferences: ProfessionalReference[]
  previousRentals: PreviousRental[]
  hasBeenEvicted: boolean
  evictionDetails?: string
  emergencyContact: EmergencyContact
  idType?: string
  idNumber?: string
  idDocumentUrl?: string
  idVerified: boolean
  proofOfIncomeUrl?: string
  incomeVerified: boolean
  proofOfAddressUrl?: string
  addressVerified: boolean
  selfieUrl?: string
  searchPreferences: SearchPreferences
  completionScore: number
  profileComplete: boolean
  lastUpdated: string
  createdAt: string
  updatedAt: string
}

// --- Investment ---

export type InvestmentType = 'treasury_bill' | 'government_bond'
export type InvestmentStatus = 'active' | 'matured' | 'withdrawn' | 'pending'

export interface Investment {
  id: string
  userId: string
  type: InvestmentType
  amount: number
  interestRate: number
  tenure: number
  startDate: string
  maturityDate: string
  status: InvestmentStatus
  expectedReturn: number
  actualReturn?: number
  partnerId: string
  createdAt: string
  updatedAt: string
}

export interface InvestmentOption {
  id: string
  name: string
  type: InvestmentType
  minAmount: number
  interestRate: number
  tenure: number
  partner: string
  description: string
}

// --- Loan ---

export type LoanStatus = 'pending' | 'approved' | 'active' | 'repaid' | 'defaulted' | 'rejected'

export interface Loan {
  id: string
  userId: string
  agreementId: string
  amount: number
  interestRate: number
  tenure: number
  monthlyPayment: number
  totalRepayment: number
  amountPaid: number
  status: LoanStatus
  creditScoreAtApproval?: number
  disbursedAt?: string
  reason: string
  createdAt: string
  updatedAt: string
}

// --- Financing (Financier role) ---

export type FinancingProductType = 'rent_advance' | 'deposit_loan' | 'rent_to_own'
export type FinancingApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn'
export type FinancingContractStatus = 'pending_disbursement' | 'active' | 'in_grace' | 'in_arrears' | 'closed' | 'defaulted' | 'settled'
export type RepaymentStatus = 'scheduled' | 'paid' | 'partial' | 'overdue' | 'waived'

export interface FinancingOffer {
  id: string
  financierId: string
  name: string
  productType: FinancingProductType
  description: string
  minAmount: number
  maxAmount: number
  minTenureMonths: number
  maxTenureMonths: number
  annualInterestRate: number
  processingFeePct: number
  lateFeePct: number
  minCreditScore: number
  requiresEmployment: boolean
  requiresPayrollDeduction: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface FinancingApplication {
  id: string
  applicantId: string
  applicantName?: string
  financierId: string
  offerId: string
  agreementId?: string
  propertyId?: string
  amountRequested: number
  tenureMonths: number
  purpose: string
  status: FinancingApplicationStatus
  decisionNotes?: string
  decidedBy?: string
  decidedAt?: string
  creditScoreAtApply?: number
  monthlyIncomeAtApply?: number
  employerId?: string
  willUsePayrollDeduction: boolean
  createdAt: string
  updatedAt: string
}

export interface RepaymentScheduleItem {
  installmentNumber: number
  dueDate: string
  principal: number
  interest: number
  amountDue: number
  amountPaid: number
  status: RepaymentStatus
  paidAt?: string
}

export interface FinancingContract {
  id: string
  applicationId: string
  financierId: string
  applicantId: string
  applicantName?: string
  agreementId?: string
  landlordId?: string
  productType: FinancingProductType
  principal: number
  annualInterestRate: number
  tenureMonths: number
  processingFee: number
  monthlyPayment: number
  totalRepayable: number
  amountRepaid: number
  status: FinancingContractStatus
  disbursedAt?: string
  disbursementReference?: string
  schedule: RepaymentScheduleItem[]
  payrollDeductionMandateId?: string
  signedByApplicant: boolean
  signedByFinancier: boolean
  signedAt?: string
  createdAt: string
  updatedAt: string
}

// --- Employer / Payroll Deductions ---

export type EmployerVerificationStatus = 'pending' | 'verified' | 'rejected'
export type EmploymentStatus = 'active' | 'on_leave' | 'terminated' | 'pending'
export type PayrollCycle = 'weekly' | 'biweekly' | 'monthly'
export type DeductionAllocationType = 'rent' | 'savings' | 'loan_repayment' | 'wallet_topup'
export type DeductionTargetType = 'agreement' | 'savings_plan' | 'financing_contract' | 'wallet'
export type DeductionMandateStatus = 'pending' | 'active' | 'paused' | 'revoked' | 'expired'
export type DeductionAmountType = 'fixed' | 'percentage'
export type PayrollRunStatus = 'draft' | 'pending_approval' | 'approved' | 'processed' | 'failed' | 'cancelled'
export type PayrollDeductionStatus = 'queued' | 'disbursed' | 'failed' | 'skipped'

export interface Employer {
  id: string
  ownerId: string
  legalName: string
  tradingName?: string
  tin: string
  ssnitEmployerNumber?: string
  industry?: string
  address: Address
  contactEmail: string
  contactPhone: string
  payrollCycle: PayrollCycle
  paydayDayOfMonth?: number
  verificationStatus: EmployerVerificationStatus
  verifiedBy?: string
  verifiedAt?: string
  totalEmployees: number
  createdAt: string
  updatedAt: string
}

export interface Employment {
  id: string
  employerId: string
  employerName?: string
  userId: string
  employeeName?: string
  staffNumber?: string
  jobTitle?: string
  netMonthlySalary: number
  status: EmploymentStatus
  startDate: string
  endDate?: string
  createdAt: string
  updatedAt: string
}

export interface DeductionMandate {
  id: string
  employmentId: string
  employerId: string
  employeeId: string
  employeeName?: string
  allocationType: DeductionAllocationType
  targetEntityId?: string
  targetEntityType?: DeductionTargetType
  targetLabel?: string
  amountType: DeductionAmountType
  amount: number
  startDate: string
  endDate?: string
  noticePeriodDays: number
  signatureHash: string
  signedAt: string
  status: DeductionMandateStatus
  approvedByEmployerAt?: string
  approvedBy?: string
  revokedAt?: string
  revokedReason?: string
  createdAt: string
  updatedAt: string
}

export interface PayrollDeductionRecord {
  mandateId: string
  employeeId: string
  employeeName?: string
  allocationType: DeductionAllocationType
  targetEntityId?: string
  targetEntityType?: DeductionTargetType
  amount: number
  status: PayrollDeductionStatus
  disbursementReference?: string
  failureReason?: string
}

export interface PayrollRun {
  id: string
  employerId: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  scheduledPayDate: string
  totalGross: number
  totalDeductions: number
  totalNet: number
  employeeCount: number
  deductions: PayrollDeductionRecord[]
  status: PayrollRunStatus
  approvedBy?: string
  approvedAt?: string
  processedAt?: string
  failureReason?: string
  createdAt: string
  updatedAt: string
}

// --- Credit Score ---

export interface CreditScoreFactors {
  paymentHistory: number
  savingsConsistency: number
  agreementCompliance: number
  disputeRecord: number
  accountAge: number
}

export interface CreditScore {
  id: string
  userId: string
  score: number
  factors: CreditScoreFactors
  calculatedAt: string
  createdAt: string
  updatedAt: string
}

// --- Review ---

export interface Review {
  id: string
  propertyId: string
  userId: string
  userName: string
  rating: number
  title: string
  content: string
  pros: string[]
  cons: string[]
  wouldRecommend: boolean
  landlordResponsive: number
  maintenance: number
  valueForMoney: number
  neighborhood: number
  verified: boolean
  createdAt: string
  updatedAt: string
}

// --- Application ---

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface Application {
  id: string
  tenantId: string
  propertyId: string
  landlordId: string
  status: ApplicationStatus
  message: string
  moveInDate: string
  duration: number
  offeredRent?: number
  landlordNotes?: string
  respondedAt?: string
  createdAt: string
  updatedAt: string
}

// --- Profile Access ---

export type ProfileAccessStatus = 'pending' | 'approved' | 'denied' | 'revoked'

export interface ProfileAccess {
  id: string
  requesterId: string
  tenantId: string
  propertyId?: string
  status: ProfileAccessStatus
  requestedAt: string
  respondedAt?: string
  message?: string
  createdAt: string
  updatedAt: string
}

// --- Blog Post ---

export interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  author: string
  coverImage?: string
  tags: string[]
  published: boolean
  createdAt: string
  updatedAt: string
}

// --- Document ---

export type DocumentType = 'rental_agreement' | 'receipt' | 'legal_notice' | 'evidence' | 'identity' | 'other'

export interface Document {
  id: string
  ownerId: string
  name: string
  type: DocumentType
  mimeType: string
  fileUrl: string
  fileSize: number
  version: number
  parentId?: string
  linkedEntityId?: string
  linkedEntityType?: string
  accessControl: string[]
  createdAt: string
  updatedAt: string
}

export interface DocumentVersion {
  id: string
  version: number
  fileUrl: string
  fileSize: number
  createdAt: string
}

// --- Audit Log ---

export interface AuditLog {
  id: string
  userId: string
  action: string
  entityType: string
  entityId: string
  details?: string
  ipAddress?: string
  createdAt: string
}

// --- Favorite ---

export interface Favorite {
  id: string
  userId: string
  propertyId: string
  createdAt: string
}

// --- User Settings ---

export interface UserSettings {
  theme: 'light' | 'dark' | 'system'
  language: string
  notifications: {
    email: boolean
    sms: boolean
    push: boolean
    payment: boolean
    savings: boolean
  }
}

// --- Chat / Messaging ---

export interface Conversation {
  id: string
  participants: string[]
  participantNames?: string[]
  otherUser?: { id: string; firstName: string; lastName: string }
  propertyId?: string
  propertyTitle?: string
  lastMessage?: { text: string; senderId: string; createdAt: string }
  unreadCount: number
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  senderName?: string
  text: string
  read: boolean
  createdAt: string
}

// --- Badge Counts ---

export interface BadgeCounts {
  applications: number
  agreements: number
  disputes: number
  payments: number
  profileAccess: number
}

// --- Achievements ---

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export type AchievementCode =
  | 'first_lease'
  | 'on_time_streak_3'
  | 'on_time_streak_6'
  | 'on_time_streak_12'
  | 'on_time_streak_24'
  | 'verified_landlord'
  | 'first_savings_goal'
  | 'savings_goal_completed'
  | 'rent_paid_via_payroll'
  | 'first_property_listed'
  | 'profile_verified'
  | 'loan_settled'

export interface AchievementDefinition {
  code: AchievementCode
  title: string
  description: string
  icon: string
  tier: AchievementTier
}

export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  { code: 'first_lease', title: 'First Lease', description: 'Signed your first rental agreement on RentOS.', icon: 'home', tier: 'bronze' },
  { code: 'on_time_streak_3', title: '3-Month Streak', description: 'Paid rent on time for 3 consecutive months.', icon: 'flame', tier: 'bronze' },
  { code: 'on_time_streak_6', title: '6-Month Streak', description: 'Paid rent on time for 6 consecutive months.', icon: 'flame', tier: 'silver' },
  { code: 'on_time_streak_12', title: '1-Year Streak', description: 'Paid rent on time for 12 consecutive months.', icon: 'crown', tier: 'gold' },
  { code: 'on_time_streak_24', title: '2-Year Streak', description: 'Paid rent on time for 24 consecutive months.', icon: 'trophy', tier: 'platinum' },
  { code: 'verified_landlord', title: 'Verified Landlord', description: 'Your landlord profile is fully verified.', icon: 'badge-check', tier: 'silver' },
  { code: 'first_savings_goal', title: 'First Savings Goal', description: 'Created your first savings plan.', icon: 'piggy-bank', tier: 'bronze' },
  { code: 'savings_goal_completed', title: 'Goal Smasher', description: 'Reached the target on a savings goal.', icon: 'target', tier: 'gold' },
  { code: 'rent_paid_via_payroll', title: 'Payroll Pro', description: 'Paid rent automatically via payroll deduction.', icon: 'briefcase', tier: 'silver' },
  { code: 'first_property_listed', title: 'Welcome, Landlord', description: 'Listed your first property on RentOS.', icon: 'building-2', tier: 'bronze' },
  { code: 'profile_verified', title: 'Verified Member', description: 'Identity verified on RentOS.', icon: 'shield-check', tier: 'silver' },
  { code: 'loan_settled', title: 'Loan Settled', description: 'Fully repaid a financing contract.', icon: 'check-circle-2', tier: 'gold' },
]

export interface Achievement {
  id: string
  userId: string
  code: AchievementCode
  title: string
  description: string
  icon: string
  tier: AchievementTier
  earnedAt: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface PaymentStreakBreak {
  brokenAt: string
  previousStreak: number
  reason?: string
}

export interface PaymentStreak {
  id: string
  userId: string
  currentStreak: number
  longestStreak: number
  lastPaymentMonth?: string
  lastPaymentAt?: string
  streakStartedAt?: string
  breaks: PaymentStreakBreak[]
  createdAt: string
  updatedAt: string
}

export interface StreakLeaderboardEntry {
  userId: string
  displayName: string
  longestStreak: number
  currentStreak: number
  tier: AchievementTier
}

// --- API Types ---

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  phone: string
  password: string
  firstName: string
  lastName: string
  role: UserRole
}

export interface AuthResponse {
  user: User
  token: string
  refreshToken: string
}

// --- Insurance ---

export type InsuranceCategory =
  | 'renters'
  | 'landlord'
  | 'rent_guarantee'
  | 'property_damage'
  | 'tenant_default'

export type InsurancePolicyStatus = 'pending' | 'active' | 'lapsed' | 'cancelled' | 'claimed'

export type InsuranceClaimStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface InsuranceProduct {
  id: string
  providerId: string
  providerName: string
  productName: string
  category: InsuranceCategory
  description: string
  coverageDetails: string
  monthlyPremium: number
  coverageLimit: number
  excessAmount: number
  terms: string
  active: boolean
  commissionPct: number
  createdAt: string
  updatedAt: string
}

export interface InsuranceClaim {
  id: string
  filedAt: string
  amount: number
  status: InsuranceClaimStatus
  description: string
  notes?: string
  payoutAmount?: number
  decidedBy?: string
  decidedAt?: string
}

export interface InsurancePolicy {
  id: string
  userId: string
  productId: string
  agreementId?: string
  propertyId?: string
  startDate: string
  endDate: string
  monthlyPremium: number
  status: InsurancePolicyStatus
  policyNumber: string
  lastPaidAt?: string
  claims: InsuranceClaim[]
  createdAt: string
  updatedAt: string
}
