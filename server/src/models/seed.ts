import bcrypt from 'bcryptjs'
import { config } from '../config/index.js'
import { User } from './User.js'
import { Property } from './Property.js'
import { Agreement } from './Agreement.js'
import { Payment } from './Payment.js'
import { SavingsPlan } from './SavingsPlan.js'
import { Wallet } from './Wallet.js'
import { Dispute } from './Dispute.js'
import { LegalArticle } from './LegalArticle.js'
import { Notification } from './Notification.js'
import { BlogPost } from './BlogPost.js'
import { TenantProfile } from './TenantProfile.js'
import { CreditScore } from './CreditScore.js'
import { Review } from './Review.js'
import { Loan } from './Loan.js'
import { Investment } from './Investment.js'
import { Conversation, Message } from './Conversation.js'
import { Application } from './Application.js'
import { Favorite } from './Favorite.js'
import { ProfileAccess } from './ProfileAccess.js'
import { Invitation } from './Invitation.js'
import { DocumentModel } from './Document.js'
import { AuditLog } from './AuditLog.js'
import { SubscriptionPackage } from './SubscriptionPackage.js'
import { FinancingOffer } from './FinancingOffer.js'
import { FinancingApplication } from './FinancingApplication.js'
import { FinancingContract } from './FinancingContract.js'
import { Employer } from './Employer.js'
import { Employment } from './Employment.js'
import { DeductionMandate } from './DeductionMandate.js'
import { PayrollRun } from './PayrollRun.js'
import { Worker } from './Worker.js'
import { ServiceBooking } from './ServiceBooking.js'
import { MaintenanceRequest } from './MaintenanceRequest.js'
import { MoveOut } from './MoveOut.js'
import { PaymentStreak } from './PaymentStreak.js'
import { Achievement } from './Achievement.js'
import { buildAmortizationSchedule } from '../services/financing.js'
import crypto2 from 'crypto'

// ─── Helpers ───

function ref() {
  return `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function _pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function _addDays(d: string, n: number) {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + n)
  return dt.toISOString().slice(0, 10)
}

export async function seedDatabase() {
  const userCount = await User.countDocuments()
  if (userCount > 0) {
    console.log('Database already seeded, skipping.')
    return
  }

  console.log('Seeding comprehensive demo data...')
  const hash = await bcrypt.hash('password123', config.bcryptRounds)
  // Real owner super-admin — distinct password from the shared demo hash.
  const ownerHash = await bcrypt.hash('1945@Berlinbunker', config.bcryptRounds)
  const now = new Date().toISOString()

  // ════════════════════════════════════════════
  // USERS — 18 accounts covering all roles
  // ════════════════════════════════════════════

  const users = await User.insertMany([
    // 8 Tenants
    { email: 'kwame@rentos.gh', phone: '0241234567', firstName: 'Kwame', lastName: 'Asante', passwordHash: hash, roles: ['tenant'], activeRole: 'tenant', isVerified: true },
    { email: 'ama@rentos.gh', phone: '0209876543', firstName: 'Ama', lastName: 'Serwaa', passwordHash: hash, roles: ['tenant'], activeRole: 'tenant', isVerified: true },
    { email: 'kofi@rentos.gh', phone: '0244567890', firstName: 'Kofi', lastName: 'Mensah', passwordHash: hash, roles: ['tenant'], activeRole: 'tenant', isVerified: true },
    { email: 'abena@rentos.gh', phone: '0203456789', firstName: 'Abena', lastName: 'Osei', passwordHash: hash, roles: ['tenant'], activeRole: 'tenant', isVerified: false },
    { email: 'akua@rentos.gh', phone: '0248881234', firstName: 'Akua', lastName: 'Amoah', passwordHash: hash, roles: ['tenant'], activeRole: 'tenant', isVerified: true },
    { email: 'yeboah@rentos.gh', phone: '0551239876', firstName: 'Yeboah', lastName: 'Frimpong', passwordHash: hash, roles: ['tenant'], activeRole: 'tenant', isVerified: true },
    { email: 'nii@rentos.gh', phone: '0267778888', firstName: 'Nii', lastName: 'Armah', passwordHash: hash, roles: ['tenant'], activeRole: 'tenant', isVerified: true },
    { email: 'serwa@rentos.gh', phone: '0209991111', firstName: 'Serwa', lastName: 'Badu', passwordHash: hash, roles: ['tenant'], activeRole: 'tenant', isVerified: false },
    // 4 Landlords
    { email: 'yaw@rentos.gh', phone: '0551112222', firstName: 'Yaw', lastName: 'Boateng', passwordHash: hash, roles: ['landlord'], activeRole: 'landlord', isVerified: true },
    { email: 'adjoa@rentos.gh', phone: '0557778888', firstName: 'Adjoa', lastName: 'Darko', passwordHash: hash, roles: ['landlord'], activeRole: 'landlord', isVerified: true },
    { email: 'kwaku@rentos.gh', phone: '0243335555', firstName: 'Kwaku', lastName: 'Agyemang', passwordHash: hash, roles: ['landlord'], activeRole: 'landlord', isVerified: true },
    { email: 'efua@rentos.gh', phone: '0558884444', firstName: 'Efua', lastName: 'Nyarko', passwordHash: hash, roles: ['landlord'], activeRole: 'landlord', isVerified: true },
    // 2 Property Managers
    { email: 'manager@rentos.gh', phone: '0249991111', firstName: 'Nana', lastName: 'Appiah', passwordHash: hash, roles: ['property_manager', 'landlord'], activeRole: 'property_manager', isVerified: true },
    { email: 'kwadwo@rentos.gh', phone: '0244002233', firstName: 'Kwadwo', lastName: 'Mensah', passwordHash: hash, roles: ['property_manager', 'landlord'], activeRole: 'property_manager', isVerified: true },
    // Government, Legal, Admin
    { email: 'gov@rentos.gh', phone: '0301234567', firstName: 'Akosua', lastName: 'Mensah', passwordHash: hash, roles: ['government'], activeRole: 'government', isVerified: true, permissions: [
      'users:view',
      'properties:view', 'properties:review',
      'agreements:view', 'payments:view',
      'disputes:view', 'disputes:manage', 'disputes:assign',
      'analytics:view', 'analytics:export',
      'blog:view', 'blog:create', 'blog:edit',
      'legal:view', 'legal:create', 'legal:edit',
      'simulation:run', 'system:audit_logs',
    ] },
    { email: 'legal@rentos.gh', phone: '0302345678', firstName: 'Kwesi', lastName: 'Owusu', passwordHash: hash, roles: ['legal_officer'], activeRole: 'legal_officer', isVerified: true, permissions: [
      'users:view',
      'properties:view', 'agreements:view', 'payments:view',
      'disputes:view', 'disputes:manage',
      'analytics:view',
      'blog:view', 'blog:create', 'blog:edit',
      'legal:view', 'legal:create', 'legal:edit',
    ] },
    { email: 'admin@rentos.gh', phone: '0300000000', firstName: 'Admin', lastName: 'RentOS', passwordHash: hash, roles: ['admin'], activeRole: 'admin', isVerified: true, permissions: [
      'users:view', 'users:create', 'users:edit', 'users:invite',
      'properties:view', 'properties:edit', 'properties:review',
      'agreements:view', 'payments:view', 'payments:process',
      'disputes:view', 'disputes:manage',
      'analytics:view', 'blog:view', 'blog:create', 'blog:edit', 'blog:delete',
      'legal:view', 'simulation:run',
      'subscriptions:view', 'subscriptions:manage',
    ] },
    { email: 'ofi@rentos.gh', phone: '0300000002', firstName: 'Ofi', lastName: 'Mensah', passwordHash: hash, roles: ['admin'], activeRole: 'admin', isVerified: true, permissions: [
      'users:view', 'users:create', 'users:edit', 'users:invite', 'users:manage_permissions',
      'properties:view', 'properties:edit', 'properties:delete', 'properties:review',
      'agreements:view', 'agreements:edit',
      'payments:view', 'payments:process', 'payments:refund',
      'disputes:view', 'disputes:manage', 'disputes:assign',
      'analytics:view', 'analytics:export',
      'blog:view', 'blog:create', 'blog:edit', 'blog:delete',
      'legal:view', 'legal:create', 'legal:edit',
      'simulation:run', 'system:settings', 'system:audit_logs',
      'subscriptions:view', 'subscriptions:manage',
    ] },
    { email: 'superadmin@rentos.gh', phone: '0300000001', firstName: 'Super', lastName: 'Admin', passwordHash: hash, roles: ['super_admin'], activeRole: 'super_admin', isVerified: true, permissions: [] },
    // Owner super-admin (real account).
    { email: 'hayfordstanley@gmail.com', phone: '0300000009', firstName: 'Stanley', lastName: 'Hayford', passwordHash: ownerHash, roles: ['super_admin'], activeRole: 'super_admin', isVerified: true, permissions: [] },
    // Financiers (lenders) — pay landlord upfront, collect from tenant
    { email: 'bloom@rentos.gh', phone: '0302456789', firstName: 'Bloom', lastName: 'Capital', passwordHash: hash, roles: ['financier'], activeRole: 'financier', isVerified: true, permissions: [
      'users:view', 'agreements:view', 'payments:view',
      'financing:view', 'financing:offer', 'financing:approve',
      'financing:disburse', 'financing:collect', 'financing:default_manage',
      'analytics:view',
    ] },
    { email: 'rentplus@rentos.gh', phone: '0302987654', firstName: 'RentPlus', lastName: 'Finance', passwordHash: hash, roles: ['financier'], activeRole: 'financier', isVerified: true, permissions: [
      'users:view', 'agreements:view', 'payments:view',
      'financing:view', 'financing:offer', 'financing:approve',
      'financing:disburse', 'financing:collect',
      'analytics:view',
    ] },
    // Employers — payroll-deduction partners
    { email: 'mtn-hr@rentos.gh', phone: '0244111000', firstName: 'MTN', lastName: 'Ghana HR', passwordHash: hash, roles: ['employer'], activeRole: 'employer', isVerified: true, permissions: [
      'users:view',
      'employer:view_employees', 'employer:invite_employees',
      'employer:configure_deductions', 'employer:approve_deductions',
      'employer:run_payroll', 'employer:disburse', 'employer:view_payroll_reports',
    ] },
    { email: 'ucc-hr@rentos.gh', phone: '0244222000', firstName: 'UCC', lastName: 'HR', passwordHash: hash, roles: ['employer'], activeRole: 'employer', isVerified: true, permissions: [
      'users:view',
      'employer:view_employees', 'employer:invite_employees',
      'employer:configure_deductions', 'employer:approve_deductions',
      'employer:run_payroll', 'employer:disburse', 'employer:view_payroll_reports',
    ] },
  ])

  const [tenant1, tenant2, tenant3, tenant4, tenant5, tenant6, tenant7, tenant8,
    landlord1, landlord2, landlord3, landlord4,
    manager1, manager2,
    gov, legal, admin, ofiAdmin, superAdmin,
    financier1, financier2,
    employerOwner1, employerOwner2] = users

  const t1 = tenant1._id.toString()
  const t2 = tenant2._id.toString()
  const t3 = tenant3._id.toString()
  const t4 = tenant4._id.toString()
  const t5 = tenant5._id.toString()
  const t6 = tenant6._id.toString()
  const t7 = tenant7._id.toString()
  const t8 = tenant8._id.toString()
  const l1 = landlord1._id.toString()
  const l2 = landlord2._id.toString()
  const l3 = landlord3._id.toString()
  const l4 = landlord4._id.toString()
  const pm1 = manager1._id.toString()
  const pm2 = manager2._id.toString()

  // ════════════════════════════════════════════
  // SUBSCRIPTION PACKAGES
  // ════════════════════════════════════════════

  const packages = await SubscriptionPackage.insertMany([
    {
      name: 'Starter',
      slug: 'starter',
      description: 'Perfect for individual landlords just getting started',
      price: 0,
      billingCycle: 'monthly',
      maxProperties: 3,
      benefits: ['List up to 3 properties', 'Basic analytics', 'Email support', 'Standard listing visibility'],
      isActive: true,
      isDefault: true,
      sortOrder: 0,
    },
    {
      name: 'Professional',
      slug: 'professional',
      description: 'For growing landlords managing multiple properties',
      price: 50,
      billingCycle: 'monthly',
      maxProperties: 10,
      benefits: ['List up to 10 properties', 'Advanced analytics', 'Priority support', 'Featured listings', 'Tenant screening tools'],
      isActive: true,
      isDefault: false,
      sortOrder: 1,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Unlimited properties for property management companies',
      price: 150,
      billingCycle: 'monthly',
      maxProperties: -1,
      benefits: ['Unlimited properties', 'Full analytics suite', 'Dedicated account manager', 'API access', 'Custom branding', 'Bulk operations'],
      isActive: true,
      isDefault: false,
      sortOrder: 2,
    },
  ])

  const [starterPkg, proPkg, enterprisePkg] = packages
  const subStart = new Date()
  const subEnd = new Date()
  subEnd.setMonth(subEnd.getMonth() + 1)

  // Assign starter package to landlords 1-3, pro to landlord 4, enterprise to managers
  await User.updateMany(
    { _id: { $in: [landlord1._id, landlord2._id, landlord3._id] } },
    { subscriptionPackageId: starterPkg._id.toString(), subscriptionStartDate: subStart, subscriptionEndDate: subEnd },
  )
  await User.updateOne(
    { _id: landlord4._id },
    { subscriptionPackageId: proPkg._id.toString(), subscriptionStartDate: subStart, subscriptionEndDate: subEnd },
  )
  await User.updateMany(
    { _id: { $in: [manager1._id, manager2._id] } },
    { subscriptionPackageId: enterprisePkg._id.toString(), subscriptionStartDate: subStart, subscriptionEndDate: subEnd },
  )

  // ════════════════════════════════════════════
  // WALLETS — one per user
  // ════════════════════════════════════════════

  function txn(type: string, amount: number, description: string, createdAt: string, balanceAfter: number) {
    return { type, amount, description, createdAt, balanceAfter, reference: `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` }
  }

  const walletData = [
    { userId: t1, balance: 8750, transactions: [
      txn('deposit', 5000, 'MTN MoMo deposit', '2025-10-15', 5000),
      txn('deposit', 3000, 'MTN MoMo deposit', '2025-12-01', 8000),
      txn('deposit', 2000, 'Bank transfer deposit', '2026-01-10', 10000),
      txn('withdrawal', 1250, 'Rent contribution', '2026-02-01', 8750),
    ]},
    { userId: t2, balance: 3200, transactions: [
      txn('deposit', 2000, 'Telecel Cash deposit', '2025-11-05', 2000),
      txn('deposit', 1500, 'Telecel Cash deposit', '2026-01-20', 3500),
      txn('withdrawal', 300, 'Savings contribution', '2026-02-15', 3200),
    ]},
    { userId: t3, balance: 12500, transactions: [
      txn('deposit', 8000, 'Bank transfer deposit', '2025-09-01', 8000),
      txn('deposit', 5000, 'MTN MoMo deposit', '2026-01-01', 13000),
      txn('withdrawal', 500, 'Rent payment', '2026-03-01', 12500),
    ]},
    { userId: t4, balance: 500, transactions: [
      txn('deposit', 500, 'AirtelTigo Money deposit', '2026-03-01', 500),
    ]},
    { userId: t5, balance: 6400, transactions: [
      txn('deposit', 4000, 'MTN MoMo deposit', '2025-11-01', 4000),
      txn('deposit', 3000, 'Bank transfer deposit', '2026-01-15', 7000),
      txn('withdrawal', 600, 'Rent payment', '2026-02-01', 6400),
    ]},
    { userId: t6, balance: 15200, transactions: [
      txn('deposit', 10000, 'Bank transfer deposit', '2025-08-01', 10000),
      txn('deposit', 6000, 'MTN MoMo deposit', '2025-12-15', 16000),
      txn('withdrawal', 800, 'Savings contribution', '2026-03-01', 15200),
    ]},
    { userId: t7, balance: 2100, transactions: [
      txn('deposit', 1500, 'Telecel Cash deposit', '2026-01-10', 1500),
      txn('deposit', 1000, 'MTN MoMo deposit', '2026-02-20', 2500),
      txn('withdrawal', 400, 'Rent payment', '2026-03-05', 2100),
    ]},
    { userId: t8, balance: 350, transactions: [
      txn('deposit', 350, 'AirtelTigo Money deposit', '2026-03-10', 350),
    ]},
    { userId: l1, balance: 45000, transactions: [
      txn('deposit', 18000, 'Rent collection Oct-Dec', '2025-12-31', 18000),
      txn('deposit', 18000, 'Rent collection Jan-Mar', '2026-03-15', 36000),
      txn('withdrawal', 5000, 'Maintenance expense', '2026-02-10', 31000),
      txn('deposit', 14000, 'Rent collection Q1', '2026-03-20', 45000),
    ]},
    { userId: l2, balance: 22000, transactions: [
      txn('deposit', 12000, 'Rent collection', '2025-12-31', 12000),
      txn('deposit', 10000, 'Rent collection', '2026-03-01', 22000),
    ]},
    { userId: l3, balance: 38000, transactions: [
      txn('deposit', 20000, 'Rent collection', '2025-12-31', 20000),
      txn('deposit', 18000, 'Rent collection Q1', '2026-03-15', 38000),
    ]},
    { userId: l4, balance: 16500, transactions: [
      txn('deposit', 9000, 'Rent collection', '2025-12-31', 9000),
      txn('deposit', 7500, 'Rent collection', '2026-03-01', 16500),
    ]},
    { userId: pm1, balance: 8500, transactions: [] },
    { userId: pm2, balance: 5200, transactions: [
      txn('deposit', 5200, 'Management fees', '2026-03-01', 5200),
    ]},
    { userId: gov._id.toString(), balance: 0, transactions: [] },
    { userId: legal._id.toString(), balance: 0, transactions: [] },
    { userId: admin._id.toString(), balance: 0, transactions: [] },
    { userId: ofiAdmin._id.toString(), balance: 0, transactions: [] },
    { userId: superAdmin._id.toString(), balance: 0, transactions: [] },
  ]
  await Wallet.insertMany(walletData)

  // ════════════════════════════════════════════
  // PROPERTIES — 30 diverse listings across Ghana (all with images)
  // ════════════════════════════════════════════

  const props = await Property.insertMany([
    // ── Landlord 1 — Yaw Boateng (8 properties) ──

    { landlordId: l1, title: '2-Bedroom Apartment in East Legon', description: 'Spacious 2-bedroom apartment with modern finishes, tiled floors, and a large balcony overlooking the garden. Gated community with 24-hour security.', type: 'apartment', status: 'under_dispute', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'], address: { street: '14 Jungle Road', city: 'Accra', region: 'Greater Accra', digitalAddress: 'GA-456-7890', neighborhood: 'East Legon' }, rentAmount: 3000, rentDurationMonths: 12, advanceMonths: 3, bedrooms: 2, bathrooms: 2, furnished: false, floorArea: 95, parkingSpaces: 1, yearBuilt: 2019, rules: ['No pets allowed', 'No loud music after 10pm', 'Visitors must sign in at reception'], amenities: ['Water', 'Electricity', 'Parking', 'Security', '24hr Water', 'Balcony'], views: 342, inquiries: 28, favorites: 15, preferences: { minCreditScore: 50, minIncomeMultiple: 3, maxOccupants: 4, allowSmokers: false, allowPets: false, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 22, maxAge: 55, requireReferences: true, requireEmploymentProof: true, requireProfileComplete: true } },

    { landlordId: l1, title: 'Studio Apartment in Cantonments', description: 'Cozy studio apartment in Cantonments, perfect for young professionals. Close to Oxford Street and major shops. Modern kitchen and bathroom.', type: 'studio', status: 'occupied', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800', 'https://images.unsplash.com/photo-1630699144867-37acec97df5a?w=800', 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800'], address: { street: '8 Sixth Street', city: 'Accra', region: 'Greater Accra', digitalAddress: 'GA-123-4567', neighborhood: 'Cantonments' }, rentAmount: 1800, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 1, bathrooms: 1, furnished: true, floorArea: 45, parkingSpaces: 0, yearBuilt: 2021, rules: ['No subletting', 'No smoking indoors'], amenities: ['Water', 'Electricity', 'WiFi', 'AC', 'Laundry'], views: 567, inquiries: 45, favorites: 32, preferences: { minCreditScore: 40, minIncomeMultiple: 2.5, maxOccupants: 2, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 21, maxAge: 40, requireReferences: false, requireEmploymentProof: true, requireProfileComplete: false } },

    { landlordId: l1, title: '3-Bedroom House in Spintex', description: 'Beautiful detached 3-bedroom house in Spintex with a large compound, garage, and servant quarters. Quiet neighborhood ideal for families.', type: 'house', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800'], address: { street: '45 Coastal Road', city: 'Accra', region: 'Greater Accra', neighborhood: 'Spintex' }, rentAmount: 5000, rentDurationMonths: 24, advanceMonths: 6, bedrooms: 3, bathrooms: 3, furnished: false, floorArea: 180, parkingSpaces: 2, yearBuilt: 2017, rules: ['Tenant responsible for garden maintenance', 'No commercial activities'], amenities: ['Water', 'Electricity', 'Garage', 'Garden', 'Security', 'Generator', 'CCTV'], views: 213, inquiries: 12, favorites: 8, preferences: { minCreditScore: 60, minIncomeMultiple: 3, maxOccupants: 6, allowSmokers: false, allowPets: true, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 25, maxAge: 100, requireReferences: true, requireEmploymentProof: true, requireProfileComplete: true } },

    { landlordId: l1, title: 'Single Room Self-Contained at Osu', description: 'Affordable self-contained single room at Osu, walking distance to nightlife and restaurants. Shared compound with friendly neighbors.', type: 'room', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=800', 'https://images.unsplash.com/photo-1598928506311-c55ez633a3f3?w=800'], address: { street: '22 Oxford Street', city: 'Accra', region: 'Greater Accra', neighborhood: 'Osu' }, rentAmount: 800, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 1, bathrooms: 1, furnished: false, floorArea: 25, parkingSpaces: 0, rules: [], amenities: ['Water', 'Electricity'], views: 891, inquiries: 67, favorites: 45, preferences: { minCreditScore: 0, minIncomeMultiple: 2, maxOccupants: 2, allowSmokers: true, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 18, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l1, title: '4-Bedroom Luxury Villa at Airport Residential', description: 'Luxury 4-bedroom villa at Airport Residential with swimming pool, home cinema, and smart home features. Ideal for diplomatic or executive housing.', type: 'house', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800', 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800', 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800', 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800'], address: { street: '3 Liberation Link', city: 'Accra', region: 'Greater Accra', digitalAddress: 'GA-789-0123', neighborhood: 'Airport Residential' }, rentAmount: 8000, rentDurationMonths: 24, advanceMonths: 6, bedrooms: 4, bathrooms: 4, furnished: true, floorArea: 350, parkingSpaces: 3, yearBuilt: 2022, rules: ['No parties without prior notice', 'Pool maintenance shared'], amenities: ['Swimming Pool', 'Home Cinema', 'Smart Home', 'Garage', 'Garden', 'Security', 'Generator', 'AC', 'WiFi', 'Gym', 'CCTV', 'Balcony'], views: 156, inquiries: 5, favorites: 12, preferences: { minCreditScore: 80, minIncomeMultiple: 3, maxOccupants: 8, allowSmokers: false, allowPets: true, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 30, maxAge: 100, requireReferences: true, requireEmploymentProof: true, requireProfileComplete: true } },

    { landlordId: l1, title: 'Office Space on Ring Road', description: 'Modern open-plan office space on Ring Road, suitable for startups or small businesses. Fiber internet and conference room included.', type: 'commercial', status: 'occupied', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800', 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800', 'https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=800'], address: { street: '100 Ring Road Central', city: 'Accra', region: 'Greater Accra', neighborhood: 'Ring Road' }, rentAmount: 6500, rentDurationMonths: 24, advanceMonths: 6, bedrooms: 0, bathrooms: 2, furnished: true, floorArea: 200, parkingSpaces: 5, yearBuilt: 2020, rules: ['Business hours only', 'No food preparation in office area'], amenities: ['Fiber Internet', 'AC', 'Conference Room', 'Parking', 'Security', 'Elevator', 'CCTV'], views: 98, inquiries: 8, favorites: 3, preferences: { minCreditScore: 0, minIncomeMultiple: 0, maxOccupants: 30, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 18, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l1, title: '1-Bedroom at Dzorwulu', description: 'Compact 1-bedroom apartment in Dzorwulu, close to the motorway. Ideal for single professionals. Comes with a fitted kitchen and tiled bathroom.', type: 'apartment', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800', 'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800', 'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800'], address: { street: '31 Dzorwulu Highway', city: 'Accra', region: 'Greater Accra', neighborhood: 'Dzorwulu' }, rentAmount: 2200, rentDurationMonths: 12, advanceMonths: 3, bedrooms: 1, bathrooms: 1, furnished: false, floorArea: 55, parkingSpaces: 1, yearBuilt: 2020, rules: ['No smoking indoors', 'No loud music after 9pm'], amenities: ['Water', 'Electricity', 'Parking', 'Security', 'AC'], views: 278, inquiries: 19, favorites: 11, preferences: { minCreditScore: 35, minIncomeMultiple: 2.5, maxOccupants: 2, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 21, maxAge: 50, requireReferences: false, requireEmploymentProof: true, requireProfileComplete: false } },

    { landlordId: l1, title: '2-Bedroom Penthouse at Roman Ridge', description: 'Stunning penthouse apartment with panoramic views of Accra. Open-plan living, designer kitchen, rooftop terrace with jacuzzi. Premium gated estate.', type: 'apartment', status: 'occupied', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800', 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800', 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800', 'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800'], address: { street: '2 Roman Ridge Close', city: 'Accra', region: 'Greater Accra', digitalAddress: 'GA-321-6543', neighborhood: 'Roman Ridge' }, rentAmount: 7000, rentDurationMonths: 12, advanceMonths: 6, bedrooms: 2, bathrooms: 2, furnished: true, floorArea: 150, parkingSpaces: 2, yearBuilt: 2023, rules: ['No parties on rooftop without notice', 'Jacuzzi hours 7am-10pm'], amenities: ['Rooftop Terrace', 'Jacuzzi', 'AC', 'WiFi', 'Gym', 'Security', 'CCTV', 'Elevator', 'Smart Home', 'Parking', 'Generator'], views: 412, inquiries: 22, favorites: 29, preferences: { minCreditScore: 75, minIncomeMultiple: 3, maxOccupants: 3, allowSmokers: false, allowPets: true, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 28, maxAge: 60, requireReferences: true, requireEmploymentProof: true, requireProfileComplete: true } },

    // ── Landlord 2 — Adjoa Darko (6 properties) ──

    { landlordId: l2, title: '2-Bedroom Apartment in Kumasi Ahodwo', description: 'Well-maintained 2-bedroom apartment in the heart of Ahodwo. Close to Kumasi City Mall and KNUST. Ideal for students and young professionals.', type: 'apartment', status: 'occupied', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'], address: { street: '15 Ahodwo Road', city: 'Kumasi', region: 'Ashanti', neighborhood: 'Ahodwo' }, rentAmount: 1500, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 2, bathrooms: 1, furnished: false, floorArea: 75, parkingSpaces: 1, yearBuilt: 2018, rules: ['No loud music', 'Keep compound clean'], amenities: ['Water', 'Electricity', 'Parking', 'Security'], views: 432, inquiries: 35, favorites: 20, preferences: { minCreditScore: 30, minIncomeMultiple: 2, maxOccupants: 4, allowSmokers: true, allowPets: false, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 20, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l2, title: 'Townhouse in Takoradi Beach Road', description: 'Charming 3-bedroom townhouse near the beach in Takoradi. Ocean breeze, spacious compound, and modern amenities. Perfect for a family.', type: 'townhouse', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800', 'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=800', 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800'], address: { street: '7 Beach Road', city: 'Takoradi', region: 'Western', neighborhood: 'Beach Road' }, rentAmount: 2500, rentDurationMonths: 12, advanceMonths: 3, bedrooms: 3, bathrooms: 2, furnished: false, floorArea: 140, parkingSpaces: 1, yearBuilt: 2016, rules: ['Maintain garden', 'No pets in common areas'], amenities: ['Water', 'Electricity', 'Garden', 'Parking', 'Security'], views: 189, inquiries: 14, favorites: 11, preferences: { minCreditScore: 40, minIncomeMultiple: 2.5, maxOccupants: 6, allowSmokers: false, allowPets: true, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 25, maxAge: 100, requireReferences: true, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l2, title: 'Single Room at Madina Zongo', description: 'Affordable single room at Madina Zongo Junction. Walking distance to Madina market and trotro stations. Shared compound.', type: 'room', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1598928506311-c55ez633a3f3?w=800', 'https://images.unsplash.com/photo-1630699144867-37acec97df5a?w=800'], address: { street: '33 Zongo Lane', city: 'Accra', region: 'Greater Accra', neighborhood: 'Madina' }, rentAmount: 450, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 1, bathrooms: 1, furnished: false, floorArea: 18, parkingSpaces: 0, rules: [], amenities: ['Water', 'Electricity'], views: 1245, inquiries: 89, favorites: 56, preferences: { minCreditScore: 0, minIncomeMultiple: 0, maxOccupants: 2, allowSmokers: true, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 18, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l2, title: 'Furnished 1-Bedroom at Ridge', description: 'Beautifully furnished 1-bedroom apartment in Ridge. Great for expats and short-term professionals. All utilities included in rent.', type: 'apartment', stayType: 'short_stay', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800', 'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800'], address: { street: '12 Ridge Crescent', city: 'Accra', region: 'Greater Accra', neighborhood: 'Ridge' }, rentAmount: 3500, rentDurationMonths: 6, advanceMonths: 3, bedrooms: 1, bathrooms: 1, furnished: true, floorArea: 60, parkingSpaces: 1, yearBuilt: 2023, rules: ['No pets', 'No smoking indoors', 'No parties'], amenities: ['Water', 'Electricity', 'WiFi', 'AC', 'Security', 'Parking', 'Gym', 'Laundry', 'CCTV'], views: 678, inquiries: 52, favorites: 38, preferences: { minCreditScore: 50, minIncomeMultiple: 3, maxOccupants: 2, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 25, maxAge: 60, requireReferences: true, requireEmploymentProof: true, requireProfileComplete: true } },

    { landlordId: l2, title: 'Warehouse Space at Tema Industrial Area', description: 'Large warehouse space at Tema Industrial Area. 500sqm with loading dock, high ceiling, and 24-hour security. Ideal for import/export businesses.', type: 'warehouse', status: 'available', listingStatus: 'pending_review', images: ['https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800', 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800', 'https://images.unsplash.com/photo-1565610222536-ef125c59da2e?w=800'], address: { street: 'Heavy Industrial Area, Plot 45', city: 'Tema', region: 'Greater Accra', neighborhood: 'Industrial Area' }, rentAmount: 12000, rentDurationMonths: 24, advanceMonths: 6, bedrooms: 0, bathrooms: 1, furnished: false, floorArea: 500, parkingSpaces: 10, yearBuilt: 2010, rules: ['No hazardous materials without permit', 'Insurance required'], amenities: ['Electricity', 'Security', 'Parking', 'CCTV'], views: 45, inquiries: 3, favorites: 1, preferences: { minCreditScore: 0, minIncomeMultiple: 0, maxOccupants: 50, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 18, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l2, title: '3-Bedroom at Kumasi Nhyiaeso', description: 'Spacious 3-bedroom house in the quiet Nhyiaeso neighborhood. Large compound with mango trees, separate boys quarters, and reliable water supply.', type: 'house', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800', 'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800', 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800', 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800'], address: { street: '44 Nhyiaeso Road', city: 'Kumasi', region: 'Ashanti', neighborhood: 'Nhyiaeso' }, rentAmount: 2000, rentDurationMonths: 24, advanceMonths: 4, bedrooms: 3, bathrooms: 2, furnished: false, floorArea: 160, parkingSpaces: 2, yearBuilt: 2014, rules: ['Tenant responsible for compound maintenance', 'No subletting without approval'], amenities: ['Water', 'Electricity', 'Parking', 'Garden', 'Security', 'Boys Quarters'], views: 301, inquiries: 18, favorites: 13, preferences: { minCreditScore: 35, minIncomeMultiple: 2, maxOccupants: 6, allowSmokers: false, allowPets: true, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 25, maxAge: 100, requireReferences: true, requireEmploymentProof: false, requireProfileComplete: false } },

    // ── Landlord 3 — Kwaku Agyemang (6 properties) ──

    { landlordId: l3, title: 'Executive 3-Bedroom at Trasacco Valley', description: 'Premium executive 3-bedroom apartment in Trasacco Valley Estate. World-class amenities including tennis court, swimming pool, and 24-hour concierge.', type: 'apartment', status: 'occupied', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800', 'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800', 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800', 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800'], address: { street: '18 Trasacco Valley Road', city: 'Accra', region: 'Greater Accra', digitalAddress: 'GA-555-1234', neighborhood: 'East Legon Extension' }, rentAmount: 9500, rentDurationMonths: 24, advanceMonths: 6, bedrooms: 3, bathrooms: 3, furnished: true, floorArea: 220, parkingSpaces: 2, yearBuilt: 2021, rules: ['Estate rules apply', 'No modifications without approval', 'Guest registration required'], amenities: ['Swimming Pool', 'Tennis Court', 'Gym', 'AC', 'WiFi', 'Security', 'CCTV', 'Generator', 'Elevator', 'Concierge', 'Parking', 'Garden', 'Smart Home'], views: 523, inquiries: 15, favorites: 34, preferences: { minCreditScore: 80, minIncomeMultiple: 3, maxOccupants: 5, allowSmokers: false, allowPets: true, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 28, maxAge: 100, requireReferences: true, requireEmploymentProof: true, requireProfileComplete: true } },

    { landlordId: l3, title: '2-Bedroom at Dansoman Exhibition', description: 'Affordable 2-bedroom apartment near Dansoman Exhibition roundabout. Close to banks, supermarkets, and trotro stations. Newly painted with modern fittings.', type: 'apartment', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800', 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800', 'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800'], address: { street: '78 Dansoman High Street', city: 'Accra', region: 'Greater Accra', neighborhood: 'Dansoman' }, rentAmount: 1100, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 2, bathrooms: 1, furnished: false, floorArea: 65, parkingSpaces: 0, yearBuilt: 2016, rules: ['No loud music after 9pm', 'Keep stairway clean'], amenities: ['Water', 'Electricity', 'Security'], views: 756, inquiries: 55, favorites: 30, preferences: { minCreditScore: 20, minIncomeMultiple: 2, maxOccupants: 4, allowSmokers: true, allowPets: false, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 20, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l3, title: 'Shop Space at Kaneshie Market', description: 'Prime commercial shop space at Kaneshie Market. Ground floor, high foot traffic area. Suitable for retail, food service, or beauty salon.', type: 'commercial', status: 'occupied', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=800', 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800'], address: { street: 'Block B, Shop 14, Kaneshie Market', city: 'Accra', region: 'Greater Accra', neighborhood: 'Kaneshie' }, rentAmount: 2500, rentDurationMonths: 24, advanceMonths: 6, bedrooms: 0, bathrooms: 1, furnished: false, floorArea: 40, parkingSpaces: 0, yearBuilt: 2008, rules: ['Business license required', 'No structural modifications', 'Market operating hours apply'], amenities: ['Electricity', 'Security', 'Water'], views: 134, inquiries: 11, favorites: 5, preferences: { minCreditScore: 0, minIncomeMultiple: 0, maxOccupants: 10, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 18, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l3, title: '1-Bedroom at Cape Coast', description: 'Charming 1-bedroom apartment near Cape Coast Castle. Ocean views from the balcony, peaceful environment perfect for academics and researchers at UCC.', type: 'apartment', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800'], address: { street: '9 Castle Road', city: 'Cape Coast', region: 'Central', neighborhood: 'Abura' }, rentAmount: 900, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 1, bathrooms: 1, furnished: true, floorArea: 50, parkingSpaces: 0, yearBuilt: 2019, rules: ['No smoking', 'Quiet hours after 10pm'], amenities: ['Water', 'Electricity', 'WiFi', 'Balcony'], views: 198, inquiries: 16, favorites: 9, preferences: { minCreditScore: 25, minIncomeMultiple: 2, maxOccupants: 2, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 20, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l3, title: '4-Bedroom House at Tema Community 20', description: 'Spacious family house in Tema Community 20 with large compound and children\'s play area. Near international schools and the Tema motorway.', type: 'house', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800', 'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=800', 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800', 'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800'], address: { street: 'House 44, Community 20', city: 'Tema', region: 'Greater Accra', neighborhood: 'Community 20' }, rentAmount: 3800, rentDurationMonths: 24, advanceMonths: 6, bedrooms: 4, bathrooms: 3, furnished: false, floorArea: 200, parkingSpaces: 2, yearBuilt: 2018, rules: ['No commercial activities', 'Garden maintenance shared'], amenities: ['Water', 'Electricity', 'Garage', 'Garden', 'Security', 'CCTV', 'Children Playground'], views: 267, inquiries: 9, favorites: 14, preferences: { minCreditScore: 55, minIncomeMultiple: 2.5, maxOccupants: 8, allowSmokers: false, allowPets: true, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 28, maxAge: 100, requireReferences: true, requireEmploymentProof: true, requireProfileComplete: false } },

    { landlordId: l3, title: 'Furnished Studio at Osu RE', description: 'Trendy furnished studio in the heart of Osu RE. Minutes from Frankies, Starbites, and popular nightlife spots. Perfect for short-stay or young professionals.', type: 'studio', stayType: 'short_stay', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=800', 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'], address: { street: '15 Ring Road Extension', city: 'Accra', region: 'Greater Accra', neighborhood: 'Osu' }, rentAmount: 2000, rentDurationMonths: 6, advanceMonths: 3, bedrooms: 1, bathrooms: 1, furnished: true, floorArea: 38, parkingSpaces: 0, yearBuilt: 2022, rules: ['No smoking indoors', 'No pets', 'No loud music'], amenities: ['WiFi', 'AC', 'Electricity', 'Water', 'Laundry', 'CCTV'], views: 834, inquiries: 60, favorites: 42, preferences: { minCreditScore: 30, minIncomeMultiple: 2, maxOccupants: 1, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 21, maxAge: 40, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    // ── Landlord 4 — Efua Nyarko (4 properties) ──

    { landlordId: l4, title: '2-Bedroom at Tamale Vittin Hotel Area', description: 'Modern 2-bedroom apartment in Tamale near Vittin Hotel. Northern region\'s finest rental accommodation with backup water and generator.', type: 'apartment', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'], address: { street: '23 Vittin Estate Road', city: 'Tamale', region: 'Northern', neighborhood: 'Vittin' }, rentAmount: 1200, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 2, bathrooms: 1, furnished: false, floorArea: 70, parkingSpaces: 1, yearBuilt: 2020, rules: ['No loud music', 'Compound cleaning on Saturdays'], amenities: ['Water', 'Electricity', 'Parking', 'Generator', 'Security'], views: 167, inquiries: 21, favorites: 8, preferences: { minCreditScore: 20, minIncomeMultiple: 2, maxOccupants: 4, allowSmokers: false, allowPets: false, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 20, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l4, title: 'Chamber and Hall at Ho', description: 'Clean and spacious chamber and hall in Ho, Volta Region. Close to Ho Polytechnic and the central market. Peaceful, tree-lined street.', type: 'room', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=800', 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800'], address: { street: '12 Market Road', city: 'Ho', region: 'Volta', neighborhood: 'Central' }, rentAmount: 400, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 1, bathrooms: 1, furnished: false, floorArea: 30, parkingSpaces: 0, yearBuilt: 2015, rules: [], amenities: ['Water', 'Electricity'], views: 543, inquiries: 42, favorites: 18, preferences: { minCreditScore: 0, minIncomeMultiple: 0, maxOccupants: 2, allowSmokers: true, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 18, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l4, title: '3-Bedroom Semi-Detached at Sunyani', description: 'Semi-detached 3-bedroom house in Sunyani with large backyard and garage. Family-friendly neighborhood near Sunyani Technical University.', type: 'house', status: 'occupied', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800', 'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800'], address: { street: '55 Nkrumah Road', city: 'Sunyani', region: 'Bono', neighborhood: 'New Town' }, rentAmount: 1800, rentDurationMonths: 24, advanceMonths: 4, bedrooms: 3, bathrooms: 2, furnished: false, floorArea: 130, parkingSpaces: 1, yearBuilt: 2017, rules: ['No commercial activities', 'Maintain garden'], amenities: ['Water', 'Electricity', 'Parking', 'Garden', 'Security'], views: 124, inquiries: 7, favorites: 5, preferences: { minCreditScore: 35, minIncomeMultiple: 2, maxOccupants: 6, allowSmokers: false, allowPets: true, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 25, maxAge: 100, requireReferences: true, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: l4, title: '1-Bedroom Serviced Apartment at Airport Area', description: 'Fully serviced 1-bedroom apartment near Kotoka International Airport. Daily cleaning, WiFi, DSTV, and airport shuttle included. Perfect for business travelers.', type: 'apartment', stayType: 'short_stay', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800', 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800', 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800', 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800'], address: { street: '5 Airport Bypass Road', city: 'Accra', region: 'Greater Accra', digitalAddress: 'GA-888-4321', neighborhood: 'Airport Area' }, rentAmount: 4500, rentDurationMonths: 3, advanceMonths: 1, bedrooms: 1, bathrooms: 1, furnished: true, floorArea: 55, parkingSpaces: 1, yearBuilt: 2024, rules: ['Check-in after 2pm', 'Check-out by 12pm', 'No smoking'], amenities: ['WiFi', 'AC', 'DSTV', 'Laundry', 'Cleaning Service', 'Airport Shuttle', 'Security', 'CCTV', 'Gym', 'Parking'], views: 912, inquiries: 78, favorites: 55, preferences: { minCreditScore: 0, minIncomeMultiple: 0, maxOccupants: 2, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 21, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    // ── Property Manager 1 — Nana Appiah (4 properties) ──

    { landlordId: pm1, title: '3-Bedroom Flat at Tema Community 25', description: 'Newly built 3-bedroom flat in Tema Community 25. Spacious layout, modern finishes, and 24-hour water supply. Family-friendly neighborhood.', type: 'apartment', status: 'occupied', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800', 'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800', 'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800'], address: { street: 'Block C, House 12', city: 'Tema', region: 'Greater Accra', neighborhood: 'Community 25' }, rentAmount: 2200, rentDurationMonths: 12, advanceMonths: 3, bedrooms: 3, bathrooms: 2, furnished: false, floorArea: 120, parkingSpaces: 1, yearBuilt: 2024, rules: ['No loud music after 9pm', 'Trash disposal by 7am'], amenities: ['Water', '24hr Water', 'Electricity', 'Parking', 'Security', 'Garden'], views: 312, inquiries: 22, favorites: 16, preferences: { minCreditScore: 45, minIncomeMultiple: 2.5, maxOccupants: 5, allowSmokers: false, allowPets: true, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 23, maxAge: 100, requireReferences: true, requireEmploymentProof: true, requireProfileComplete: false } },

    { landlordId: pm1, title: 'Executive 2-Bedroom at Labone', description: 'Premium 2-bedroom apartment in Labone with rooftop access, gym, and concierge service. High-end finishes throughout.', type: 'apartment', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800', 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800', 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800'], address: { street: '5 Labone Crescent', city: 'Accra', region: 'Greater Accra', neighborhood: 'Labone' }, rentAmount: 4500, rentDurationMonths: 12, advanceMonths: 6, bedrooms: 2, bathrooms: 2, furnished: true, floorArea: 110, parkingSpaces: 2, yearBuilt: 2024, rules: ['No pets over 10kg', 'Gym hours 6am-10pm'], amenities: ['Water', 'Electricity', 'WiFi', 'AC', 'Security', 'Parking', 'Gym', 'Elevator', 'CCTV', 'Balcony', 'Laundry'], views: 445, inquiries: 30, favorites: 25, preferences: { minCreditScore: 65, minIncomeMultiple: 3, maxOccupants: 3, allowSmokers: false, allowPets: true, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 25, maxAge: 100, requireReferences: true, requireEmploymentProof: true, requireProfileComplete: true } },

    { landlordId: pm1, title: 'Student Room near KNUST', description: 'Affordable single room ideal for KNUST students. Walking distance to campus gate. Shared kitchen and bathroom. Quiet study environment.', type: 'room', status: 'available', listingStatus: 'draft', images: ['https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=800', 'https://images.unsplash.com/photo-1630699144867-37acec97df5a?w=800'], address: { street: '18 University Road', city: 'Kumasi', region: 'Ashanti', neighborhood: 'Ayeduase' }, rentAmount: 350, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 1, bathrooms: 1, furnished: false, floorArea: 15, parkingSpaces: 0, rules: ['No noise after 9pm', 'No cooking in rooms', 'Visitors leave by 8pm'], amenities: ['Water', 'Electricity'], views: 2100, inquiries: 150, favorites: 89, preferences: { minCreditScore: 0, minIncomeMultiple: 0, maxOccupants: 1, allowSmokers: false, allowPets: false, allowChildren: false, preferredEmployment: ['student'], preferredGender: 'any', minAge: 18, maxAge: 30, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: pm1, title: '2-Bedroom at Achimota', description: 'Affordable 2-bedroom apartment at Achimota. Close to Achimota mall and major bus routes. Secure gated compound.', type: 'apartment', status: 'maintenance_required', listingStatus: 'pending_review', images: ['https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'], address: { street: '67 Achimota Road', city: 'Accra', region: 'Greater Accra', neighborhood: 'Achimota' }, rentAmount: 1200, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 2, bathrooms: 1, furnished: false, floorArea: 70, parkingSpaces: 1, yearBuilt: 2015, rules: ['No subletting'], amenities: ['Water', 'Electricity', 'Parking', 'Security'], views: 367, inquiries: 28, favorites: 14, preferences: { minCreditScore: 20, minIncomeMultiple: 2, maxOccupants: 4, allowSmokers: true, allowPets: false, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 20, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    // ── Property Manager 2 — Kwadwo Mensah (2 properties) ──

    { landlordId: pm2, title: '2-Bedroom Apartment at Kasoa New Market', description: 'Newly constructed 2-bedroom apartment near Kasoa New Market. Ground floor unit with private porch. Tiled throughout with fitted kitchen cabinets.', type: 'apartment', status: 'occupied', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800', 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800', 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800'], address: { street: '102 Market Street', city: 'Kasoa', region: 'Central', neighborhood: 'New Market' }, rentAmount: 950, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 2, bathrooms: 1, furnished: false, floorArea: 68, parkingSpaces: 0, yearBuilt: 2023, rules: ['No subletting', 'Compound cleaning rotation'], amenities: ['Water', 'Electricity', 'Security'], views: 589, inquiries: 44, favorites: 22, preferences: { minCreditScore: 15, minIncomeMultiple: 2, maxOccupants: 4, allowSmokers: true, allowPets: false, allowChildren: true, preferredEmployment: [], preferredGender: 'any', minAge: 20, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },

    { landlordId: pm2, title: '1-Bedroom at Teshie-Nungua', description: 'Cozy 1-bedroom apartment at Teshie-Nungua with ocean breeze. Close to the beach and local markets. Ideal for singles or couples.', type: 'apartment', status: 'available', listingStatus: 'approved', images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800', 'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800'], address: { street: '24 Beach Lane', city: 'Accra', region: 'Greater Accra', neighborhood: 'Teshie-Nungua' }, rentAmount: 750, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 1, bathrooms: 1, furnished: false, floorArea: 40, parkingSpaces: 0, yearBuilt: 2018, rules: ['No pets', 'Keep compound clean'], amenities: ['Water', 'Electricity'], views: 423, inquiries: 33, favorites: 17, preferences: { minCreditScore: 0, minIncomeMultiple: 2, maxOccupants: 2, allowSmokers: true, allowPets: false, allowChildren: false, preferredEmployment: [], preferredGender: 'any', minAge: 18, maxAge: 100, requireReferences: false, requireEmploymentProof: false, requireProfileComplete: false } },
  ])

  // ════════════════════════════════════════════
  // AGREEMENTS — 12 contracts in various states
  // ════════════════════════════════════════════

  const agreements = await Agreement.insertMany([
    // Kwame @ East Legon apt — active
    { propertyId: props[0]._id.toString(), landlordId: l1, tenantId: t1, status: 'active', startDate: '2025-06-01', endDate: '2026-06-01', rentAmount: 3000, securityDeposit: 1500, advanceMonths: 3, terms: ['Tenant responsible for utility bills', 'No subletting allowed', 'Rent due on 1st of each month', 'Landlord provides 24-hour security'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
    // Ama @ Studio Cantonments — active
    { propertyId: props[1]._id.toString(), landlordId: l1, tenantId: t2, status: 'active', startDate: '2025-09-01', endDate: '2026-09-01', rentAmount: 1800, securityDeposit: 900, advanceMonths: 2, terms: ['Tenant responsible for utility bills', 'WiFi included in rent', 'Furnished inventory attached'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
    // Kofi @ Kumasi apt — active
    { propertyId: props[8]._id.toString(), landlordId: l2, tenantId: t3, status: 'active', startDate: '2025-04-01', endDate: '2026-04-01', rentAmount: 1500, securityDeposit: 750, advanceMonths: 2, terms: ['Tenant responsible for utility bills', 'Compound cleaning shared'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
    // Kofi @ Office space — active (business)
    { propertyId: props[5]._id.toString(), landlordId: l1, tenantId: t3, status: 'active', startDate: '2025-01-01', endDate: '2027-01-01', rentAmount: 6500, securityDeposit: 3000, advanceMonths: 6, terms: ['Business hours operation', 'Tenant responsible for interior maintenance', 'Annual rent review clause'], landlordSignature: now, tenantSignature: now, complianceFlags: [{ type: 'warning', message: 'Annual rent review clause may exceed legal limits', clause: 'Annual rent review clause', law: 'Rent Act 1963 S.25' }], version: 1 },
    // Abena @ Tema Community 25 — active
    { propertyId: props[26]._id.toString(), landlordId: pm1, tenantId: t4, status: 'active', startDate: '2025-11-01', endDate: '2026-11-01', rentAmount: 2200, securityDeposit: 1100, advanceMonths: 3, terms: ['Tenant responsible for utility bills', 'No modifications without approval'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
    // Kwame old agreement — expired
    { propertyId: props[3]._id.toString(), landlordId: l1, tenantId: t1, status: 'expired', startDate: '2024-01-01', endDate: '2025-01-01', rentAmount: 700, securityDeposit: 350, advanceMonths: 2, terms: ['Basic terms'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
    // Draft agreement — pending signatures (Kwame for Spintex house)
    { propertyId: props[2]._id.toString(), landlordId: l1, tenantId: t1, status: 'pending_signatures', startDate: '2026-04-01', endDate: '2028-04-01', rentAmount: 5000, securityDeposit: 2500, advanceMonths: 6, terms: ['Tenant responsible for utility bills', 'Garden maintenance shared', 'No commercial activities'], landlordSignature: now, complianceFlags: [], version: 1 },
    // Akua @ Trasacco Valley — active
    { propertyId: props[15]._id.toString(), landlordId: l3, tenantId: t5, status: 'active', startDate: '2025-08-01', endDate: '2027-08-01', rentAmount: 9500, securityDeposit: 4750, advanceMonths: 6, terms: ['Estate rules apply', 'All utilities included except electricity', 'No modifications', 'Guest registration required'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
    // Yeboah @ Roman Ridge penthouse — active
    { propertyId: props[7]._id.toString(), landlordId: l1, tenantId: t6, status: 'active', startDate: '2025-10-01', endDate: '2026-10-01', rentAmount: 7000, securityDeposit: 3500, advanceMonths: 6, terms: ['Rooftop terrace shared with one other unit', 'Jacuzzi maintenance fee included', 'No parties on rooftop without 48hr notice'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
    // Nii @ Kasoa — active
    { propertyId: props[28]._id.toString(), landlordId: pm2, tenantId: t7, status: 'active', startDate: '2025-12-01', endDate: '2026-12-01', rentAmount: 950, securityDeposit: 475, advanceMonths: 2, terms: ['Tenant responsible for utility bills', 'No subletting', 'Compound cleaning rotation'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
    // Yeboah old agreement — expired (Sunyani)
    { propertyId: props[24]._id.toString(), landlordId: l4, tenantId: t6, status: 'expired', startDate: '2023-06-01', endDate: '2025-06-01', rentAmount: 1500, securityDeposit: 750, advanceMonths: 4, terms: ['Standard terms'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
    // Serwa @ Kaneshie shop — active (commercial)
    { propertyId: props[17]._id.toString(), landlordId: l3, tenantId: t8, status: 'active', startDate: '2025-07-01', endDate: '2027-07-01', rentAmount: 2500, securityDeposit: 1250, advanceMonths: 6, terms: ['Business license required', 'Market operating hours apply', 'No structural modifications'], landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1 },
  ])

  const [agr1, agr2, agr3, agr4, agr5, , , agr8, agr9, agr10, , agr12] = agreements

  // ════════════════════════════════════════════
  // APPLICATIONS — 10 tenant rental applications
  // ════════════════════════════════════════════

  await Application.insertMany([
    // Kofi applying for the 4-Bedroom Luxury Villa — pending
    { tenantId: t3, propertyId: props[4]._id.toString(), landlordId: l1, status: 'pending', message: 'Good day Mr. Boateng. I am very interested in the Airport Residential villa. I currently run a tech company and need a spacious home for my family. I have excellent references from my current landlord.', moveInDate: new Date('2026-05-01'), duration: 24, offeredRent: 7500, createdAt: new Date('2026-03-18') },
    // Kwame approved for the Spintex house — which resulted in the pending_signatures agreement
    { tenantId: t1, propertyId: props[2]._id.toString(), landlordId: l1, status: 'approved', message: 'Hello, I would love to rent the 3-Bedroom House in Spintex. I am a responsible tenant with a solid payment history on RentOS. Looking forward to hearing from you.', moveInDate: new Date('2026-04-01'), duration: 24, landlordNotes: 'Good tenant history, approved.', respondedAt: new Date('2026-03-10'), createdAt: new Date('2026-03-05') },
    // Abena rejected for the Ridge apartment — low credit score
    { tenantId: t4, propertyId: props[11]._id.toString(), landlordId: l2, status: 'rejected', message: 'Hi Madam Darko, I saw the furnished apartment at Ridge and I am very interested. I can move in immediately and pay the full advance. Please consider my application.', moveInDate: new Date('2026-04-15'), duration: 6, offeredRent: 3500, landlordNotes: 'Credit score below minimum requirement (35 < 50). Profile incomplete.', respondedAt: new Date('2026-03-16'), createdAt: new Date('2026-03-14') },
    // Ama applying for Takoradi townhouse — pending
    { tenantId: t2, propertyId: props[9]._id.toString(), landlordId: l2, status: 'pending', message: 'Good afternoon. I am interested in the Takoradi Beach Road townhouse. I work remotely and am looking for a peaceful family home. Happy to provide references and proof of employment.', moveInDate: new Date('2026-06-01'), duration: 12, createdAt: new Date('2026-03-20') },
    // Kwame withdrew his application for the Madina room — found something better
    { tenantId: t1, propertyId: props[10]._id.toString(), landlordId: l2, status: 'withdrawn', message: 'Hi Madam Darko, I was interested in the single room at Madina for a friend. Is it still available? We can come for a viewing this weekend.', moveInDate: new Date('2026-04-01'), duration: 12, createdAt: new Date('2026-03-01') },
    // Akua applying for Labone executive — pending
    { tenantId: t5, propertyId: props[27]._id.toString(), landlordId: pm1, status: 'pending', message: 'Hello Mr. Appiah, I am a diplomat currently housed at Trasacco but looking for something more central. The Labone apartment looks perfect. Can we arrange a viewing?', moveInDate: new Date('2026-07-01'), duration: 12, offeredRent: 4500, createdAt: new Date('2026-03-19') },
    // Yeboah applying for Tema Community 20 house — pending
    { tenantId: t6, propertyId: props[19]._id.toString(), landlordId: l3, status: 'pending', message: 'Good morning. My family is relocating from Roman Ridge and we are looking for a family house in Tema. The Community 20 house would be ideal. I have excellent credit on RentOS.', moveInDate: new Date('2026-08-01'), duration: 24, offeredRent: 3500, createdAt: new Date('2026-03-20') },
    // Nii applying for Teshie-Nungua — approved
    { tenantId: t7, propertyId: props[29]._id.toString(), landlordId: pm2, status: 'approved', message: 'Hi, I work at Tema Port and need a place near the beach. The Teshie apartment looks great. I can provide employer references.', moveInDate: new Date('2026-04-15'), duration: 12, landlordNotes: 'Verified employment, good fit.', respondedAt: new Date('2026-03-18'), createdAt: new Date('2026-03-15') },
    // Serwa applying for Dansoman — rejected
    { tenantId: t8, propertyId: props[16]._id.toString(), landlordId: l3, status: 'rejected', message: 'Hello, I run a small beauty salon and need affordable housing. The Dansoman apartment would be perfect.', moveInDate: new Date('2026-04-01'), duration: 12, landlordNotes: 'Unverified account, no payment history.', respondedAt: new Date('2026-03-12'), createdAt: new Date('2026-03-10') },
    // Nii applying for Cape Coast — withdrawn (too far)
    { tenantId: t7, propertyId: props[18]._id.toString(), landlordId: l3, status: 'withdrawn', message: 'I was considering the Cape Coast apartment for a remote work setup. Is it possible to visit this weekend?', moveInDate: new Date('2026-05-01'), duration: 12, createdAt: new Date('2026-03-08') },
  ])

  // ════════════════════════════════════════════
  // PAYMENTS — realistic payment history
  // ════════════════════════════════════════════

  const paymentDocs: unknown[] = []
  // Kwame's payments (Oct 2025 - Mar 2026)
  for (const date of ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']) {
    paymentDocs.push({ agreementId: agr1._id.toString(), tenantId: t1, landlordId: l1, amount: 3000, method: 'mtn_momo', status: 'completed', reference: ref(), paidAt: date })
  }

  // Ama's payments (Nov 2025 - Mar 2026)
  for (const date of ['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']) {
    paymentDocs.push({ agreementId: agr2._id.toString(), tenantId: t2, landlordId: l1, amount: 1800, method: 'telecel_cash', status: 'completed', reference: ref(), paidAt: date })
  }

  // Kofi's payments for apartment (Jun 2025 - Mar 2026)
  for (const date of ['2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']) {
    paymentDocs.push({ agreementId: agr3._id.toString(), tenantId: t3, landlordId: l2, amount: 1500, method: 'bank_transfer', status: 'completed', reference: ref(), paidAt: date })
  }

  // Kofi's office payments (Mar 2025 - Mar 2026)
  for (const date of ['2025-03-01', '2025-04-01', '2025-05-01', '2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']) {
    paymentDocs.push({ agreementId: agr4._id.toString(), tenantId: t3, landlordId: l1, amount: 6500, method: 'bank_transfer', status: 'completed', reference: ref(), paidAt: date })
  }

  // Abena's payments (Dec 2025 - Mar 2026, one pending)
  for (const date of ['2025-12-01', '2026-01-01', '2026-02-01']) {
    paymentDocs.push({ agreementId: agr5._id.toString(), tenantId: t4, landlordId: pm1, amount: 2200, method: 'airteltigo_money', status: 'completed', reference: ref(), paidAt: date })
  }
  paymentDocs.push({ agreementId: agr5._id.toString(), tenantId: t4, landlordId: pm1, amount: 2200, method: 'mtn_momo', status: 'pending', reference: ref(), paidAt: null })

  // Akua's payments for Trasacco (Oct 2025 - Mar 2026)
  for (const date of ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']) {
    paymentDocs.push({ agreementId: agr8._id.toString(), tenantId: t5, landlordId: l3, amount: 9500, method: 'bank_transfer', status: 'completed', reference: ref(), paidAt: date })
  }

  // Yeboah's payments for Roman Ridge penthouse (Dec 2025 - Mar 2026)
  for (const date of ['2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']) {
    paymentDocs.push({ agreementId: agr9._id.toString(), tenantId: t6, landlordId: l1, amount: 7000, method: 'mtn_momo', status: 'completed', reference: ref(), paidAt: date })
  }

  // Nii's payments for Kasoa (Jan 2026 - Mar 2026)
  for (const date of ['2026-01-01', '2026-02-01', '2026-03-01']) {
    paymentDocs.push({ agreementId: agr10._id.toString(), tenantId: t7, landlordId: pm2, amount: 950, method: 'mtn_momo', status: 'completed', reference: ref(), paidAt: date })
  }

  // Serwa's payments for Kaneshie shop (Sep 2025 - Mar 2026)
  for (const date of ['2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']) {
    paymentDocs.push({ agreementId: agr12._id.toString(), tenantId: t8, landlordId: l3, amount: 2500, method: 'telecel_cash', status: 'completed', reference: ref(), paidAt: date })
  }

  // Additional payment statuses for variety
  paymentDocs.push({ agreementId: agr1._id.toString(), tenantId: t1, landlordId: l1, amount: 3000, method: 'mtn_momo', status: 'failed', reference: ref(), paidAt: null })
  paymentDocs.push({ agreementId: agr2._id.toString(), tenantId: t2, landlordId: l1, amount: 1800, method: 'telecel_cash', status: 'refunded', reference: ref(), paidAt: '2025-09-15' })
  paymentDocs.push({ agreementId: agr3._id.toString(), tenantId: t3, landlordId: l2, amount: 1500, method: 'bank_transfer', status: 'processing', reference: ref(), paidAt: null })
  paymentDocs.push({ agreementId: agr5._id.toString(), tenantId: t4, landlordId: pm1, amount: 2200, method: 'airteltigo_money', status: 'failed', reference: ref(), paidAt: null })
  paymentDocs.push({ agreementId: agr8._id.toString(), tenantId: t5, landlordId: l3, amount: 9500, method: 'bank_transfer', status: 'failed', reference: ref(), paidAt: null })
  paymentDocs.push({ agreementId: agr9._id.toString(), tenantId: t6, landlordId: l1, amount: 7000, method: 'mtn_momo', status: 'refunded', reference: ref(), paidAt: '2025-11-15' })
  paymentDocs.push({ agreementId: agr10._id.toString(), tenantId: t7, landlordId: pm2, amount: 950, method: 'telecel_cash', status: 'processing', reference: ref(), paidAt: null })

  await Payment.insertMany(paymentDocs)

  // ════════════════════════════════════════════
  // SAVINGS PLANS — 8 plans across tenants
  // ════════════════════════════════════════════

  await SavingsPlan.insertMany([
    { userId: t1, targetAmount: 15000, currentAmount: 8750, frequency: 'monthly', contributionAmount: 1500, startDate: '2025-10-01', targetDate: '2026-06-01', status: 'active', linkedPropertyId: props[0]._id.toString(), autoDebit: true },
    { userId: t1, targetAmount: 3000, currentAmount: 2100, frequency: 'weekly', contributionAmount: 300, startDate: '2026-01-01', targetDate: '2026-05-01', status: 'active', autoDebit: false },
    { userId: t2, targetAmount: 5000, currentAmount: 1800, frequency: 'monthly', contributionAmount: 500, startDate: '2025-12-01', targetDate: '2026-08-01', status: 'active', autoDebit: true },
    { userId: t3, targetAmount: 10000, currentAmount: 10000, frequency: 'monthly', contributionAmount: 2000, startDate: '2025-06-01', targetDate: '2025-11-01', status: 'completed', autoDebit: true },
    { userId: t4, targetAmount: 8000, currentAmount: 500, frequency: 'monthly', contributionAmount: 800, startDate: '2026-03-01', targetDate: '2027-01-01', status: 'active', autoDebit: false },
    { userId: t5, targetAmount: 50000, currentAmount: 28000, frequency: 'monthly', contributionAmount: 5000, startDate: '2025-08-01', targetDate: '2026-06-01', status: 'active', linkedPropertyId: props[15]._id.toString(), autoDebit: true },
    { userId: t6, targetAmount: 20000, currentAmount: 14000, frequency: 'monthly', contributionAmount: 3500, startDate: '2025-10-01', targetDate: '2026-04-01', status: 'active', autoDebit: true },
    { userId: t7, targetAmount: 4000, currentAmount: 1900, frequency: 'monthly', contributionAmount: 500, startDate: '2025-12-01', targetDate: '2026-08-01', status: 'active', autoDebit: false },
  ])

  // ════════════════════════════════════════════
  // LOANS — 8 loans covering all statuses
  // ════════════════════════════════════════════

  await Loan.insertMany([
    { userId: t1, agreementId: agr1._id.toString(), amount: 2000, interestRate: 15, tenure: 6, monthlyPayment: 348.70, totalRepayment: 2092.20, amountPaid: 1046.10, status: 'active', creditScoreAtApproval: 72, disbursedAt: '2025-12-15', reason: 'Need extra funds for rent advance deposit on new apartment' },
    { userId: t2, agreementId: agr2._id.toString(), amount: 500, interestRate: 15, tenure: 3, monthlyPayment: 172.82, totalRepayment: 518.46, amountPaid: 518.46, status: 'repaid', creditScoreAtApproval: 65, disbursedAt: '2025-10-01', reason: 'Short-term emergency — medical expenses' },
    { userId: t4, agreementId: agr5._id.toString(), amount: 1000, interestRate: 15, tenure: 4, monthlyPayment: 259.57, totalRepayment: 1038.28, amountPaid: 0, status: 'pending', reason: 'Need funds for rent deposit at new location' },
    { userId: t3, agreementId: agr3._id.toString(), amount: 3000, interestRate: 15, tenure: 6, monthlyPayment: 523.05, totalRepayment: 3138.30, amountPaid: 0, status: 'approved', creditScoreAtApproval: 85, reason: 'Bridging funds for office equipment purchase' },
    { userId: t4, agreementId: agr5._id.toString(), amount: 5000, interestRate: 15, tenure: 12, monthlyPayment: 451.29, totalRepayment: 5415.48, amountPaid: 0, status: 'rejected', reason: 'Needed help with rent and relocation costs' },
    { userId: t2, agreementId: agr2._id.toString(), amount: 1500, interestRate: 15, tenure: 6, monthlyPayment: 261.53, totalRepayment: 1569.18, amountPaid: 523.06, status: 'defaulted', creditScoreAtApproval: 58, disbursedAt: '2025-06-01', reason: 'Emergency travel expenses — family medical situation' },
    { userId: t5, agreementId: agr8._id.toString(), amount: 8000, interestRate: 15, tenure: 12, monthlyPayment: 722.06, totalRepayment: 8664.72, amountPaid: 2888.24, status: 'active', creditScoreAtApproval: 82, disbursedAt: '2025-12-01', reason: 'Vehicle repair and insurance renewal' },
    { userId: t6, agreementId: agr9._id.toString(), amount: 4000, interestRate: 15, tenure: 6, monthlyPayment: 697.40, totalRepayment: 4184.40, amountPaid: 4184.40, status: 'repaid', creditScoreAtApproval: 76, disbursedAt: '2025-09-01', reason: 'Relocation expenses from Sunyani to Accra' },
  ])

  // ════════════════════════════════════════════
  // INVESTMENTS — 10 investments covering all statuses
  // ════════════════════════════════════════════

  await Investment.insertMany([
    { userId: t1, type: 'treasury_bill', amount: 5000, interestRate: 28.5, tenure: 91, startDate: '2026-01-15', maturityDate: '2026-04-16', status: 'active', expectedReturn: 356.71, partnerId: 'databank' },
    { userId: t3, type: 'treasury_bill', amount: 10000, interestRate: 27.0, tenure: 182, startDate: '2025-10-01', maturityDate: '2026-04-01', status: 'active', expectedReturn: 1346.30, partnerId: 'databank' },
    { userId: t3, type: 'government_bond', amount: 20000, interestRate: 22.5, tenure: 365, startDate: '2025-06-01', maturityDate: '2026-06-01', status: 'active', expectedReturn: 4500, partnerId: 'stanbic' },
    { userId: t2, type: 'treasury_bill', amount: 3000, interestRate: 26.0, tenure: 91, startDate: '2025-09-01', maturityDate: '2025-12-01', status: 'matured', expectedReturn: 194.63, actualReturn: 194.63, partnerId: 'databank' },
    { userId: t3, type: 'government_bond', amount: 15000, interestRate: 21.0, tenure: 365, startDate: '2024-06-01', maturityDate: '2025-06-01', status: 'withdrawn', expectedReturn: 3150, actualReturn: 3150, partnerId: 'stanbic' },
    { userId: t1, type: 'government_bond', amount: 8000, interestRate: 23.0, tenure: 730, startDate: '2025-07-01', maturityDate: '2027-07-01', status: 'active', expectedReturn: 3680, partnerId: 'stanbic' },
    { userId: t2, type: 'treasury_bill', amount: 2000, interestRate: 29.0, tenure: 182, startDate: '2026-03-18', maturityDate: '2026-09-16', status: 'pending', expectedReturn: 289.04, partnerId: 'databank' },
    { userId: t5, type: 'treasury_bill', amount: 15000, interestRate: 28.0, tenure: 182, startDate: '2025-11-01', maturityDate: '2026-05-02', status: 'active', expectedReturn: 2093.15, partnerId: 'databank' },
    { userId: t5, type: 'government_bond', amount: 30000, interestRate: 24.0, tenure: 730, startDate: '2025-08-01', maturityDate: '2027-08-01', status: 'active', expectedReturn: 14400, partnerId: 'stanbic' },
    { userId: t6, type: 'treasury_bill', amount: 7000, interestRate: 27.5, tenure: 91, startDate: '2026-02-01', maturityDate: '2026-05-03', status: 'active', expectedReturn: 480.14, partnerId: 'databank' },
  ])

  // ════════════════════════════════════════════
  // DISPUTES — 6 disputes in various states
  // ════════════════════════════════════════════

  await Dispute.insertMany([
    { filedBy: t1, filedAgainst: l1, propertyId: props[0]._id.toString(), agreementId: agr1._id.toString(), category: 'rent_increase', status: 'under_mediation', title: 'Landlord attempting illegal mid-contract rent increase', description: 'The landlord has verbally demanded a 30% rent increase midway through our 12-month contract. This is in violation of our signed agreement and the Rent Act 1963.', evidence: [{ type: 'text', description: 'WhatsApp screenshot of landlord demanding increase' }], mediationNotes: 'Initial mediation session held on 2026-02-15. Landlord reminded of contractual obligations. Follow-up scheduled.' },
    { filedBy: t2, filedAgainst: l1, propertyId: props[1]._id.toString(), category: 'maintenance', status: 'filed', title: 'Persistent plumbing issues not addressed', description: 'The bathroom plumbing has been leaking for 3 weeks. Reported twice via messages and once in person with no action from the landlord.', evidence: [{ type: 'image', description: 'Photo of leaking pipe' }, { type: 'text', description: 'Text messages showing reports to landlord' }] },
    { filedBy: t3, filedAgainst: l1, propertyId: props[5]._id.toString(), agreementId: agr4._id.toString(), category: 'illegal_clause', status: 'resolved', title: 'Annual rent review clause exceeds legal limits', description: 'The office lease contains an annual rent review clause that allows unlimited increases. This was flagged by the compliance system.', evidence: [], mediationNotes: 'Clause amended to cap annual increase at 10%. Both parties signed addendum.', resolution: 'Agreement amended — annual increase capped at 10% as per mediation.' },
    { filedBy: t4, filedAgainst: pm1, propertyId: props[26]._id.toString(), agreementId: agr5._id.toString(), category: 'deposit_refund', status: 'escalated', title: 'Security deposit not returned after move-out inspection', description: 'I passed the move-out inspection but the property manager has not returned my security deposit of GHS 1,100 after 45 days.', evidence: [{ type: 'document', description: 'Move-out inspection report signed by manager' }], mediationNotes: 'Property manager claims deductions for cleaning. Tenant disputes. Escalated to Rent Control.' },
    { filedBy: t5, filedAgainst: l3, propertyId: props[15]._id.toString(), agreementId: agr8._id.toString(), category: 'maintenance', status: 'filed', title: 'Swimming pool not maintained for 2 months', description: 'The estate swimming pool has not been cleaned or maintained for over 2 months despite amenity fees being included in the rent. The pool is now green and unusable.', evidence: [{ type: 'image', description: 'Photo of dirty swimming pool' }, { type: 'image', description: 'Photo showing green algae buildup' }] },
    { filedBy: t7, filedAgainst: pm2, propertyId: props[28]._id.toString(), agreementId: agr10._id.toString(), category: 'eviction', status: 'filed', title: 'Landlord threatening verbal eviction without proper notice', description: 'The property manager has verbally told me to vacate within 2 weeks claiming the owner wants to renovate. No written notice has been given and my contract runs until December 2026.', evidence: [{ type: 'text', description: 'Voice note recording of verbal eviction threat' }] },
  ])

  // ════════════════════════════════════════════
  // TENANT PROFILES — 8 comprehensive profiles
  // ════════════════════════════════════════════

  await TenantProfile.insertMany([
    {
      userId: t1, dateOfBirth: '1994-03-15', gender: 'male', maritalStatus: 'single', nationality: 'Ghanaian', religion: 'christian', ethnicGroup: 'Akan', hometown: 'Kumasi', languagesSpoken: ['English', 'Twi', 'Ga'], bio: 'Software developer working remotely. Quiet, responsible tenant with a strong track record of on-time payments.',
      highestEducation: 'bachelors', institution: 'University of Ghana', fieldOfStudy: 'Computer Science', graduationYear: 2016, currentlyStudying: false,
      employmentStatus: 'employed', occupation: 'Senior Software Developer', employer: 'Hubtel', employerAddress: '11 Dzorwulu St, Accra', monthlyIncome: 12000, employmentDuration: '3_5yrs', workPhone: '0241234567',
      hasSpouse: false, hasChildren: false, numberOfDependents: 0, numberOfOccupants: 1,
      smoker: false, drinker: false, pets: false, noiseLevel: 'quiet', workSchedule: 'remote', hobbies: ['Reading', 'Football', 'Coding'], clubs: [], vehicleOwner: true, vehicleType: 'Toyota Corolla 2020',
      personalReferences: [{ name: 'Yaa Asantewaa', relationship: 'Mother', phone: '0201234567', yearsKnown: 30 }, { name: 'Kojo Mensah', relationship: 'Friend', phone: '0241111222', occupation: 'Accountant', yearsKnown: 8 }],
      professionalReferences: [{ name: 'Alex Tetteh', title: 'CTO', company: 'Hubtel', phone: '0557779999', email: 'alex@hubtel.com' }],
      previousRentals: [{ address: '22 Oxford Street', city: 'Accra', duration: '12 months', monthlyRent: 700, landlordName: 'Yaw Boateng', landlordPhone: '0551112222', reasonForLeaving: 'Needed more space', canContact: true }],
      hasBeenEvicted: false,
      emergencyContact: { name: 'Yaa Asantewaa', relationship: 'Mother', phone: '0201234567', address: 'Kumasi, Adum' },
      idType: 'ghana_card', idNumber: 'GHA-723456789-0', idVerified: true, incomeVerified: true, addressVerified: true,
      searchPreferences: { preferredRegions: ['Greater Accra'], preferredCities: ['Accra'], preferredType: ['apartment', 'house'], minBudget: 2000, maxBudget: 5000, minBedrooms: 2, needsFurnished: false, needsParking: true, preferredAmenities: ['WiFi', 'Security', 'Parking'] },
    },
    {
      userId: t2, dateOfBirth: '1997-08-22', gender: 'female', maritalStatus: 'single', nationality: 'Ghanaian', religion: 'christian', ethnicGroup: 'Ga-Dangme', hometown: 'Accra', languagesSpoken: ['English', 'Ga', 'Twi'], bio: 'Marketing professional at a fintech company. Looking for safe, convenient housing close to work.',
      highestEducation: 'bachelors', institution: 'Ashesi University', fieldOfStudy: 'Business Administration', graduationYear: 2019, currentlyStudying: false,
      employmentStatus: 'employed', occupation: 'Marketing Manager', employer: 'Zeepay Ghana', monthlyIncome: 8000, employmentDuration: '1_3yrs',
      hasSpouse: false, hasChildren: false, numberOfDependents: 0, numberOfOccupants: 1,
      smoker: false, drinker: false, pets: false, noiseLevel: 'quiet', workSchedule: 'day', hobbies: ['Yoga', 'Photography', 'Travel'], clubs: ['Accra Photography Club'],
      personalReferences: [{ name: 'Efua Mensah', relationship: 'Sister', phone: '0209999888', yearsKnown: 27 }],
      professionalReferences: [{ name: 'Janet Agyei', title: 'Head of Marketing', company: 'Zeepay', phone: '0244555666' }],
      previousRentals: [],
      hasBeenEvicted: false,
      emergencyContact: { name: 'Efua Mensah', relationship: 'Sister', phone: '0209999888' },
      idType: 'ghana_card', idNumber: 'GHA-812345678-1', idVerified: true, incomeVerified: false, addressVerified: false,
      searchPreferences: { preferredRegions: ['Greater Accra'], preferredCities: ['Accra'], preferredType: ['apartment', 'studio'], minBudget: 1000, maxBudget: 2500, minBedrooms: 1, needsFurnished: true, needsParking: false, preferredAmenities: ['WiFi', 'AC', 'Security'] },
    },
    {
      userId: t3, dateOfBirth: '1988-11-05', gender: 'male', maritalStatus: 'married', nationality: 'Ghanaian', religion: 'muslim', ethnicGroup: 'Mole-Dagbon', hometown: 'Tamale', languagesSpoken: ['English', 'Dagbani', 'Twi', 'Hausa'], bio: 'Business owner running an import/export company. Reliable tenant with excellent credit history. Looking for family-friendly housing.',
      highestEducation: 'masters', institution: 'GIMPA', fieldOfStudy: 'Business Administration', graduationYear: 2014, currentlyStudying: false,
      employmentStatus: 'self_employed', occupation: 'CEO', employer: 'KM Imports Ltd', employerAddress: 'Tema Industrial Area', monthlyIncome: 25000, employmentDuration: '5_plus', workPhone: '0244567890',
      hasSpouse: true, spouseName: 'Fatima Mensah', spouseOccupation: 'Pharmacist', hasChildren: true, numberOfChildren: 2, childrenAges: '5, 3', numberOfDependents: 3, numberOfOccupants: 4,
      smoker: false, drinker: false, pets: false, noiseLevel: 'moderate', workSchedule: 'day', hobbies: ['Golf', 'Reading', 'Travel'], clubs: ['Accra Golf Club', 'Ghana Chamber of Commerce'], vehicleOwner: true, vehicleType: 'Toyota Land Cruiser 2021',
      personalReferences: [{ name: 'Ibrahim Alhassan', relationship: 'Brother', phone: '0244888999', yearsKnown: 37 }, { name: 'Samuel Owusu', relationship: 'Business partner', phone: '0551234567', occupation: 'Businessman', yearsKnown: 10 }],
      professionalReferences: [{ name: 'Richard Amoako', title: 'Branch Manager', company: 'GCB Bank', phone: '0302334455' }],
      previousRentals: [{ address: '15 Ahodwo Road', city: 'Kumasi', duration: '24 months', monthlyRent: 1500, landlordName: 'Adjoa Darko', landlordPhone: '0557778888', reasonForLeaving: 'Business relocation', canContact: true }],
      hasBeenEvicted: false,
      emergencyContact: { name: 'Fatima Mensah', relationship: 'Spouse', phone: '0209876543', address: 'Kumasi, Ahodwo' },
      idType: 'ghana_card', idNumber: 'GHA-645678901-2', idVerified: true, incomeVerified: true, addressVerified: true,
      searchPreferences: { preferredRegions: ['Greater Accra'], preferredCities: ['Accra', 'Tema'], preferredType: ['house', 'apartment'], minBudget: 3000, maxBudget: 8000, minBedrooms: 3, needsFurnished: false, needsParking: true, preferredAmenities: ['Security', 'Garden', 'Parking', 'Generator'] },
    },
    {
      userId: t4, dateOfBirth: '2000-05-10', gender: 'female', maritalStatus: 'single', nationality: 'Ghanaian', religion: 'christian', ethnicGroup: 'Ewe', hometown: 'Ho', languagesSpoken: ['English', 'Ewe'],
      highestEducation: 'diploma', institution: 'Accra Technical University', fieldOfStudy: 'Accounting', graduationYear: 2023, currentlyStudying: false,
      employmentStatus: 'employed', occupation: 'Junior Accountant', employer: 'PwC Ghana', monthlyIncome: 4000, employmentDuration: 'less_than_1yr',
      hasSpouse: false, hasChildren: false, numberOfDependents: 0, numberOfOccupants: 1,
      smoker: false, drinker: false, pets: false, noiseLevel: 'quiet', workSchedule: 'day',
      personalReferences: [{ name: 'Edem Agbeko', relationship: 'Uncle', phone: '0200111222', yearsKnown: 25 }],
      previousRentals: [],
      hasBeenEvicted: false,
      emergencyContact: { name: 'Edem Agbeko', relationship: 'Uncle', phone: '0200111222' },
      idType: 'ghana_card', idNumber: 'GHA-901234567-3', idVerified: false, incomeVerified: false, addressVerified: false,
      searchPreferences: { preferredRegions: ['Greater Accra'], preferredCities: ['Accra', 'Tema'], preferredType: ['room', 'apartment'], minBudget: 500, maxBudget: 1500, minBedrooms: 1, needsFurnished: false, needsParking: false, preferredAmenities: ['Water', 'Electricity'] },
    },
    {
      userId: t5, dateOfBirth: '1985-01-28', gender: 'female', maritalStatus: 'married', nationality: 'Ghanaian', religion: 'christian', ethnicGroup: 'Fante', hometown: 'Cape Coast', languagesSpoken: ['English', 'Fante', 'Twi', 'French'], bio: 'Diplomat and international relations specialist. Previously posted in Geneva and Abidjan. Currently based in Accra at the Ministry of Foreign Affairs.',
      highestEducation: 'masters', institution: 'University of Oxford', fieldOfStudy: 'International Relations', graduationYear: 2010, currentlyStudying: false,
      employmentStatus: 'employed', occupation: 'Senior Diplomat', employer: 'Ministry of Foreign Affairs', employerAddress: 'Independence Avenue, Accra', monthlyIncome: 35000, employmentDuration: '5_plus', workPhone: '0302778899',
      hasSpouse: true, spouseName: 'Dr. James Amoah', spouseOccupation: 'Surgeon', hasChildren: true, numberOfChildren: 1, childrenAges: '7', numberOfDependents: 2, numberOfOccupants: 3,
      smoker: false, drinker: false, pets: true, petDetails: '1 Labrador Retriever', noiseLevel: 'quiet', workSchedule: 'day', hobbies: ['Tennis', 'Wine tasting', 'Reading'], clubs: ['Accra Polo Club', 'Ghana Foreign Service Association'], vehicleOwner: true, vehicleType: 'Mercedes-Benz GLE 2023',
      personalReferences: [{ name: 'Dr. James Amoah', relationship: 'Spouse', phone: '0244556677', yearsKnown: 12 }, { name: 'Prof. Akua Mensah', relationship: 'Mentor', phone: '0302998877', occupation: 'Professor', yearsKnown: 15 }],
      professionalReferences: [{ name: 'Ambassador Kwame Baffour', title: 'Director', company: 'Ministry of Foreign Affairs', phone: '0302112233' }],
      previousRentals: [{ address: '8 Rue de Vermont, Geneva', city: 'Geneva', duration: '36 months', monthlyRent: 15000, landlordName: 'Swiss Properties AG', reasonForLeaving: 'End of posting', canContact: true }],
      hasBeenEvicted: false,
      emergencyContact: { name: 'Dr. James Amoah', relationship: 'Spouse', phone: '0244556677', address: 'Accra, Trasacco Valley' },
      idType: 'ghana_card', idNumber: 'GHA-534567890-4', idVerified: true, incomeVerified: true, addressVerified: true,
      searchPreferences: { preferredRegions: ['Greater Accra'], preferredCities: ['Accra'], preferredType: ['house', 'apartment'], minBudget: 5000, maxBudget: 12000, minBedrooms: 2, needsFurnished: true, needsParking: true, preferredAmenities: ['Swimming Pool', 'Security', 'Generator', 'AC', 'Gym'] },
    },
    {
      userId: t6, dateOfBirth: '1991-07-12', gender: 'male', maritalStatus: 'married', nationality: 'Ghanaian', religion: 'christian', ethnicGroup: 'Ashanti', hometown: 'Sunyani', languagesSpoken: ['English', 'Twi'], bio: 'Finance director at a multinational. Previously worked in Lagos and Nairobi. Family man with two children, looking for premium housing in Accra.',
      highestEducation: 'masters', institution: 'London Business School', fieldOfStudy: 'Finance', graduationYear: 2015, currentlyStudying: false,
      employmentStatus: 'employed', occupation: 'Finance Director', employer: 'Unilever Ghana', employerAddress: 'Industrial Area, Tema', monthlyIncome: 28000, employmentDuration: '3_5yrs', workPhone: '0303445566',
      hasSpouse: true, spouseName: 'Adwoa Frimpong', spouseOccupation: 'Teacher', hasChildren: true, numberOfChildren: 2, childrenAges: '8, 5', numberOfDependents: 3, numberOfOccupants: 4,
      smoker: false, drinker: false, pets: false, noiseLevel: 'moderate', workSchedule: 'day', hobbies: ['Running', 'Chess', 'Cooking'], clubs: ['Tema Golf Club'], vehicleOwner: true, vehicleType: 'BMW X5 2022',
      personalReferences: [{ name: 'Adwoa Frimpong', relationship: 'Spouse', phone: '0244778899', yearsKnown: 10 }, { name: 'Peter Asare', relationship: 'Friend', phone: '0551234567', occupation: 'Doctor', yearsKnown: 15 }],
      professionalReferences: [{ name: 'Mark Thompson', title: 'VP Finance, Africa', company: 'Unilever', phone: '0303667788', email: 'mark.t@unilever.com' }],
      previousRentals: [{ address: '55 Nkrumah Road', city: 'Sunyani', duration: '24 months', monthlyRent: 1500, landlordName: 'Efua Nyarko', landlordPhone: '0558884444', reasonForLeaving: 'Job transfer to Accra', canContact: true }],
      hasBeenEvicted: false,
      emergencyContact: { name: 'Adwoa Frimpong', relationship: 'Spouse', phone: '0244778899', address: 'Accra, Roman Ridge' },
      idType: 'ghana_card', idNumber: 'GHA-456789012-5', idVerified: true, incomeVerified: true, addressVerified: true,
      searchPreferences: { preferredRegions: ['Greater Accra'], preferredCities: ['Accra', 'Tema'], preferredType: ['house', 'apartment'], minBudget: 4000, maxBudget: 10000, minBedrooms: 3, needsFurnished: false, needsParking: true, preferredAmenities: ['Security', 'Garden', 'Parking', 'CCTV', 'Children Playground'] },
    },
    {
      userId: t7, dateOfBirth: '1996-04-03', gender: 'male', maritalStatus: 'single', nationality: 'Ghanaian', religion: 'christian', ethnicGroup: 'Ga-Dangme', hometown: 'Accra', languagesSpoken: ['English', 'Ga', 'Twi'], bio: 'Port logistics officer at Tema Port. Straightforward and responsible. First time using RentOS.',
      highestEducation: 'bachelors', institution: 'KNUST', fieldOfStudy: 'Logistics & Supply Chain', graduationYear: 2019, currentlyStudying: false,
      employmentStatus: 'employed', occupation: 'Logistics Officer', employer: 'Ghana Ports & Harbours Authority', employerAddress: 'Tema Port', monthlyIncome: 6000, employmentDuration: '3_5yrs',
      hasSpouse: false, hasChildren: false, numberOfDependents: 0, numberOfOccupants: 1,
      smoker: false, drinker: false, pets: false, noiseLevel: 'quiet', workSchedule: 'shift', hobbies: ['Football', 'Gaming', 'Swimming'],
      personalReferences: [{ name: 'Naa Adjeley', relationship: 'Mother', phone: '0267778899', yearsKnown: 28 }],
      professionalReferences: [{ name: 'Captain Owusu', title: 'Operations Manager', company: 'GPHA', phone: '0303112233' }],
      previousRentals: [],
      hasBeenEvicted: false,
      emergencyContact: { name: 'Naa Adjeley', relationship: 'Mother', phone: '0267778899', address: 'Accra, La' },
      idType: 'ghana_card', idNumber: 'GHA-678901234-6', idVerified: true, incomeVerified: true, addressVerified: false,
      searchPreferences: { preferredRegions: ['Greater Accra'], preferredCities: ['Tema', 'Accra'], preferredType: ['apartment', 'room'], minBudget: 500, maxBudget: 1500, minBedrooms: 1, needsFurnished: false, needsParking: false, preferredAmenities: ['Water', 'Electricity', 'Security'] },
    },
    {
      userId: t8, dateOfBirth: '1999-12-18', gender: 'female', maritalStatus: 'single', nationality: 'Ghanaian', religion: 'christian', ethnicGroup: 'Ashanti', hometown: 'Kumasi', languagesSpoken: ['English', 'Twi'],
      highestEducation: 'shs', institution: 'Wesley Girls SHS', fieldOfStudy: 'General Arts', graduationYear: 2018, currentlyStudying: false,
      employmentStatus: 'self_employed', occupation: 'Beauty Salon Owner', employer: 'Serwa\'s Beauty Palace', employerAddress: 'Kaneshie Market, Block B', monthlyIncome: 3000, employmentDuration: '1_3yrs',
      hasSpouse: false, hasChildren: false, numberOfDependents: 1, numberOfOccupants: 1,
      smoker: false, drinker: false, pets: false, noiseLevel: 'moderate', workSchedule: 'day', hobbies: ['Hair styling', 'Dancing', 'Church choir'],
      personalReferences: [{ name: 'Maame Ama', relationship: 'Aunt', phone: '0209998877', yearsKnown: 26 }],
      previousRentals: [],
      hasBeenEvicted: false,
      emergencyContact: { name: 'Maame Ama', relationship: 'Aunt', phone: '0209998877' },
      idType: 'ghana_card', idNumber: 'GHA-789012345-7', idVerified: false, incomeVerified: false, addressVerified: false,
      searchPreferences: { preferredRegions: ['Greater Accra'], preferredCities: ['Accra'], preferredType: ['room', 'apartment'], minBudget: 300, maxBudget: 1000, minBedrooms: 1, needsFurnished: false, needsParking: false, preferredAmenities: ['Water', 'Electricity'] },
    },
  ])

  // ════════════════════════════════════════════
  // CREDIT SCORES — all 8 tenants
  // ════════════════════════════════════════════

  await CreditScore.insertMany([
    { userId: t1, score: 78, factors: { paymentHistory: 36, savingsConsistency: 16, agreementCompliance: 16, disputeRecord: 4, accountAge: 6 }, calculatedAt: now },
    { userId: t2, score: 65, factors: { paymentHistory: 30, savingsConsistency: 10, agreementCompliance: 14, disputeRecord: 6, accountAge: 5 }, calculatedAt: now },
    { userId: t3, score: 88, factors: { paymentHistory: 40, savingsConsistency: 18, agreementCompliance: 18, disputeRecord: 4, accountAge: 8 }, calculatedAt: now },
    { userId: t4, score: 35, factors: { paymentHistory: 12, savingsConsistency: 4, agreementCompliance: 10, disputeRecord: 6, accountAge: 3 }, calculatedAt: now },
    { userId: t5, score: 82, factors: { paymentHistory: 38, savingsConsistency: 16, agreementCompliance: 18, disputeRecord: 4, accountAge: 6 }, calculatedAt: now },
    { userId: t6, score: 76, factors: { paymentHistory: 34, savingsConsistency: 14, agreementCompliance: 16, disputeRecord: 6, accountAge: 6 }, calculatedAt: now },
    { userId: t7, score: 55, factors: { paymentHistory: 22, savingsConsistency: 8, agreementCompliance: 14, disputeRecord: 6, accountAge: 5 }, calculatedAt: now },
    { userId: t8, score: 28, factors: { paymentHistory: 8, savingsConsistency: 2, agreementCompliance: 8, disputeRecord: 6, accountAge: 4 }, calculatedAt: now },
  ])

  // ════════════════════════════════════════════
  // REVIEWS — 12 property reviews
  // ════════════════════════════════════════════

  await Review.insertMany([
    { propertyId: props[0]._id.toString(), userId: t1, userName: 'Kwame Asante', rating: 4, title: 'Great apartment, good security', content: 'I have been living here for almost a year. The security is excellent — 24/7 guards and CCTV. Water supply is reliable. The only issue is parking can be tight during weekends.', pros: ['24-hour security', 'Reliable water', 'Good neighborhood'], cons: ['Limited parking', 'No WiFi included'], wouldRecommend: true, landlordResponsive: 3, maintenance: 4, valueForMoney: 4, neighborhood: 5, verified: true },
    { propertyId: props[1]._id.toString(), userId: t2, userName: 'Ama Serwaa', rating: 4, title: 'Perfect for a single professional', content: 'Love the location in Cantonments. Everything is walkable — restaurants, shops, nightlife. The studio is small but well-furnished. WiFi included which is a huge plus.', pros: ['Great location', 'Furnished', 'WiFi included'], cons: ['Small space', 'No parking'], wouldRecommend: true, landlordResponsive: 2, maintenance: 3, valueForMoney: 4, neighborhood: 5, verified: true },
    { propertyId: props[8]._id.toString(), userId: t3, userName: 'Kofi Mensah', rating: 3, title: 'Decent apartment, could be better', content: 'The apartment is in a good location near KNUST and the mall. However, water supply is inconsistent and the landlord can be slow to respond to maintenance requests.', pros: ['Good location', 'Near amenities'], cons: ['Inconsistent water', 'Slow maintenance response'], wouldRecommend: true, landlordResponsive: 2, maintenance: 2, valueForMoney: 3, neighborhood: 4, verified: true },
    { propertyId: props[3]._id.toString(), userId: t1, userName: 'Kwame Asante', rating: 3, title: 'Affordable but basic', content: 'I lived here before moving to East Legon. It is what you pay for — a basic self-contained room at Osu. Location is fantastic if you enjoy nightlife and street food.', pros: ['Affordable', 'Great location', 'Nightlife nearby'], cons: ['No parking', 'Basic finishes', 'Noisy area'], wouldRecommend: true, landlordResponsive: 3, maintenance: 2, valueForMoney: 4, neighborhood: 3, verified: true },
    { propertyId: props[26]._id.toString(), userId: t4, userName: 'Abena Osei', rating: 4, title: 'Nice new building in Tema', content: 'The flat is newly built and everything works. 24-hour water is a blessing. The community is family-friendly. Property manager responds quickly. Only issue is distance from Accra.', pros: ['New building', '24-hour water', 'Family-friendly'], cons: ['Far from Accra CBD', 'Limited public transport'], wouldRecommend: true, landlordResponsive: 5, maintenance: 5, valueForMoney: 4, neighborhood: 4, verified: true },
    { propertyId: props[5]._id.toString(), userId: t3, userName: 'Kofi Mensah', rating: 5, title: 'Excellent office space', content: 'Top-notch office space on Ring Road. Fiber internet is fast and reliable, conference room is well-equipped, and security is tight. Great for business.', pros: ['Fast internet', 'Conference room', 'Central location', 'Good security'], cons: ['Parking can fill up'], wouldRecommend: true, landlordResponsive: 4, maintenance: 5, valueForMoney: 4, neighborhood: 5, verified: true },
    { propertyId: props[15]._id.toString(), userId: t5, userName: 'Akua Amoah', rating: 4, title: 'Premium estate living with minor issues', content: 'Trasacco Valley is world-class — the facilities are top-notch, security is excellent, and the apartment finishes are superb. However, the estate management can be slow with pool maintenance.', pros: ['World-class estate', 'Excellent security', 'Beautiful finishes', 'Tennis court'], cons: ['Pool maintenance delays', 'High advance requirement'], wouldRecommend: true, landlordResponsive: 3, maintenance: 3, valueForMoney: 3, neighborhood: 5, verified: true },
    { propertyId: props[7]._id.toString(), userId: t6, userName: 'Yeboah Frimpong', rating: 5, title: 'Stunning penthouse with incredible views', content: 'The Roman Ridge penthouse is absolutely stunning. The panoramic views of Accra are breathtaking, the jacuzzi is a wonderful bonus, and the smart home features make life easy. Worth every cedi.', pros: ['Panoramic views', 'Jacuzzi', 'Smart home', 'Rooftop terrace'], cons: ['Noise from nearby construction'], wouldRecommend: true, landlordResponsive: 4, maintenance: 5, valueForMoney: 4, neighborhood: 5, verified: true },
    { propertyId: props[28]._id.toString(), userId: t7, userName: 'Nii Armah', rating: 3, title: 'Basic but functional for the price', content: 'The Kasoa apartment is basic but clean and functional. The area is developing fast with new shops and roads. The commute to Tema Port is about 45 minutes. Value for money is decent.', pros: ['Affordable', 'New construction', 'Private porch'], cons: ['Long commute to Tema', 'Area still developing', 'No parking'], wouldRecommend: true, landlordResponsive: 3, maintenance: 3, valueForMoney: 4, neighborhood: 3, verified: true },
    { propertyId: props[17]._id.toString(), userId: t8, userName: 'Serwa Badu', rating: 4, title: 'Great shop location with high foot traffic', content: 'The Kaneshie Market shop location is excellent — high foot traffic means good business. Security is provided by the market management. The only downside is the operating hour restrictions.', pros: ['High foot traffic', 'Ground floor', 'Market security'], cons: ['Operating hour restrictions', 'No AC'], wouldRecommend: true, landlordResponsive: 3, maintenance: 3, valueForMoney: 4, neighborhood: 4, verified: true },
    { propertyId: props[16]._id.toString(), userId: t5, userName: 'Akua Amoah', rating: 3, title: 'Good affordable option in Dansoman', content: 'Visited this property for a friend. It is a solid affordable option — newly painted, modern fittings, and close to amenities. However, no parking and the stairway can get noisy.', pros: ['Affordable', 'Newly painted', 'Close to amenities'], cons: ['No parking', 'Noisy stairway'], wouldRecommend: true, landlordResponsive: 3, maintenance: 3, valueForMoney: 4, neighborhood: 3, verified: false },
    { propertyId: props[22]._id.toString(), userId: t6, userName: 'Yeboah Frimpong', rating: 4, title: 'Great Tamale apartment', content: 'Visited Tamale for work and stayed here. The apartment is surprisingly modern for the area. Generator backup is essential in northern Ghana and this place has it. Highly recommend.', pros: ['Modern finishes', 'Generator backup', 'Good security'], cons: ['Limited nightlife in area'], wouldRecommend: true, landlordResponsive: 4, maintenance: 4, valueForMoney: 5, neighborhood: 4, verified: false },
  ])

  // ════════════════════════════════════════════
  // LEGAL ARTICLES — 8 comprehensive articles
  // ════════════════════════════════════════════

  await LegalArticle.insertMany([
    { title: 'Rent Act, 1963 (Act 220)', content: 'The Rent Act, 1963 establishes the Rent Control Department and provides for the regulation of rents and related matters. Key provisions include:\n\n1. Establishment of the Rent Control Department under the Ministry of Works and Housing\n2. Powers to fix standard rents for premises\n3. Prohibition of demanding premiums or key money\n4. Protection against unlawful eviction\n5. Right of tenants to a receipt for rent paid\n6. Penalties for non-compliance\n\nThe Act applies to all residential and commercial premises in Ghana. Any disputes arising under this Act are handled by the Rent Assessment Committee or the courts.', simplifiedContent: 'This law created the Rent Control office in Ghana. It controls how much landlords can charge for rent and protects tenants from unfair practices. Your landlord must give you a receipt every time you pay rent.', category: 'Rent Control Act', lawReference: 'Act 220', effectiveDate: '1963-01-01', tags: ['rent control', 'tenant protection', 'landlord regulation'], language: 'en' },
    { title: 'Rent Advance Limits', content: 'Under current regulations, landlords in Ghana are not permitted to demand more than six months rent advance from tenants. This regulation was introduced to address the widespread practice of demanding one to two years of rent upfront, which placed enormous financial burden on tenants.\n\nKey points:\n- Maximum rent advance: 6 months for residential properties\n- The landlord cannot evict you for refusing to pay more than 6 months advance\n- Violations can be reported to the Rent Control Department\n- Any excess advance collected is considered illegal and must be refunded\n- The tenant has the right to pay rent monthly after the advance period expires', simplifiedContent: 'Your landlord cannot ask you to pay more than 6 months of rent upfront. If they do, you can report them to the Rent Control Department and they must refund the excess.', category: 'Rent Advance Limits', lawReference: 'Rent Act Amendment (2024)', effectiveDate: '2024-01-01', tags: ['rent advance', 'tenant rights', 'payment'], language: 'en' },
    { title: 'Tenant Eviction Process', content: 'A landlord must provide adequate notice before evicting a tenant. The notice period depends on the type of tenancy:\n\n- Weekly tenancy: 1 week notice\n- Monthly tenancy: 1 month notice\n- Yearly tenancy: 3 months notice\n- Fixed-term lease: Cannot evict before expiry unless for breach\n\nValid grounds for eviction include:\n1. Non-payment of rent\n2. Breach of tenancy agreement\n3. Use of property for illegal purposes\n4. Causing a nuisance\n5. Landlord requires property for personal use (with adequate compensation)\n\nThe eviction must be carried out through the courts. Self-help eviction (changing locks, disconnecting utilities) is illegal.', simplifiedContent: 'Your landlord must give you proper notice before asking you to leave. For monthly tenants, this is one month. They cannot change your locks or cut your utilities to force you out.', category: 'Eviction Laws', lawReference: 'Rent Act, 1963 S.17', effectiveDate: '1963-01-01', tags: ['eviction', 'notice period', 'tenant rights'], language: 'en' },
    { title: 'Landlord Maintenance Obligations', content: 'The landlord is responsible for keeping the rental premises in a habitable condition. This includes:\n\n1. Structural repairs (walls, roof, foundation)\n2. Major plumbing and electrical repairs\n3. Ensuring adequate water supply where provided\n4. Maintaining common areas in multi-unit buildings\n5. Pest control for structural infestations\n\nThe tenant is generally responsible for:\n1. Minor repairs caused by normal wear and tear\n2. Keeping the premises clean\n3. Reporting maintenance issues promptly\n4. Not making unauthorized modifications\n\nFailure to maintain the property can be grounds for rent reduction or lease termination.', simplifiedContent: 'Your landlord must keep the building safe and in good condition. They must fix major things like plumbing, electricity, and the roof. You are responsible for keeping it clean and reporting problems quickly.', category: 'Landlord Obligations', lawReference: 'Rent Act, 1963 S.12', effectiveDate: '1963-01-01', tags: ['maintenance', 'landlord duties', 'habitability'], language: 'en' },
    { title: 'Security Deposit Rules in Ghana', content: 'Security deposits in Ghana are governed by a combination of the Rent Act and common practice:\n\n1. Amount: Typically 1-2 months rent, though no strict statutory limit\n2. Purpose: To cover damages beyond normal wear and tear\n3. Return: Must be returned within 30 days of move-out\n4. Deductions: Landlord must provide itemized list of deductions\n5. Disputes: Can be reported to Rent Control Department\n\nTenants should:\n- Get a receipt for the security deposit\n- Document the property condition at move-in (photos/video)\n- Conduct a joint inspection at move-out\n- Request the deposit in writing if not returned', simplifiedContent: 'Your security deposit should be returned within 30 days after you move out. Take photos when you move in and when you leave. If your landlord takes deductions, they must show you exactly what for.', category: 'Tenant Rights', lawReference: 'Rent Act, 1963 S.14', effectiveDate: '1963-01-01', tags: ['security deposit', 'tenant rights', 'move-out'], language: 'en' },
    { title: 'Dispute Resolution Mechanisms', content: 'Ghana offers several channels for resolving rental disputes:\n\n1. Direct Negotiation: Always try to resolve issues directly first\n2. Rent Control Department: Free mediation service for rental disputes\n3. Alternative Dispute Resolution (ADR): Professional mediation\n4. District Court: For legal action when mediation fails\n5. RentOS Platform: Digital dispute filing with mediation support\n\nCommon disputes include:\n- Rent increases during contract period\n- Maintenance failures\n- Security deposit refund issues\n- Eviction notices\n- Utility disconnection\n- Breach of agreement terms', simplifiedContent: 'If you have a problem with your landlord, first try talking it out. If that does not work, go to the Rent Control Department — their mediation service is free. You can also file a dispute on RentOS.', category: 'Dispute Resolution', lawReference: 'ADR Act, 2010 (Act 798)', effectiveDate: '2010-01-01', tags: ['disputes', 'mediation', 'rent control', 'resolution'], language: 'en' },
    { title: 'Rights of Subletting', content: 'Subletting is a common practice in Ghana, but tenants should be aware of the legal implications:\n\n1. Written consent from landlord is generally required\n2. The original tenant remains liable for rent and damages\n3. The sub-tenant has no direct relationship with the landlord\n4. Unauthorized subletting can be grounds for eviction\n5. Some agreements explicitly prohibit subletting\n\nIf you want to sublet:\n- Check your agreement for subletting clauses\n- Get written permission from your landlord\n- Draft a separate agreement with the sub-tenant\n- Remain responsible for the property', simplifiedContent: 'You can sublet your room or apartment, but you usually need written permission from your landlord. If your agreement says no subletting, you cannot do it or you risk eviction.', category: 'Tenant Rights', lawReference: 'Rent Act, 1963 S.8', effectiveDate: '1963-01-01', tags: ['subletting', 'tenant rights', 'agreement'], language: 'en' },
    { title: 'Property Inspection Rights', content: 'Both landlords and tenants have inspection rights:\n\nLandlord inspection rights:\n- Must give at least 24 hours notice\n- Can only inspect during reasonable hours (8am-6pm)\n- Cannot enter without permission except in emergencies\n- Must provide reason for inspection\n\nTenant inspection rights:\n- Right to inspect before signing lease\n- Right to document condition at move-in\n- Right to request repairs identified during inspection\n- Right to be present during landlord inspections\n- Right to privacy — landlord cannot install surveillance in private areas', simplifiedContent: 'Your landlord must give you 24 hours notice before coming to inspect your room. They cannot enter without your permission unless there is an emergency. You have the right to be there during any inspection.', category: 'Landlord Obligations', lawReference: 'Rent Act, 1963 S.15', effectiveDate: '1963-01-01', tags: ['inspection', 'privacy', 'landlord access'], language: 'en' },
  ])

  // ════════════════════════════════════════════
  // DOCUMENTS — sample uploads linked to agreements/properties
  // ════════════════════════════════════════════

  const docs = await DocumentModel.insertMany([
    // Tenant 1 — identity & income docs
    { ownerId: t1, name: 'Ghana Card - Kwame Asante', type: 'identity', mimeType: 'image/jpeg', fileUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400', fileSize: 245000, version: 1, linkedEntityType: 'user', linkedEntityId: t1, accessControl: [t1] },
    { ownerId: t1, name: 'Proof of Income - Salary Slip March 2026', type: 'receipt', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400', fileSize: 189000, version: 1, linkedEntityType: 'user', linkedEntityId: t1, accessControl: [t1, l1] },
    { ownerId: t1, name: 'Rental Agreement - East Legon Apt', type: 'rental_agreement', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400', fileSize: 342000, version: 1, linkedEntityType: 'agreement', linkedEntityId: agreements[0]._id.toString(), accessControl: [t1, l1] },

    // Tenant 2 — identity
    { ownerId: t2, name: 'Ghana Card - Ama Serwaa', type: 'identity', mimeType: 'image/jpeg', fileUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400', fileSize: 198000, version: 1, linkedEntityType: 'user', linkedEntityId: t2, accessControl: [t2] },
    { ownerId: t2, name: 'University Certificate', type: 'other', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1554224154-22dec7ec8818?w=400', fileSize: 567000, version: 1, linkedEntityType: 'user', linkedEntityId: t2, accessControl: [t2] },

    // Tenant 3 — business owner docs
    { ownerId: t3, name: 'Business Registration - Kofi Mensah', type: 'other', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400', fileSize: 423000, version: 1, linkedEntityType: 'user', linkedEntityId: t3, accessControl: [t3] },
    { ownerId: t3, name: 'Tax Clearance Certificate 2025', type: 'receipt', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400', fileSize: 156000, version: 1, linkedEntityType: 'user', linkedEntityId: t3, accessControl: [t3, l2] },

    // Landlord 1 — property docs
    { ownerId: l1, name: 'Land Title - East Legon Property', type: 'legal_notice', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400', fileSize: 890000, version: 1, linkedEntityType: 'property', linkedEntityId: props[0]._id.toString(), accessControl: [l1] },
    { ownerId: l1, name: 'Building Permit - Spintex House', type: 'legal_notice', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400', fileSize: 445000, version: 1, linkedEntityType: 'property', linkedEntityId: props[2]._id.toString(), accessControl: [l1] },
    { ownerId: l1, name: 'Insurance Certificate 2026', type: 'other', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400', fileSize: 234000, version: 1, accessControl: [l1] },

    // Landlord 2 — property docs
    { ownerId: l2, name: 'Rental Agreement - Ahodwo Apt', type: 'rental_agreement', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400', fileSize: 312000, version: 1, linkedEntityType: 'agreement', linkedEntityId: agreements[3]._id.toString(), accessControl: [l2, t2] },
    { ownerId: l2, name: 'Property Valuation Report - Takoradi', type: 'other', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1554224154-22dec7ec8818?w=400', fileSize: 678000, version: 1, linkedEntityType: 'property', linkedEntityId: props[8]._id.toString(), accessControl: [l2] },

    // Dispute evidence
    { ownerId: t1, name: 'Water Damage Photos - East Legon', type: 'evidence', mimeType: 'image/jpeg', fileUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400', fileSize: 1200000, version: 1, linkedEntityType: 'dispute', accessControl: [t1, l1, gov._id.toString()] },
    { ownerId: l1, name: 'Repair Invoice - Plumbing', type: 'receipt', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400', fileSize: 89000, version: 1, linkedEntityType: 'dispute', accessControl: [t1, l1, gov._id.toString()] },

    // Government docs
    { ownerId: gov._id.toString(), name: 'Compliance Audit Report Q1 2026', type: 'legal_notice', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=400', fileSize: 2340000, version: 1, accessControl: [gov._id.toString(), admin._id.toString(), ofiAdmin._id.toString()] },
    { ownerId: gov._id.toString(), name: 'Rent Control Department Guidelines', type: 'legal_notice', mimeType: 'application/pdf', fileUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400', fileSize: 1890000, version: 1, accessControl: [gov._id.toString(), admin._id.toString(), ofiAdmin._id.toString(), legal._id.toString()] },
  ])

  // Create audit logs for uploaded documents
  await AuditLog.insertMany(docs.map((d) => ({
    userId: d.ownerId,
    action: 'upload',
    entityType: 'document',
    entityId: d._id.toString(),
    details: `Uploaded ${d.name} (${d.fileSize} bytes)`,
  })))

  // ════════════════════════════════════════════
  // BLOG POSTS — 10 educational articles
  // ════════════════════════════════════════════

  await BlogPost.insertMany([
    { title: 'Understanding the Rent Advance Cap in Ghana', slug: 'rent-advance-cap', coverImage: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800', excerpt: 'Learn about the legal limits on how much rent advance a landlord can demand in Ghana.', content: '## What Is the Rent Advance Cap?\n\nIn Ghana, the rent advance cap is one of the **most important protections** for tenants. Under current regulations, landlords are not permitted to demand more than **six months** of rent as advance payment.\n\nThis rule was introduced to address the widespread practice of landlords demanding one to two years of rent upfront, which placed enormous financial burden on tenants, particularly young professionals and families.\n\n## Key Points to Remember\n\n- **Maximum advance:** 6 months for all residential properties\n- **Violations** can be reported to the Rent Control Department\n- The landlord **cannot evict you** for refusing to pay more than 6 months advance\n- Any excess advance collected is considered **illegal** and must be refunded\n\n## What to Do if Your Landlord Demands More\n\n> If your landlord is demanding more than the legal limit, you have options.\n\n1. **Negotiate directly** with your landlord and cite the law\n2. **File a complaint** with the Rent Control Department\n3. **Use the RentOS dispute resolution** system for digital mediation\n\n## Reference\n\nThis regulation is based on the **Rent Act Amendment (2024)**, which updated the original Rent Act, 1963 (Act 220).', author: 'RentOS Team', tags: ['tenant rights', 'rent advance', 'legal guide'], published: true },
    { title: 'How to Save for Rent Using RentGuard', slug: 'rentguard-savings-guide', coverImage: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800', excerpt: 'A step-by-step guide to using the RentGuard savings system to plan for your next rent payment.', content: '## What Is RentGuard?\n\n**RentGuard** is a powerful savings tool built into RentOS that helps tenants save gradually towards their rent payments. Instead of scrambling to pay a large lump sum, you can build up your rent money over time.\n\n## Getting Started in 5 Steps\n\n### Step 1: Create a Savings Plan\n\nGo to the **RentGuard** section and click **"New Savings Plan"**. Set your:\n- Target amount (your rent)\n- Contribution frequency (daily, weekly, or monthly)\n- Target date\n\n### Step 2: Fund Your Wallet\n\nDeposit money into your RentGuard wallet via:\n- **MTN MoMo**\n- **Telecel Cash**\n- **AirtelTigo Money**\n- **Bank Transfer**\n\n### Step 3: Enable Auto-Debit\n\nFor hands-free saving, enable **auto-debit**. The system will automatically transfer your contribution amount from your mobile money to your savings plan on schedule.\n\n### Step 4: Track Progress\n\nWatch your progress bar grow! You will receive **notifications** when you hit milestones like 25%, 50%, and 75%.\n\n### Step 5: Pay Rent\n\nWhen your plan reaches its target, you can pay your landlord **directly from your RentGuard wallet** — no extra steps needed.\n\n> **Pro tip:** Start saving immediately after your last rent payment. Even small daily contributions add up!', author: 'RentOS Team', tags: ['savings', 'rentguard', 'financial tips'], published: true },
    { title: '5 Things Every Tenant Should Know Before Signing a Lease', slug: 'tenant-lease-checklist', coverImage: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800', excerpt: 'Essential things to check in your rental agreement before you sign.', content: '## Before You Sign\n\nSigning a rental agreement is a **serious commitment**. Before you put pen to paper (or finger to screen), make sure you have checked these five things.\n\n### 1. Rent Advance Compliance\n\nThe agreement should **not require more than 6 months advance**. If it does, this is a red flag and potentially illegal under the Rent Act Amendment (2024).\n\n### 2. Notice Period\n\nCheck what **notice period** is required for both parties.\n\n### 3. Maintenance Responsibilities\n\nWho is responsible for repairs? The landlord is **legally required** to maintain the property in habitable condition, but the agreement should clarify specifics.\n\n### 4. Utility Arrangements\n\nAre utilities included? Who pays for water, electricity, internet? Get this in writing.\n\n### 5. Dispute Resolution\n\nDoes the agreement specify how disputes will be resolved? Using the **RentOS platform** for digital agreements automatically includes compliance checking.\n\n> **Bottom line:** Never rush into signing. Take 24 hours to review, and use RentOS compliance checking for peace of mind.', author: 'RentOS Team', tags: ['tenant rights', 'agreements', 'tips'], published: true },
    { title: "A Landlord's Guide to Digital Rental Agreements", slug: 'landlord-digital-agreements', coverImage: 'https://images.unsplash.com/photo-1554224154-22dec7ec8818?w=800', excerpt: 'Why digital agreements are better for landlords and how to create them on RentOS.', content: '## Why Go Digital?\n\nDigital rental agreements offer significant advantages over paper contracts.\n\n## Benefits of Digital Agreements\n\n- **Automatic compliance checking** catches illegal clauses before signing\n- **Digital signatures** are legally binding and tamper-proof\n- **Version history** tracks all changes\n- Both parties get **instant access** to the agreement\n- Disputes are easier to resolve with **digital evidence**\n\n## How to Create One on RentOS\n\n1. Go to **Agreements > New Agreement**\n2. Select the property and enter the tenant details\n3. Set the rent amount, duration, and advance\n4. Add your terms and conditions\n5. The system will **flag any compliance issues**\n6. Send to the tenant for signature\n\n> **Tip:** Properties with digital agreements on RentOS get a **verified badge**, increasing tenant trust and inquiry rates.', author: 'RentOS Team', tags: ['landlord guide', 'agreements', 'digital'], published: true },
    { title: 'How Your Rental Credit Score Works on RentOS', slug: 'rental-credit-score', coverImage: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800', excerpt: 'Understanding the factors that make up your RentOS credit score and how to improve it.', content: '## What Is Your Rental Credit Score?\n\nYour RentOS credit score is a **0-100 rating** that helps landlords assess your reliability as a tenant. A higher score means better housing options and faster approvals.\n\n## Score Breakdown\n\n| Factor | Max Points | What It Measures |\n|---|---|---|\n| Payment History | **40** | Consistent, on-time rent payments |\n| Savings Consistency | **20** | Regular RentGuard contributions |\n| Agreement Compliance | **20** | Following your lease terms |\n| Dispute Record | **10** | Fewer disputes = higher score |\n| Account Age | **10** | Longer history = more trust |\n\n## Tips to Improve Your Score\n\n- **Always pay rent on time** — this is worth the most points\n- **Save regularly** with RentGuard, even small amounts\n- **Keep your profile 100% complete** with verified documents\n- **Resolve disputes amicably** through mediation\n\n> A score above **70** qualifies you for micro-loans and priority listings.', author: 'RentOS Team', tags: ['credit score', 'financial tips', 'tenant guide'], published: true },
    { title: 'Navigating Rent Disputes in Ghana: A Practical Guide', slug: 'rent-dispute-guide', coverImage: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800', excerpt: 'Step-by-step guide on how to handle common rental disputes in Ghana using legal channels.', content: '## Disputes Happen — Here Is How to Handle Them\n\nRental disputes are common but manageable if you know the right steps.\n\n## Step 1: Document Everything\n\nKeep records of **all communications, payments, and agreements**. Take photos of any property damage or maintenance issues.\n\n## Step 2: Communicate in Writing\n\nAlways follow up verbal discussions in writing — text messages, email, or the RentOS messaging system.\n\n## Step 3: Use the RentOS Dispute System\n\nFile a formal dispute on RentOS. The system will record your complaint, notify the other party, and assign a mediator.\n\n## Step 4: Rent Control Department\n\nIf mediation fails, visit your local Rent Control office. Their services are completely free.\n\n## Step 5: Legal Action\n\nAs a last resort, small claims court handles disputes under GHS 20,000.\n\n> **Prevention is better than cure** — use RentOS digital agreements with compliance checking to avoid disputes before they start.', author: 'RentOS Team', tags: ['disputes', 'legal guide', 'tenant rights'], published: true },
    { title: 'Investing Your Rent Savings: Treasury Bills and Government Bonds', slug: 'investing-rent-savings', coverImage: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800', excerpt: 'How to grow your idle savings with low-risk investments available through the RentOS platform.', content: '## Why Let Your Money Sit Idle?\n\nIf you are saving towards rent with RentGuard, your money does not have to just sit in your wallet. Through our investment partners, you can earn returns.\n\n## Investment Options on RentOS\n\n### Treasury Bills\n\n| Tenure | Typical Rate | Risk Level |\n|---|---|---|\n| 91 days | 28-30% | Very Low |\n| 182 days | 27-29% | Very Low |\n| 364 days | 26-28% | Very Low |\n\n### Government Bonds\n\n- 2-year bonds: 22-24% annual return\n- 3-year bonds: 23-25% annual return\n\n## Important Disclaimers\n\n> All investments carry risk. Past performance does not guarantee future returns.', author: 'RentOS Team', tags: ['investments', 'financial tips', 'savings'], published: true },
    { title: 'Micro-Loans: Bridging the Rent Gap', slug: 'micro-loans-rent-gap', coverImage: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800', excerpt: 'When savings fall short, RentOS micro-loans can help bridge the gap so you never miss a rent payment.', content: '## What Are Micro-Loans on RentOS?\n\nRentOS micro-loans are small, short-term loans designed specifically to help tenants cover rent when their savings fall short.\n\n## Who Qualifies?\n\n- An active rental agreement on RentOS\n- A credit score of 50 or above\n- A verified RentOS account with payment history\n\n## Loan Terms\n\n| Feature | Details |\n|---|---|\n| Maximum amount | GHS 10,000 |\n| Interest rate | 15% annual |\n| Repayment period | 1-12 months |\n| Disbursement | Instant to RentGuard wallet |\n\n> **Warning:** Defaulting on a micro-loan will significantly reduce your credit score.', author: 'RentOS Team', tags: ['micro-loans', 'financial tips', 'tenant guide'], published: true },
    { title: 'The Complete Guide to Ghana Rent Control Department', slug: 'ghana-rent-control-guide', coverImage: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800', excerpt: 'Everything you need to know about the Rent Control Department and how it protects both tenants and landlords.', content: '## What Is the Rent Control Department?\n\nThe Rent Control Department is a government agency established under the Rent Act, 1963 (Act 220). It operates under the Ministry of Works and Housing.\n\n## Services Offered\n\n### For Tenants\n- Free mediation for rental disputes\n- Rent assessment to determine fair rent\n- Protection from illegal eviction\n- Enforcement of the rent advance cap\n\n### For Landlords\n- Legal rent recovery assistance\n- Eviction processes through proper channels\n- Tenant background information\n- Lease registration services\n\n## Office Locations\n\n| Region | Address |\n|---|---|\n| Greater Accra | Barnes Road, Accra |\n| Ashanti | Adum, Kumasi |\n| Western | Market Circle, Takoradi |\n| Northern | Tamale Central |', author: 'RentOS Team', tags: ['rent control', 'legal guide', 'government'], published: true },
    { title: 'Mobile Money and Rent Payments: A Modern Guide', slug: 'mobile-money-rent-payments', coverImage: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800', excerpt: 'How to use MTN MoMo, Telecel Cash, and AirtelTigo Money for secure rent payments on RentOS.', content: '## The Rise of Digital Rent Payments\n\nGhana leads Africa in mobile money adoption, and rental payments are no exception. On RentOS, over 80% of rent payments are made via mobile money.\n\n## Supported Payment Methods\n\n### MTN Mobile Money (MoMo)\n- Most popular payment method in Ghana\n- Instant processing, available 24/7\n\n### Telecel Cash\n- Growing user base, competitive fees\n\n### AirtelTigo Money\n- Good coverage in northern regions\n\n### Bank Transfer\n- Best for large payments\n- Takes 1-2 business days\n\n## Security Tips\n\n- Never share your mobile money PIN\n- Always pay through the RentOS platform for a verified receipt\n- Enable transaction notifications on your phone\n\n> Every payment made through RentOS contributes to your rental credit score.', author: 'RentOS Team', tags: ['payments', 'mobile money', 'guide'], published: true },
  ])

  // ════════════════════════════════════════════
  // CONVERSATIONS & MESSAGES — 8 conversations
  // ════════════════════════════════════════════

  const convos = await Conversation.insertMany([
    // Kwame <-> Yaw about East Legon apartment
    { participants: [t1, l1], propertyId: props[0]._id.toString(), lastMessage: { text: 'I will get the plumber to check it tomorrow morning.', senderId: l1, createdAt: new Date('2026-03-18T14:30:00Z') }, unreadCount: { [t1]: 1, [l1]: 0 }, createdAt: new Date('2026-03-10T09:00:00Z'), updatedAt: new Date('2026-03-18T14:30:00Z') },
    // Ama <-> Yaw about Studio Cantonments
    { participants: [t2, l1], propertyId: props[1]._id.toString(), lastMessage: { text: 'Thank you, I appreciate the quick response!', senderId: t2, createdAt: new Date('2026-03-17T11:15:00Z') }, unreadCount: { [t2]: 0, [l1]: 1 }, createdAt: new Date('2026-03-12T08:00:00Z'), updatedAt: new Date('2026-03-17T11:15:00Z') },
    // Kofi <-> Adjoa about Kumasi apartment
    { participants: [t3, l2], propertyId: props[8]._id.toString(), lastMessage: { text: 'Yes the bank transfer went through. Receipt attached to payments.', senderId: t3, createdAt: new Date('2026-03-16T16:45:00Z') }, unreadCount: { [t3]: 0, [l2]: 0 }, createdAt: new Date('2026-03-05T10:00:00Z'), updatedAt: new Date('2026-03-16T16:45:00Z') },
    // Kwame <-> Adjoa about Ridge apartment
    { participants: [t1, l2], propertyId: props[11]._id.toString(), lastMessage: { text: 'The earliest available move-in date would be April 1st.', senderId: l2, createdAt: new Date('2026-03-19T09:20:00Z') }, unreadCount: { [t1]: 1, [l2]: 0 }, createdAt: new Date('2026-03-15T14:00:00Z'), updatedAt: new Date('2026-03-19T09:20:00Z') },
    // Akua <-> Kwaku about Trasacco
    { participants: [t5, l3], propertyId: props[15]._id.toString(), lastMessage: { text: 'I have reported the pool issue to the estate management. They promised to fix it by next week.', senderId: l3, createdAt: new Date('2026-03-20T10:00:00Z') }, unreadCount: { [t5]: 1, [l3]: 0 }, createdAt: new Date('2026-03-18T08:00:00Z'), updatedAt: new Date('2026-03-20T10:00:00Z') },
    // Yeboah <-> Yaw about Roman Ridge
    { participants: [t6, l1], propertyId: props[7]._id.toString(), lastMessage: { text: 'No problem, the jacuzzi maintenance team will come this Saturday.', senderId: l1, createdAt: new Date('2026-03-19T16:00:00Z') }, unreadCount: { [t6]: 1, [l1]: 0 }, createdAt: new Date('2026-03-14T09:00:00Z'), updatedAt: new Date('2026-03-19T16:00:00Z') },
    // Nii <-> Kwadwo about Kasoa
    { participants: [t7, pm2], propertyId: props[28]._id.toString(), lastMessage: { text: 'I have a valid contract until December. Please provide any notice in writing.', senderId: t7, createdAt: new Date('2026-03-20T12:00:00Z') }, unreadCount: { [t7]: 0, [pm2]: 1 }, createdAt: new Date('2026-03-19T08:00:00Z'), updatedAt: new Date('2026-03-20T12:00:00Z') },
    // Serwa <-> Kwaku about Kaneshie shop
    { participants: [t8, l3], propertyId: props[17]._id.toString(), lastMessage: { text: 'Ok I will pay the rent on Monday. Business was slow this month.', senderId: t8, createdAt: new Date('2026-03-20T15:00:00Z') }, unreadCount: { [t8]: 0, [l3]: 1 }, createdAt: new Date('2026-03-18T11:00:00Z'), updatedAt: new Date('2026-03-20T15:00:00Z') },
  ])

  const [c1, c2, c3, c4, c5, c6, c7, c8] = convos.map(c => c._id.toString())

  await Message.insertMany([
    // Conversation 1: Kwame <-> Yaw (7 messages)
    { conversationId: c1, senderId: t1, text: 'Good morning Mr. Boateng. I wanted to ask about the water pressure in the apartment — it has been low this week.', read: true, createdAt: new Date('2026-03-10T09:00:00Z') },
    { conversationId: c1, senderId: l1, text: 'Good morning Kwame. Sorry about that. There has been some maintenance on the community water system.', read: true, createdAt: new Date('2026-03-10T09:15:00Z') },
    { conversationId: c1, senderId: t1, text: 'I see. Do you know when it will be fixed?', read: true, createdAt: new Date('2026-03-10T09:20:00Z') },
    { conversationId: c1, senderId: l1, text: 'The community management says by end of this week. I will follow up with them.', read: true, createdAt: new Date('2026-03-10T09:25:00Z') },
    { conversationId: c1, senderId: t1, text: 'Thank you. Also, the kitchen sink has been dripping a bit. Could we get a plumber?', read: true, createdAt: new Date('2026-03-15T10:00:00Z') },
    { conversationId: c1, senderId: l1, text: 'Of course. Let me arrange that for you.', read: true, createdAt: new Date('2026-03-15T10:30:00Z') },
    { conversationId: c1, senderId: l1, text: 'I will get the plumber to check it tomorrow morning.', read: false, createdAt: new Date('2026-03-18T14:30:00Z') },

    // Conversation 2: Ama <-> Yaw (8 messages)
    { conversationId: c2, senderId: t2, text: 'Hello Mr. Boateng. The air conditioning unit in the studio stopped working yesterday evening.', read: true, createdAt: new Date('2026-03-12T08:00:00Z') },
    { conversationId: c2, senderId: l1, text: 'Hi Ama, sorry to hear that. Is it not turning on at all or just not cooling?', read: true, createdAt: new Date('2026-03-12T08:30:00Z') },
    { conversationId: c2, senderId: t2, text: 'It turns on but makes a loud noise and does not cool at all.', read: true, createdAt: new Date('2026-03-12T08:35:00Z') },
    { conversationId: c2, senderId: l1, text: 'That sounds like a compressor issue. I will send a technician today.', read: true, createdAt: new Date('2026-03-12T09:00:00Z') },
    { conversationId: c2, senderId: t2, text: 'Thank you! What time should I expect them?', read: true, createdAt: new Date('2026-03-12T09:05:00Z') },
    { conversationId: c2, senderId: l1, text: 'Between 2pm and 4pm. His name is Kwadwo and he will call you before coming.', read: true, createdAt: new Date('2026-03-12T09:30:00Z') },
    { conversationId: c2, senderId: l1, text: 'Kwadwo says he replaced the capacitor and the AC should be working fine now. Let me know if there are any more issues.', read: true, createdAt: new Date('2026-03-13T17:00:00Z') },
    { conversationId: c2, senderId: t2, text: 'Thank you, I appreciate the quick response!', read: false, createdAt: new Date('2026-03-17T11:15:00Z') },

    // Conversation 3: Kofi <-> Adjoa (6 messages)
    { conversationId: c3, senderId: t3, text: 'Good afternoon Madam Adjoa. I wanted to confirm that I sent the March rent via bank transfer this morning.', read: true, createdAt: new Date('2026-03-05T10:00:00Z') },
    { conversationId: c3, senderId: l2, text: 'Good afternoon Kofi. Thank you for letting me know. I will check my account.', read: true, createdAt: new Date('2026-03-05T10:30:00Z') },
    { conversationId: c3, senderId: l2, text: 'I have not seen it yet. Bank transfers sometimes take a day. What bank did you use?', read: true, createdAt: new Date('2026-03-05T14:00:00Z') },
    { conversationId: c3, senderId: t3, text: 'I used GCB Bank. The reference number is GCB-2026-0305-7891.', read: true, createdAt: new Date('2026-03-05T14:15:00Z') },
    { conversationId: c3, senderId: l2, text: 'OK noted. I will check again tomorrow. Also, have you seen the payment on the RentOS platform?', read: true, createdAt: new Date('2026-03-05T14:30:00Z') },
    { conversationId: c3, senderId: t3, text: 'Yes the bank transfer went through. Receipt attached to payments.', read: true, createdAt: new Date('2026-03-16T16:45:00Z') },

    // Conversation 4: Kwame <-> Adjoa about Ridge (5 messages)
    { conversationId: c4, senderId: t1, text: 'Hello Madam Darko. I saw your Furnished 1-Bedroom at Ridge listing and I am very interested. Is it still available?', read: true, createdAt: new Date('2026-03-15T14:00:00Z') },
    { conversationId: c4, senderId: l2, text: 'Hello Kwame! Yes it is still available. Would you like to schedule a viewing?', read: true, createdAt: new Date('2026-03-15T14:30:00Z') },
    { conversationId: c4, senderId: t1, text: 'Yes please. I am available this Saturday or next Monday. The rent is GHS 3,500 with 3 months advance, correct?', read: true, createdAt: new Date('2026-03-15T14:45:00Z') },
    { conversationId: c4, senderId: l2, text: 'That is correct. Saturday at 10am works. I will send you the exact directions. What is the earliest you could move in?', read: true, createdAt: new Date('2026-03-15T15:00:00Z') },
    { conversationId: c4, senderId: l2, text: 'The earliest available move-in date would be April 1st.', read: false, createdAt: new Date('2026-03-19T09:20:00Z') },

    // Conversation 5: Akua <-> Kwaku about Trasacco pool (4 messages)
    { conversationId: c5, senderId: t5, text: 'Good morning Mr. Agyemang. I need to raise an issue about the estate swimming pool — it has not been maintained for over 2 months now. The pool is green and unusable.', read: true, createdAt: new Date('2026-03-18T08:00:00Z') },
    { conversationId: c5, senderId: l3, text: 'Good morning Madam Amoah. I apologize for the inconvenience. I was not aware of the severity of the issue.', read: true, createdAt: new Date('2026-03-18T08:30:00Z') },
    { conversationId: c5, senderId: t5, text: 'This is unacceptable given the rent level. Pool access is part of our agreement and the amenity fees. I have filed a formal dispute on RentOS as well.', read: true, createdAt: new Date('2026-03-18T09:00:00Z') },
    { conversationId: c5, senderId: l3, text: 'I have reported the pool issue to the estate management. They promised to fix it by next week.', read: false, createdAt: new Date('2026-03-20T10:00:00Z') },

    // Conversation 6: Yeboah <-> Yaw about jacuzzi (4 messages)
    { conversationId: c6, senderId: t6, text: 'Hi Mr. Boateng, the jacuzzi on the rooftop seems to have a water circulation problem. The jets are not working properly.', read: true, createdAt: new Date('2026-03-14T09:00:00Z') },
    { conversationId: c6, senderId: l1, text: 'Hi Yeboah, thanks for reporting. I will have the maintenance team take a look.', read: true, createdAt: new Date('2026-03-14T10:00:00Z') },
    { conversationId: c6, senderId: t6, text: 'Thank you. When can they come? I work from home so any day works for me.', read: true, createdAt: new Date('2026-03-14T10:15:00Z') },
    { conversationId: c6, senderId: l1, text: 'No problem, the jacuzzi maintenance team will come this Saturday.', read: false, createdAt: new Date('2026-03-19T16:00:00Z') },

    // Conversation 7: Nii <-> Kwadwo about eviction threat (4 messages)
    { conversationId: c7, senderId: pm2, text: 'Good morning Nii. The property owner has asked me to inform you that they plan to renovate the building. You may need to find alternative accommodation.', read: true, createdAt: new Date('2026-03-19T08:00:00Z') },
    { conversationId: c7, senderId: t7, text: 'Mr. Mensah, my contract runs until December 2026. You cannot ask me to leave without proper written notice and valid grounds.', read: true, createdAt: new Date('2026-03-19T08:30:00Z') },
    { conversationId: c7, senderId: pm2, text: 'I understand your concern. Let me discuss with the owner and get back to you.', read: true, createdAt: new Date('2026-03-19T09:00:00Z') },
    { conversationId: c7, senderId: t7, text: 'I have a valid contract until December. Please provide any notice in writing.', read: false, createdAt: new Date('2026-03-20T12:00:00Z') },

    // Conversation 8: Serwa <-> Kwaku about late rent (4 messages)
    { conversationId: c8, senderId: l3, text: 'Hello Serwa. I notice the April rent for the shop space is overdue. Is everything alright?', read: true, createdAt: new Date('2026-03-18T11:00:00Z') },
    { conversationId: c8, senderId: t8, text: 'Good morning Mr. Agyemang. I apologize for the delay. Business has been slow this month because of the road construction blocking foot traffic.', read: true, createdAt: new Date('2026-03-18T11:30:00Z') },
    { conversationId: c8, senderId: l3, text: 'I understand that can be tough. Can you give me a timeline for payment? I need to keep records updated.', read: true, createdAt: new Date('2026-03-18T12:00:00Z') },
    { conversationId: c8, senderId: t8, text: 'Ok I will pay the rent on Monday. Business was slow this month.', read: false, createdAt: new Date('2026-03-20T15:00:00Z') },
  ])

  // ════════════════════════════════════════════
  // NOTIFICATIONS — comprehensive notifications
  // ════════════════════════════════════════════

  await Notification.insertMany([
    // Kwame (tenant1)
    { userId: t1, title: 'Rent Due Soon', message: 'Your rent payment of GHS 3,000 for April 2026 is due on April 1st.', channel: 'in_app', read: false, actionUrl: '/payments' },
    { userId: t1, title: 'Savings Goal Update', message: "You're 58% towards your rent savings goal of GHS 15,000. Keep it up!", channel: 'in_app', read: false, actionUrl: '/savings' },
    { userId: t1, title: 'Dispute Update', message: 'Your rent increase dispute has been moved to mediation. Next session: March 25, 2026.', channel: 'in_app', read: true, actionUrl: '/disputes' },
    { userId: t1, title: 'Payment Confirmed', message: 'Your rent payment of GHS 3,000 for March 2026 has been confirmed via MTN MoMo.', channel: 'in_app', read: true },
    { userId: t1, title: 'Loan Repayment Due', message: 'Your micro-loan repayment of GHS 348.70 is due on March 15, 2026.', channel: 'in_app', read: false, actionUrl: '/savings' },
    { userId: t1, title: 'Investment Update', message: 'Your 91-day Treasury Bill of GHS 5,000 matures on April 16, 2026.', channel: 'in_app', read: false },
    // Ama (tenant2)
    { userId: t2, title: 'Rent Due Soon', message: 'Your rent payment of GHS 1,800 for April 2026 is due on April 1st.', channel: 'in_app', read: false, actionUrl: '/payments' },
    { userId: t2, title: 'Maintenance Dispute Filed', message: 'Your maintenance dispute for 8 Sixth Street has been filed. Reference: DISP-002.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    { userId: t2, title: 'Savings Milestone', message: 'You have saved GHS 1,800 towards your GHS 5,000 goal — 36% complete!', channel: 'in_app', read: true, actionUrl: '/savings' },
    // Kofi (tenant3)
    { userId: t3, title: 'Savings Plan Completed', message: 'Congratulations! Your savings plan of GHS 10,000 has been completed.', channel: 'in_app', read: true, actionUrl: '/savings' },
    { userId: t3, title: 'Agreement Pending Signature', message: 'A new agreement for 3-Bedroom House in Spintex is awaiting your signature.', channel: 'in_app', read: false, actionUrl: '/agreements' },
    { userId: t3, title: 'Dispute Resolved', message: 'Your illegal clause dispute has been resolved. Agreement amended successfully.', channel: 'in_app', read: true, actionUrl: '/disputes' },
    // Abena (tenant4)
    { userId: t4, title: 'Welcome to RentOS', message: 'Welcome to RentOS! Complete your tenant profile to improve your credit score and find better housing.', channel: 'in_app', read: true, actionUrl: '/profile' },
    { userId: t4, title: 'Payment Overdue', message: 'Your rent payment of GHS 2,200 for March 2026 is overdue. Please make payment to avoid penalties.', channel: 'in_app', read: false, actionUrl: '/payments' },
    { userId: t4, title: 'Loan Application', message: 'Your micro-loan application of GHS 1,000 is under review.', channel: 'in_app', read: false, actionUrl: '/savings' },
    // Akua (tenant5)
    { userId: t5, title: 'Payment Confirmed', message: 'Your rent payment of GHS 9,500 for March 2026 has been confirmed via bank transfer.', channel: 'in_app', read: true },
    { userId: t5, title: 'Dispute Filed', message: 'Your maintenance dispute regarding the swimming pool at Trasacco has been filed.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    { userId: t5, title: 'Investment Return', message: 'Your T-Bill investment of GHS 15,000 is performing well. Expected return: GHS 2,093.', channel: 'in_app', read: false },
    { userId: t5, title: 'Savings Progress', message: 'You are 56% towards your GHS 50,000 savings target. On track for June 2026!', channel: 'in_app', read: true, actionUrl: '/savings' },
    // Yeboah (tenant6)
    { userId: t6, title: 'Payment Confirmed', message: 'Your rent payment of GHS 7,000 for March 2026 has been confirmed via MTN MoMo.', channel: 'in_app', read: true },
    { userId: t6, title: 'Application Submitted', message: 'Your application for the 4-Bedroom House at Tema Community 20 has been submitted.', channel: 'in_app', read: false, actionUrl: '/applications' },
    { userId: t6, title: 'Loan Fully Repaid', message: 'Congratulations! Your micro-loan of GHS 4,000 has been fully repaid. Your credit score has been updated.', channel: 'in_app', read: true },
    // Nii (tenant7)
    { userId: t7, title: 'Payment Confirmed', message: 'Your rent payment of GHS 950 for March 2026 has been confirmed via MTN MoMo.', channel: 'in_app', read: true },
    { userId: t7, title: 'Dispute Filed', message: 'Your eviction dispute for the Kasoa apartment has been filed. A mediator will be assigned within 48 hours.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    { userId: t7, title: 'Application Approved', message: 'Your application for 1-Bedroom at Teshie-Nungua has been approved!', channel: 'in_app', read: false, actionUrl: '/applications' },
    // Serwa (tenant8)
    { userId: t8, title: 'Rent Reminder', message: 'Your shop rent of GHS 2,500 for April 2026 is coming up. Plan your payment.', channel: 'in_app', read: false, actionUrl: '/payments' },
    { userId: t8, title: 'Profile Incomplete', message: 'Complete your profile to improve your credit score and access micro-loans.', channel: 'in_app', read: false, actionUrl: '/profile' },
    // Landlord 1 (Yaw)
    { userId: l1, title: 'Payment Received', message: 'Kwame Asante paid GHS 3,000 for Apt 14 Jungle Road via MTN MoMo.', channel: 'in_app', read: false, actionUrl: '/payments' },
    { userId: l1, title: 'New Dispute Filed', message: 'A maintenance dispute has been filed by Ama Serwaa for 8 Sixth Street, Cantonments.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    { userId: l1, title: 'Rent Collection Summary', message: 'March 2026: 4 of 4 tenants paid on time. Total collected: GHS 17,300.', channel: 'in_app', read: false, actionUrl: '/payments' },
    { userId: l1, title: 'Property Views', message: 'Your 3-Bedroom House in Spintex received 15 new views this week.', channel: 'in_app', read: true, actionUrl: '/properties' },
    { userId: l1, title: 'New Application', message: 'Kofi Mensah has applied for the 4-Bedroom Luxury Villa at Airport Residential.', channel: 'in_app', read: false, actionUrl: '/applications' },
    // Landlord 2 (Adjoa)
    { userId: l2, title: 'Payment Received', message: 'Kofi Mensah paid GHS 1,500 for Ahodwo apartment via bank transfer.', channel: 'in_app', read: false, actionUrl: '/payments' },
    { userId: l2, title: 'New Inquiry', message: 'You have a new inquiry for Furnished 1-Bedroom at Ridge from a verified tenant.', channel: 'in_app', read: false, actionUrl: '/properties' },
    { userId: l2, title: 'New Application', message: 'Ama Serwaa has applied for the Townhouse in Takoradi Beach Road.', channel: 'in_app', read: false, actionUrl: '/applications' },
    // Landlord 3 (Kwaku)
    { userId: l3, title: 'Payment Received', message: 'Akua Amoah paid GHS 9,500 for Trasacco Valley apartment via bank transfer.', channel: 'in_app', read: false, actionUrl: '/payments' },
    { userId: l3, title: 'Dispute Filed Against You', message: 'A maintenance dispute has been filed regarding the swimming pool at Trasacco Valley.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    { userId: l3, title: 'Rent Overdue Alert', message: 'Serwa Badu has not paid the April rent for Kaneshie Market shop space.', channel: 'in_app', read: false, actionUrl: '/payments' },
    // Landlord 4 (Efua)
    { userId: l4, title: 'Property Views Summary', message: 'Your properties received 52 total views this week. Serviced Apartment at Airport leads with 35 views.', channel: 'in_app', read: false, actionUrl: '/properties' },
    // Property Manager 1 (Nana)
    { userId: pm1, title: 'Tenant Payment', message: 'Abena Osei — GHS 2,200 payment for March 2026 is pending.', channel: 'in_app', read: false, actionUrl: '/payments' },
    { userId: pm1, title: 'Maintenance Request', message: 'Property at Achimota requires plumbing maintenance. Status: maintenance_required.', channel: 'in_app', read: false, actionUrl: '/properties' },
    { userId: pm1, title: 'Dispute Escalated', message: 'A deposit refund dispute by Abena Osei has been escalated to Rent Control.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    { userId: pm1, title: 'New Application', message: 'Akua Amoah has applied for the Executive 2-Bedroom at Labone.', channel: 'in_app', read: false, actionUrl: '/applications' },
    // Property Manager 2 (Kwadwo)
    { userId: pm2, title: 'Dispute Filed Against You', message: 'Nii Armah has filed an eviction dispute for the Kasoa apartment.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    { userId: pm2, title: 'Payment Received', message: 'Nii Armah paid GHS 950 for Kasoa apartment via MTN MoMo.', channel: 'in_app', read: true, actionUrl: '/payments' },
    // Government
    { userId: gov._id.toString(), title: 'Compliance Alert', message: '1 agreement flagged with potential illegal clauses this week (annual review clause exceeding limits).', channel: 'in_app', read: false, actionUrl: '/government' },
    { userId: gov._id.toString(), title: 'Dispute Escalation', message: 'A security deposit dispute has been escalated for Rent Control review. Reference: DISP-004.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    { userId: gov._id.toString(), title: 'Platform Summary', message: 'Weekly report: 18 users, 30 properties, 12 active agreements, 6 disputes. GHS 312,400 in total payment volume.', channel: 'in_app', read: false },
    // Legal officer
    { userId: legal._id.toString(), title: 'New Escalation', message: 'A deposit refund dispute requires legal review. Tenant claims inspection was passed but deposit not returned.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    { userId: legal._id.toString(), title: 'Compliance Review', message: 'Monthly compliance review: 3 agreements flagged, 1 requires clause amendment, 1 has expired advance period, 1 eviction dispute pending.', channel: 'in_app', read: true },
    { userId: legal._id.toString(), title: 'Eviction Dispute', message: 'An eviction dispute at Kasoa requires legal assessment. Tenant claims verbal eviction without proper notice.', channel: 'in_app', read: false, actionUrl: '/disputes' },
    // Admin
    { userId: admin._id.toString(), title: 'System Health', message: 'All services operational. Database: healthy. Payment gateway: connected. Uptime: 99.97% this month.', channel: 'in_app', read: false },
    { userId: admin._id.toString(), title: 'New User Registrations', message: 'This week: 5 new tenant registrations, 2 new landlords. Total platform users: 18.', channel: 'in_app', read: false },
    { userId: admin._id.toString(), title: 'Payment Volume Report', message: 'March 2026 payment volume: GHS 89,300 across 42 transactions. 3 failed, 2 refunded, 2 processing.', channel: 'in_app', read: false, actionUrl: '/admin/payments' },
    { userId: admin._id.toString(), title: 'Dispute Escalation Alert', message: '2 disputes have been escalated and require administrative attention.', channel: 'in_app', read: false, actionUrl: '/disputes' },
  ])

  // ════════════════════════════════════════════
  // FAVORITES — tenants who favorited properties
  // ════════════════════════════════════════════

  await Favorite.insertMany([
    // Kwame favorited 4 properties
    { userId: t1, propertyId: props[2]._id.toString() },   // Spintex house
    { userId: t1, propertyId: props[4]._id.toString() },   // Airport Residential villa
    { userId: t1, propertyId: props[11]._id.toString() },  // Ridge furnished apt
    { userId: t1, propertyId: props[27]._id.toString() },  // Labone executive apt
    // Ama favorited 3 properties
    { userId: t2, propertyId: props[9]._id.toString() },   // Takoradi townhouse
    { userId: t2, propertyId: props[11]._id.toString() },  // Ridge furnished apt
    { userId: t2, propertyId: props[27]._id.toString() },  // Labone executive apt
    // Kofi favorited 2 properties
    { userId: t3, propertyId: props[4]._id.toString() },   // Airport Residential villa
    { userId: t3, propertyId: props[9]._id.toString() },   // Takoradi townhouse
    // Abena favorited 1 property
    { userId: t4, propertyId: props[10]._id.toString() },  // Madina room
    // Akua favorited 3 properties
    { userId: t5, propertyId: props[27]._id.toString() },  // Labone executive apt
    { userId: t5, propertyId: props[4]._id.toString() },   // Airport Residential villa
    { userId: t5, propertyId: props[25]._id.toString() },  // Airport serviced apt
    // Yeboah favorited 3 properties
    { userId: t6, propertyId: props[19]._id.toString() },  // Tema Community 20 house
    { userId: t6, propertyId: props[2]._id.toString() },   // Spintex house
    { userId: t6, propertyId: props[15]._id.toString() },  // Trasacco Valley
    // Nii favorited 2 properties
    { userId: t7, propertyId: props[29]._id.toString() },  // Teshie-Nungua
    { userId: t7, propertyId: props[18]._id.toString() },  // Cape Coast
    // Serwa favorited 1 property
    { userId: t8, propertyId: props[16]._id.toString() },  // Dansoman
  ])

  // ════════════════════════════════════════════
  // PROFILE ACCESS — landlords requesting tenant profiles
  // ════════════════════════════════════════════

  await ProfileAccess.insertMany([
    { requesterId: l1, tenantId: t1, propertyId: props[0]._id.toString(), status: 'approved', message: 'Need to review tenant profile for lease renewal.', requestedAt: new Date('2026-02-01'), respondedAt: new Date('2026-02-02') },
    { requesterId: l1, tenantId: t2, propertyId: props[1]._id.toString(), status: 'approved', message: 'Reviewing profile for current lease.', requestedAt: new Date('2025-08-20'), respondedAt: new Date('2025-08-21') },
    { requesterId: l2, tenantId: t1, propertyId: props[11]._id.toString(), status: 'pending', message: 'Interested tenant inquired about Ridge apartment. Need to view profile before scheduling viewing.', requestedAt: new Date('2026-03-19') },
    { requesterId: l1, tenantId: t3, propertyId: props[2]._id.toString(), status: 'approved', message: 'Reviewing profile for the Spintex house application.', requestedAt: new Date('2026-03-06'), respondedAt: new Date('2026-03-07') },
    { requesterId: l2, tenantId: t4, propertyId: props[11]._id.toString(), status: 'denied', message: 'Reviewing applicant for Ridge apartment.', requestedAt: new Date('2026-03-14'), respondedAt: new Date('2026-03-15') },
    { requesterId: pm1, tenantId: t3, propertyId: props[27]._id.toString(), status: 'pending', message: 'Prospective tenant expressed interest in the Labone executive apartment.', requestedAt: new Date('2026-03-20') },
    { requesterId: l1, tenantId: t1, propertyId: props[3]._id.toString(), status: 'revoked', message: 'Profile access for Osu room — tenancy ended.', requestedAt: new Date('2024-01-05'), respondedAt: new Date('2024-01-06') },
    { requesterId: l3, tenantId: t5, propertyId: props[15]._id.toString(), status: 'approved', message: 'Reviewing diplomat tenant for Trasacco Valley.', requestedAt: new Date('2025-07-15'), respondedAt: new Date('2025-07-16') },
    { requesterId: l1, tenantId: t6, propertyId: props[7]._id.toString(), status: 'approved', message: 'Reviewing profile for Roman Ridge penthouse lease.', requestedAt: new Date('2025-09-20'), respondedAt: new Date('2025-09-21') },
    { requesterId: l3, tenantId: t6, propertyId: props[19]._id.toString(), status: 'pending', message: 'Reviewing application for Tema Community 20 house.', requestedAt: new Date('2026-03-20') },
    { requesterId: pm2, tenantId: t7, propertyId: props[28]._id.toString(), status: 'approved', message: 'Reviewing profile for Kasoa apartment lease.', requestedAt: new Date('2025-11-25'), respondedAt: new Date('2025-11-26') },
  ])

  // ════════════════════════════════════════════
  // INVITATIONS — sample invitations in various states
  // ════════════════════════════════════════════

  const crypto = await import('crypto')

  await Invitation.insertMany([
    {
      email: 'mensah.akufo@rentos.gh',
      roles: ['government'],
      permissions: ['users:view', 'properties:view', 'properties:review', 'agreements:view', 'disputes:view', 'disputes:manage', 'analytics:view', 'analytics:export', 'simulation:run'],
      invitedBy: superAdmin._id.toString(),
      status: 'pending',
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    },
    {
      email: 'grace.tetteh@rentos.gh',
      roles: ['legal_officer'],
      permissions: ['users:view', 'properties:view', 'agreements:view', 'disputes:view', 'disputes:manage', 'legal:view', 'legal:create', 'legal:edit'],
      invitedBy: superAdmin._id.toString(),
      status: 'pending',
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    },
    {
      email: 'daniel.quartey@rentos.gh',
      roles: ['admin'],
      permissions: ['users:view', 'users:create', 'users:edit', 'users:invite', 'properties:view', 'properties:edit', 'properties:review', 'analytics:view', 'blog:view', 'blog:create', 'blog:edit'],
      invitedBy: ofiAdmin._id.toString(),
      status: 'pending',
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
    {
      email: 'priscilla.appiah@rentos.gh',
      roles: ['admin'],
      permissions: ['users:view', 'properties:view', 'payments:view', 'disputes:view', 'analytics:view'],
      invitedBy: admin._id.toString(),
      status: 'expired',
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date('2026-03-10'), // already expired
    },
    {
      email: 'eric.asiedu@rentos.gh',
      roles: ['property_manager', 'landlord'],
      permissions: [],
      invitedBy: ofiAdmin._id.toString(),
      status: 'accepted',
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date('2026-04-01'),
      acceptedAt: new Date('2026-03-18'),
    },
    {
      email: 'freelance.inspector@rentos.gh',
      roles: ['government'],
      permissions: ['properties:view', 'properties:review', 'agreements:view'],
      invitedBy: superAdmin._id.toString(),
      status: 'revoked',
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date('2026-04-15'),
    },
  ])

  // ════════════════════════════════════════════
  // FINANCING — offers, applications, contracts
  // ════════════════════════════════════════════

  const financingOffers = await FinancingOffer.insertMany([
    {
      financierId: financier1._id.toString(),
      name: 'Bloom Rent Advance',
      productType: 'rent_advance',
      description: 'Pay your landlord upfront for the year, repay us monthly.',
      minAmount: 1000, maxAmount: 60000,
      minTenureMonths: 6, maxTenureMonths: 24,
      annualInterestRate: 18, processingFeePct: 2, lateFeePct: 5,
      minCreditScore: 60,
      requiresEmployment: true, requiresPayrollDeduction: false, active: true,
    },
    {
      financierId: financier1._id.toString(),
      name: 'Bloom Deposit Loan',
      productType: 'deposit_loan',
      description: 'Cover your security deposit and move-in costs.',
      minAmount: 500, maxAmount: 15000,
      minTenureMonths: 3, maxTenureMonths: 12,
      annualInterestRate: 22, processingFeePct: 2.5, lateFeePct: 6,
      minCreditScore: 50,
      requiresEmployment: false, requiresPayrollDeduction: false, active: true,
    },
    {
      financierId: financier2._id.toString(),
      name: 'RentPlus Salary-Linked',
      productType: 'rent_advance',
      description: 'Lower rate when repaid via payroll deduction.',
      minAmount: 2000, maxAmount: 80000,
      minTenureMonths: 12, maxTenureMonths: 36,
      annualInterestRate: 14, processingFeePct: 1.5, lateFeePct: 4,
      minCreditScore: 65,
      requiresEmployment: true, requiresPayrollDeduction: true, active: true,
    },
  ])

  // ════════════════════════════════════════════
  // EMPLOYERS — corporate profiles + employees
  // ════════════════════════════════════════════

  const [employer1, employer2] = await Employer.insertMany([
    {
      ownerId: employerOwner1._id.toString(),
      legalName: 'Scancom PLC (MTN Ghana)',
      tradingName: 'MTN Ghana',
      tin: 'GH-TIN-001234567',
      ssnitEmployerNumber: 'SSN-EMP-12345',
      industry: 'Telecommunications',
      address: { street: 'Independence Avenue', city: 'Accra', region: 'Greater Accra', digitalAddress: 'GA-184-3528' },
      contactEmail: 'mtn-hr@rentos.gh', contactPhone: '0244111000',
      payrollCycle: 'monthly', paydayDayOfMonth: 28,
      verificationStatus: 'verified', verifiedBy: gov._id.toString(), verifiedAt: now, totalEmployees: 0,
    },
    {
      ownerId: employerOwner2._id.toString(),
      legalName: 'University of Cape Coast',
      tradingName: 'UCC',
      tin: 'GH-TIN-009876543',
      ssnitEmployerNumber: 'SSN-EMP-54321',
      industry: 'Education',
      address: { street: 'University Ave', city: 'Cape Coast', region: 'Central', digitalAddress: 'CC-094-1212' },
      contactEmail: 'ucc-hr@rentos.gh', contactPhone: '0244222000',
      payrollCycle: 'monthly', paydayDayOfMonth: 25,
      verificationStatus: 'verified', verifiedBy: gov._id.toString(), verifiedAt: now, totalEmployees: 0,
    },
  ])

  // Link a few tenants as employees
  const employments = await Employment.insertMany([
    { employerId: employer1._id.toString(), userId: tenant1._id.toString(), staffNumber: 'MTN-1001', jobTitle: 'Senior Software Engineer', netMonthlySalary: 8500, status: 'active', startDate: '2023-01-15' },
    { employerId: employer1._id.toString(), userId: tenant2._id.toString(), staffNumber: 'MTN-1002', jobTitle: 'Marketing Manager', netMonthlySalary: 6200, status: 'active', startDate: '2022-06-01' },
    { employerId: employer1._id.toString(), userId: tenant6._id.toString(), staffNumber: 'MTN-1003', jobTitle: 'Finance Director', netMonthlySalary: 12000, status: 'active', startDate: '2021-03-12' },
    { employerId: employer2._id.toString(), userId: tenant5._id.toString(), staffNumber: 'UCC-2001', jobTitle: 'Senior Lecturer', netMonthlySalary: 7000, status: 'active', startDate: '2020-09-01' },
  ])
  employer1.totalEmployees = 3
  employer2.totalEmployees = 1
  await Promise.all([employer1.save(), employer2.save()])

  // ════════════════════════════════════════════
  // FINANCING — sample application + active contract
  // ════════════════════════════════════════════

  const sampleAgreement = await Agreement.findOne({ tenantId: tenant1._id.toString(), status: 'active' })
  if (sampleAgreement) {
    const offer = financingOffers[0]
    const application = await FinancingApplication.create({
      applicantId: tenant1._id.toString(),
      applicantName: `${tenant1.firstName} ${tenant1.lastName}`,
      financierId: offer.financierId,
      offerId: offer._id.toString(),
      agreementId: sampleAgreement._id.toString(),
      propertyId: sampleAgreement.propertyId,
      amountRequested: 18000,
      tenureMonths: 12,
      purpose: 'Pay 12-month rent upfront for new apartment in East Legon',
      status: 'approved',
      decisionNotes: 'Approved — strong credit, stable employment',
      decidedBy: financier1._id.toString(),
      decidedAt: now,
      creditScoreAtApply: 78,
      monthlyIncomeAtApply: 8500,
      employerId: employer1._id.toString(),
      willUsePayrollDeduction: true,
    })

    const { monthlyPayment, totalRepayable, schedule } = buildAmortizationSchedule({
      principal: 18000,
      annualInterestRate: 18,
      tenureMonths: 12,
      startDate: new Date(),
    })
    // Mark first 2 installments paid
    schedule[0].status = 'paid'
    schedule[0].amountPaid = schedule[0].amountDue
    schedule[0].paidAt = now
    schedule[1].status = 'paid'
    schedule[1].amountPaid = schedule[1].amountDue
    schedule[1].paidAt = now

    await FinancingContract.create({
      applicationId: application._id.toString(),
      financierId: offer.financierId,
      applicantId: tenant1._id.toString(),
      applicantName: `${tenant1.firstName} ${tenant1.lastName}`,
      agreementId: sampleAgreement._id.toString(),
      landlordId: sampleAgreement.landlordId,
      productType: 'rent_advance',
      principal: 18000,
      annualInterestRate: 18,
      tenureMonths: 12,
      processingFee: 360,
      monthlyPayment,
      totalRepayable,
      amountRepaid: schedule[0].amountDue + schedule[1].amountDue,
      status: 'active',
      disbursedAt: now,
      disbursementReference: 'FIN-DEMO-001',
      schedule,
      signedByApplicant: true,
      signedByFinancier: true,
      signedAt: now,
    })

    // Active deduction mandate from tenant1's MTN salary toward the financing contract
    const employment1 = employments[0]
    await DeductionMandate.create({
      employmentId: employment1._id.toString(),
      employerId: employer1._id.toString(),
      employeeId: tenant1._id.toString(),
      allocationType: 'loan_repayment',
      targetEntityId: application._id.toString(),
      targetEntityType: 'financing_contract',
      targetLabel: 'Bloom Rent Advance — 12-month',
      amountType: 'fixed',
      amount: monthlyPayment,
      startDate: now.slice(0, 10),
      noticePeriodDays: 7,
      signatureHash: crypto2.createHash('sha256').update(`demo-signature-${tenant1._id}`).digest('hex'),
      signedAt: now,
      status: 'active',
      approvedBy: employerOwner1._id.toString(),
      approvedByEmployerAt: now,
    })
  }

  // ════════════════════════════════════════════
  // PAYROLL — extra deduction mandates + payroll runs
  // ════════════════════════════════════════════

  const demoSig = (s: string) => crypto2.createHash('sha256').update(s).digest('hex')
  const existingMandate = await DeductionMandate.findOne({ employeeId: t1 })
  const extraMandates = await DeductionMandate.insertMany([
    { employmentId: employments[1]._id.toString(), employerId: employer1._id.toString(), employeeId: t2, allocationType: 'rent', targetEntityId: agr2._id.toString(), targetEntityType: 'agreement', targetLabel: 'Rent — Studio Apartment, Cantonments', amountType: 'fixed', amount: 1800, startDate: '2026-01-01', noticePeriodDays: 7, signatureHash: demoSig('demo-signature-ama'), signedAt: '2025-12-20T10:00:00.000Z', status: 'active', approvedBy: employerOwner1._id.toString(), approvedByEmployerAt: now },
    { employmentId: employments[2]._id.toString(), employerId: employer1._id.toString(), employeeId: t6, allocationType: 'wallet_topup', targetEntityType: 'wallet', targetLabel: 'RentGuard wallet top-up', amountType: 'fixed', amount: 500, startDate: '2026-02-01', noticePeriodDays: 7, signatureHash: demoSig('demo-signature-yeboah'), signedAt: '2026-01-25T10:00:00.000Z', status: 'active', approvedBy: employerOwner1._id.toString(), approvedByEmployerAt: now },
    { employmentId: employments[3]._id.toString(), employerId: employer2._id.toString(), employeeId: t5, allocationType: 'savings', targetLabel: 'RentGuard savings — 10% of net salary', amountType: 'percentage', amount: 10, startDate: '2026-03-01', noticePeriodDays: 14, signatureHash: demoSig('demo-signature-akua'), signedAt: '2026-02-20T10:00:00.000Z', status: 'active', approvedBy: employerOwner2._id.toString(), approvedByEmployerAt: now },
  ])

  const mtnMandates = [existingMandate, extraMandates[0], extraMandates[1]].filter(Boolean)
  const mtnEmpNames: Record<string, string> = { [t1]: 'Kwame Asante', [t2]: 'Ama Serwaa', [t6]: 'Yeboah Frimpong' }
  const mtnRun = (label: string, pStart: string, pEnd: string, payDate: string, processedAt: string) => {
    const deductions = mtnMandates.map((m) => ({
      mandateId: m!._id.toString(),
      employeeId: m!.employeeId,
      employeeName: mtnEmpNames[m!.employeeId] ?? 'Employee',
      allocationType: m!.allocationType,
      targetEntityId: m!.targetEntityId,
      targetEntityType: m!.targetEntityType,
      amount: m!.amount,
      status: 'disbursed',
      disbursementReference: `PRL-MTN-${label.replace(/\s/g, '')}-${m!._id.toString().slice(-6)}`,
    }))
    const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0)
    const totalGross = 8500 + 6200 + 12000
    return {
      employerId: employer1._id.toString(),
      periodLabel: label, periodStart: pStart, periodEnd: pEnd, scheduledPayDate: payDate,
      totalGross, totalDeductions, totalNet: totalGross - totalDeductions,
      employeeCount: 3, deductions,
      status: 'processed',
      approvedBy: employerOwner1._id.toString(), approvedAt: _addDays(payDate, -2),
      processedAt,
    }
  }
  await PayrollRun.insertMany([
    mtnRun('May 2026', '2026-05-01', '2026-05-31', '2026-05-28', '2026-05-28T08:30:00.000Z'),
    mtnRun('June 2026', '2026-06-01', '2026-06-30', '2026-06-28', '2026-06-28T08:30:00.000Z'),
    {
      employerId: employer2._id.toString(),
      periodLabel: 'June 2026', periodStart: '2026-06-01', periodEnd: '2026-06-30', scheduledPayDate: '2026-06-25',
      totalGross: 7000, totalDeductions: 700, totalNet: 6300,
      employeeCount: 1,
      deductions: [{
        mandateId: extraMandates[2]._id.toString(), employeeId: t5, employeeName: 'Akua Amoah',
        allocationType: 'savings', targetEntityType: 'savings_plan', amount: 700, status: 'queued',
      }],
      status: 'pending_approval',
    },
  ])

  // ════════════════════════════════════════════
  // WORKERS — 4 skilled tradespeople
  // ════════════════════════════════════════════

  const workers = await Worker.insertMany([
    {
      name: 'Kwasi Osei', phone: '0244441111', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
      trades: ['plumbing'], skills: ['Pipe fitting', 'Leak detection', 'Water heater repair', 'Bathroom installation'],
      bio: 'Certified plumber with 8 years experience. Specializes in residential plumbing repairs and bathroom renovations. Available for emergencies.',
      location: 'Accra', serviceRadius: 15, hourlyRate: 80,
      fixedRates: { 'pipe_repair': 200, 'bathroom_install': 2500, 'water_heater': 600 },
      rating: 4.7, reviewCount: 23, completedJobs: 45, verificationLevel: 'verified', emergencyAvailable: true,
      status: 'available', availability: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false },
      yearsExperience: 8, idType: 'ghana_card', idNumber: 'GHA-123456789-0',
    },
    {
      name: 'Akosua Badu', phone: '0245552222', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
      trades: ['electrical'], skills: ['Wiring', 'Circuit breaker repair', 'Generator installation', 'Solar panel setup'],
      bio: 'Licensed electrician serving Accra and Tema. Expert in both residential and commercial electrical work. Safety-first approach.',
      location: 'Accra', serviceRadius: 20, hourlyRate: 100,
      fixedRates: { 'wiring': 1500, 'breaker_repair': 300, 'generator_install': 3500 },
      rating: 4.5, reviewCount: 18, completedJobs: 32, verificationLevel: 'verified', emergencyAvailable: true,
      status: 'available', availability: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
      yearsExperience: 6, idType: 'ghana_card', idNumber: 'GHA-234567890-1',
    },
    {
      name: 'Yaw Ansah', phone: '0246663333', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
      trades: ['carpentry', 'painting'], skills: ['Furniture repair', 'Door installation', 'Interior painting', 'Wood finishing'],
      bio: 'Master carpenter and painter with 12 years of craftsmanship. Creates custom furniture and handles all woodwork repairs.',
      location: 'Kumasi', serviceRadius: 10, hourlyRate: 60,
      fixedRates: { 'door_install': 400, 'furniture_repair': 350, 'room_painting': 800 },
      rating: 4.9, reviewCount: 31, completedJobs: 58, verificationLevel: 'verified', emergencyAvailable: false,
      status: 'available', availability: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
      yearsExperience: 12, idType: 'voters_id', idNumber: 'VOTER-987654321-0',
    },
    {
      name: 'Adjoa Manu', phone: '0247774444', photo: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400',
      trades: ['pest', 'cleaning'], skills: ['Fumigation', 'Termite control', 'Deep cleaning', 'Sanitization'],
      bio: 'Professional pest control specialist and cleaner. Licensed fumigator with eco-friendly solutions.',
      location: 'Tema', serviceRadius: 12, hourlyRate: 55,
      fixedRates: { 'fumigation': 600, 'deep_clean': 400, 'termite_treatment': 1200 },
      rating: 4.3, reviewCount: 15, completedJobs: 27, verificationLevel: 'basic', emergencyAvailable: false,
      status: 'available', availability: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false },
      yearsExperience: 4, idType: 'ghana_card', idNumber: 'GHA-345678901-2',
    },
  ])

  const [plumber, electrician, carpenter] = workers

  // ════════════════════════════════════════════
  // SERVICE BOOKINGS — 3 bookings across states
  // ════════════════════════════════════════════

  await ServiceBooking.insertMany([
    {
      requesterId: t1, requesterRole: 'tenant', workerId: plumber._id.toString(),
      type: 'repair', description: 'Kitchen sink leaking badly under the cabinet. Need urgent repair.',
      status: 'pending', scheduledDate: _addDays(now, 2), scheduledTime: '09:00',
      estimatedCost: 200, paymentStatus: 'pending', notes: [],
      propertyId: props[0]._id.toString(),
    },
    {
      requesterId: l1, requesterRole: 'landlord', workerId: electrician._id.toString(),
      type: 'repair', description: 'Circuit breaker keeps tripping in the main house. Need inspection and repair.',
      status: 'confirmed', scheduledDate: _addDays(now, 1), scheduledTime: '14:00',
      estimatedCost: 500, quoteAmount: 450, quoteProvided: true, quoteAccepted: true, paymentStatus: 'pending', notes: [{ text: 'Tenant will be home to provide access.', by: l1, at: now }],
      propertyId: props[0]._id.toString(),
    },
    {
      requesterId: t3, requesterRole: 'tenant', workerId: carpenter._id.toString(),
      type: 'repair', description: 'Bedroom door frame is damaged. Need repair and repainting.',
      status: 'completed', scheduledDate: _addDays(now, -5), scheduledTime: '10:00',
      estimatedCost: 400, finalCost: 380, paymentStatus: 'paid', rating: 5, review: 'Excellent work! Door looks brand new. Very professional.',
      notes: [{ text: 'Job completed ahead of schedule.', by: carpenter.userId, at: _addDays(now, -5) }],
      propertyId: props[8]._id.toString(),
    },
  ])

  // ════════════════════════════════════════════
  // MAINTENANCE REQUESTS — 4 requests for landlord/tenant views
  // ════════════════════════════════════════════

  await MaintenanceRequest.insertMany([
    {
      propertyId: props[0]._id.toString(), tenantId: t1, landlordId: l1,
      title: 'Leaking kitchen pipe', description: 'Water leaking from under the kitchen sink. Getting worse daily.',
      category: 'plumbing', priority: 'high', status: 'requested',
      images: [], createdAt: new Date('2026-03-15T10:00:00Z'), updatedAt: new Date('2026-03-20T08:00:00Z'),
    },
    {
      propertyId: props[1]._id.toString(), tenantId: t2, landlordId: l1,
      title: 'Power outage in bathroom', description: 'Bathroom lights and extractor fan not working. Checked fuse but seems like a wiring issue.',
      category: 'electrical', priority: 'medium', status: 'in_progress',
      images: [], createdAt: new Date('2026-03-18T14:00:00Z'), updatedAt: new Date('2026-03-19T09:00:00Z'),
    },
    {
      propertyId: props[8]._id.toString(), tenantId: t3, landlordId: l2,
      title: 'Termites in wooden door frames', description: 'Noticed termite damage on the front door frame. Needs fumigation before it spreads.',
      category: 'pest', priority: 'high', status: 'requested',
      images: [], createdAt: new Date('2026-03-10T11:00:00Z'), updatedAt: new Date('2026-03-10T11:00:00Z'),
    },
    {
      propertyId: props[2]._id.toString(), tenantId: t1, landlordId: l1,
      title: 'Peeling exterior paint', description: 'The paint on the back wall is peeling badly due to moisture. Need repainting.',
      category: 'structural', priority: 'low', status: 'completed',
      images: [], createdAt: new Date('2026-02-01T09:00:00Z'), updatedAt: new Date('2026-02-10T16:00:00Z'),
    },
  ])

  // ════════════════════════════════════════════════════════════
  // GENERATED BULK DATA — deterministic Ghanaian rental market data
  // Seeded PRNG (mulberry32) — stable output across runs. No Math.random.
  // ════════════════════════════════════════════════════════════

  function mulberry32(seed: number) {
    return function () {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const rand = mulberry32(20260714)
  const rp = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const ri = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
  const chance = (p: number) => rand() < p
  const round50 = (n: number) => Math.round(n / 50) * 50
  const round2 = (n: number) => Math.round(n * 100) / 100
  const r4 = (n: number) => Math.round(n * 10000) / 10000
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const weighted = <T,>(weights: [T, number][]): T => {
    const total = weights.reduce((s, [, w]) => s + w, 0)
    let r = rand() * total
    for (const [v, w] of weights) { r -= w; if (r <= 0) return v }
    return weights[0][0]
  }
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
  const addMonths = (key: string, n: number) => {
    const [y, m] = key.split('-').map(Number)
    return monthKey(new Date(Date.UTC(y, m - 1 + n, 1)))
  }
  const monthRange = (from: string, to: string) => {
    const out: string[] = []
    let cur = from
    while (cur <= to) { out.push(cur); cur = addMonths(cur, 1) }
    return out
  }
  const MONTHS = monthRange('2025-10', '2026-07')
  const pickSome = (arr: string[], p: number, min = 0) => {
    const out = arr.filter(() => chance(p))
    while (out.length < min) out.push(rp(arr))
    return [...new Set(out)]
  }

  // ── Data pools ──

  const MALE_FIRST = ['Kwame', 'Kofi', 'Yaw', 'Kwabena', 'Kwaku', 'Fiifi', 'Kwadwo', 'Kwesi', 'Kojo', 'Nii', 'Edem', 'Selorm', 'Elikem', 'Mawuli', 'Bright', 'Emmanuel', 'Daniel', 'Samuel', 'Joseph', 'Michael', 'Richmond', 'Bernard', 'Frank', 'Isaac', 'Peter', 'Abdul', 'Ibrahim', 'Yussif', 'Alhassan', 'Godwin']
  const FEMALE_FIRST = ['Ama', 'Akosua', 'Efia', 'Esi', 'Araba', 'Adjoa', 'Abena', 'Akua', 'Adwoa', 'Yaa', 'Serwaa', 'Mawusi', 'Dzifa', 'Enyonam', 'Afi', 'Grace', 'Comfort', 'Priscilla', 'Vida', 'Esther', 'Hannah', 'Rebecca', 'Linda', 'Cynthia', 'Gifty', 'Mabel', 'Rashida', 'Fatima', 'Zainab', 'Patience']
  const SURNAMES = ['Mensah', 'Owusu', 'Boateng', 'Asante', 'Osei', 'Agyeman', 'Agyemang', 'Darko', 'Amoah', 'Quaye', 'Tetteh', 'Adjei', 'Appiah', 'Nyarko', 'Frimpong', 'Oppong', 'Acheampong', 'Antwi', 'Baffour', 'Sarpong', 'Addo', 'Tagoe', 'Lartey', 'Nartey', 'Armah', 'Annan', 'Coffie', 'Agbeko', 'Doe', 'Ahiable', 'Tamakloe', 'Yakubu', 'Mohammed', 'Sulemana', 'Abdulai', 'Ocran', 'Essel', 'Arthur', 'Hayford', 'Aidoo']

  const CITY_AREAS = [
    { city: 'Accra', region: 'Greater Accra', tier: 1.5, lat: 5.6037, lng: -0.1870, areas: ['East Legon', 'Cantonments', 'Airport Residential', 'Trasacco', 'Labone', 'Roman Ridge', 'Osu', 'Ridge'] },
    { city: 'Accra', region: 'Greater Accra', tier: 1.0, lat: 5.5600, lng: -0.2057, areas: ['Adenta', 'Spintex', 'Madina', 'Dansoman', 'Achimota', 'Dzorwulu', 'Teshie-Nungua', 'Circle'] },
    { city: 'Tema', region: 'Greater Accra', tier: 0.9, lat: 5.6698, lng: -0.0166, areas: ['Community 1', 'Community 9', 'Community 25', 'Sakumono', 'Tema New Town', 'Industrial Area'] },
    { city: 'Kasoa', region: 'Central', tier: 0.6, lat: 5.5318, lng: -0.4706, areas: ['New Market', 'Opeikuma', 'Lamptey Mills', 'Millennium City'] },
    { city: 'Kumasi', region: 'Ashanti', tier: 0.55, lat: 6.6885, lng: -1.6244, areas: ['Adum', 'Ahodwo', 'Nhyiaeso', 'Ayeduase', 'Asokwa', 'Santasi'] },
    { city: 'Takoradi', region: 'Western', tier: 0.5, lat: 4.8845, lng: -1.7554, areas: ['Market Circle', 'Beach Road', 'Effia', 'Anaji'] },
    { city: 'Cape Coast', region: 'Central', tier: 0.45, lat: 5.1315, lng: -1.2795, areas: ['Abura', 'Pedu', 'Kotokuraba', 'University Area'] },
    { city: 'Ho', region: 'Volta', tier: 0.4, lat: 6.6108, lng: 0.4713, areas: ['Central', 'Bankoe', 'Sokode', 'Housing Estate'] },
    { city: 'Tamale', region: 'Northern', tier: 0.45, lat: 9.4008, lng: -0.8393, areas: ['Vittin', 'Choggu', 'Sakasaka', 'Education Ridge'] },
    { city: 'Sunyani', region: 'Bono', tier: 0.5, lat: 7.3392, lng: -2.3268, areas: ['New Town', 'Penkwase', 'Abesim', 'Berlin Top'] },
  ]
  const GPS_PREFIX: Record<string, string> = { Accra: 'GA', Tema: 'GA', Kasoa: 'GA', Kumasi: 'AK', Takoradi: 'WS', 'Cape Coast': 'CC', Ho: 'VR', Tamale: 'NR', Sunyani: 'BA' }
  const STREETS = ['Jungle Road', 'Boundary Road', 'Liberation Road', 'Castle Road', 'Market Street', 'Harbour Road', 'Hospital Road', 'School Road', 'Church Street', 'Station Road', 'Beach Lane', 'Garden Close', 'Palm Avenue', 'Mango Street', 'Ring Road East', 'High Street', 'Independence Avenue', 'Queensway', 'Kings Road', 'Lake Road', 'Polo Road', 'Safari Road', 'Garden Road', 'Aviation Road']

  const IMG_HOME = ['1522708323590-d24dbb6b0267', '1560448204-e02f11c3d0e2', '1502672260266-1c1ef2d93688', '1493809842364-78817add7ffb', '1560185007-cde436f6a4d0', '1560185127-6ed189bf02f4', '1600573472592-401b489a3cdc', '1600585154340-be6161a56a0c', '1600585154526-990dced4db0d', '1600607687644-c7171b42498f', '1600566753086-00f18fb6b3ea', '1600566753190-17f0baa2a6c3', '1600607687939-ce8a6c25118c', '1618221195710-dd6b41faaea6', '1536376072261-38c75010e6c9', '1630699144867-37acec97df5a', '1631679706909-1844bbd07221', '1598928506311-c55ez633a3f3', '1564013799919-ab600027ffc6', '1600596542815-ffad4c1539a9', '1583608205776-bfd35f0d9f83', '1613490493576-7fde63acd811', '1600047509807-ba8f99d2cdde', '1512917774080-9991f1c4c750', '1605276374104-dee2a0ed3cd6']
  const IMG_BIZ = ['1497366216548-37526070297c', '1497366811353-6870744d04b2', '1604328698692-f76ea9498e76', '1586528116311-ad8dd3c8310d', '1553877522-43269d4ea984', '1565610222536-ef125c59da2e']
  const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=800`

  const TYPE_WEIGHTS: [string, number][] = [['apartment', 40], ['house', 16], ['room', 12], ['studio', 8], ['townhouse', 6], ['commercial', 7], ['warehouse', 2], ['hostel', 5], ['shared_room', 4]]
  const TYPE_SPECS: Record<string, { label: string; base: number; beds: [number, number]; baths: [number, number]; area: [number, number] }> = {
    room: { label: 'Single Room Self-Contained', base: 600, beds: [1, 1], baths: [1, 1], area: [15, 30] },
    shared_room: { label: 'Shared Room', base: 380, beds: [1, 1], baths: [1, 1], area: [12, 25] },
    hostel: { label: 'Hostel Room', base: 330, beds: [1, 1], baths: [1, 1], area: [10, 20] },
    studio: { label: 'Studio Apartment', base: 1150, beds: [1, 1], baths: [1, 1], area: [30, 50] },
    apartment: { label: 'Apartment', base: 1000, beds: [1, 3], baths: [1, 2], area: [45, 130] },
    house: { label: 'House', base: 2100, beds: [2, 5], baths: [2, 4], area: [120, 320] },
    townhouse: { label: 'Townhouse', base: 1700, beds: [2, 4], baths: [2, 3], area: [100, 200] },
    commercial: { label: 'Commercial Space', base: 4200, beds: [0, 0], baths: [1, 2], area: [40, 250] },
    warehouse: { label: 'Warehouse', base: 9500, beds: [0, 0], baths: [1, 1], area: [200, 600] },
  }
  const DESCRIPTORS = ['Spacious', 'Modern', 'Executive', 'Cozy', 'Newly Built', 'Well-Maintained', 'Affordable', 'Premium', 'Comfortable', 'Neat']
  const DESC_SUFFIX = ['Close to shops, schools and trotro stations.', 'Secure gated compound with reliable water supply.', 'Tiled floors and modern fittings throughout.', 'Quiet neighborhood ideal for families.', 'Walking distance to the market and public transport.', 'Well-ventilated rooms with plenty of natural light.', 'Easy access to the main road and business district.', 'Serene environment away from the city noise.', '24-hour security with a walled compound.', 'Prepaid electricity meter and poly tank water storage.']
  const AMENITY_POOL = ['Parking', 'Security', 'WiFi', 'AC', 'Generator', 'CCTV', 'Garden', 'Balcony', 'Gym', 'Swimming Pool', 'Elevator', 'Laundry', 'DSTV', 'Boys Quarters', 'Garage', '24hr Water']
  const RULE_POOL = ['No pets allowed', 'No loud music after 10pm', 'No subletting', 'Keep compound clean', 'No smoking indoors', 'Visitors must sign in at the gate', 'No commercial activities on premises']

  // ── 76 generated users: 60 tenants, 12 landlords, 4 property managers ──

  const genUserDocs: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  const mkGenUser = (role: string, idx: number, tag: string) => {
    const female = chance(0.5)
    const first = rp(female ? FEMALE_FIRST : MALE_FIRST)
    const last = rp(SURNAMES)
    return {
      email: `${first.toLowerCase()}.${last.toLowerCase()}.${tag}${idx}@rentos.gh`,
      phone: `0${rp(['24', '20', '55', '26', '27', '23', '50'])}${ri(1000000, 9999999)}`,
      firstName: first,
      lastName: last,
      passwordHash: hash,
      roles: role === 'property_manager' ? ['property_manager', 'landlord'] : [role],
      activeRole: role,
      isVerified: chance(0.85),
    }
  }
  for (let i = 1; i <= 60; i++) genUserDocs.push(mkGenUser('tenant', i, 't'))
  for (let i = 1; i <= 12; i++) genUserDocs.push(mkGenUser('landlord', i, 'l'))
  for (let i = 1; i <= 4; i++) genUserDocs.push(mkGenUser('property_manager', i, 'pm'))
  const genUsers = await User.insertMany(genUserDocs)
  const genTenants = genUsers.slice(0, 60)
  const genHosts = genUsers.slice(60, 76)

  // ── Wallets for generated users ──

  await Wallet.insertMany(genUsers.map((u) => {
    const uid = u._id.toString()
    const txns: Record<string, unknown>[] = []
    let running = 0
    for (let k = 0; k < ri(0, 3); k++) {
      const amt = ri(4, 60) * 50
      running += amt
      txns.push({
        type: 'deposit', amount: amt,
        description: `${rp(['MTN MoMo', 'Telecel Cash', 'AirtelTigo Money', 'Bank transfer'])} deposit`,
        createdAt: `${rp(MONTHS)}-${pad2(ri(1, 28))}`,
        balanceAfter: running,
        reference: `TXN-BULK-${uid.slice(-6)}-${k}`,
      })
    }
    return { userId: uid, balance: running + ri(0, 40) * 50, transactions: txns }
  }))

  // ── 150 generated properties ──

  const genPropDocs: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let i = 0; i < 150; i++) {
    const host = genHosts[i % genHosts.length]
    const type = weighted(TYPE_WEIGHTS)
    const spec = TYPE_SPECS[type]
    const loc = rp(CITY_AREAS)
    const area = rp(loc.areas)
    const beds = ri(spec.beds[0], spec.beds[1])
    const baths = Math.max(1, Math.min(ri(spec.baths[0], spec.baths[1]), Math.max(1, beds)))
    const isBiz = type === 'commercial' || type === 'warehouse'
    const rentBase = spec.base + (isBiz ? 0 : beds * 420)
    const rentAmount = Math.max(150, round50(rentBase * loc.tier * (0.85 + rand() * 0.5)))
    const shortStay = !isBiz && chance(0.08)
    const status = i < 70 ? 'occupied' : weighted([['available', 72], ['maintenance_required', 12], ['under_dispute', 8], ['occupied', 8]])
    const listingStatus = status === 'occupied' ? 'approved' : weighted([['approved', 70], ['pending_review', 16], ['draft', 14]])
    const descriptor = rp(DESCRIPTORS)
    const bedLabel = beds > 0 ? `${beds}-Bedroom ` : ''
    const views = ri(30, 1400)
    const imgs = isBiz ? IMG_BIZ : IMG_HOME
    const imgSet = new Set<string>()
    while (imgSet.size < ri(2, 4)) imgSet.add(img(rp(imgs)))
    genPropDocs.push({
      landlordId: host._id.toString(),
      title: `${descriptor} ${bedLabel}${spec.label} in ${area}`,
      description: `${descriptor.toLowerCase()} ${bedLabel.toLowerCase()}${spec.label.toLowerCase()} in ${area}, ${loc.city}. ${rp(DESC_SUFFIX)}`,
      type,
      stayType: shortStay ? 'short_stay' : 'long_stay',
      status,
      listingStatus,
      images: [...imgSet],
      address: {
        street: `${ri(1, 150)} ${rp(STREETS)}`,
        city: loc.city,
        region: loc.region,
        digitalAddress: `${GPS_PREFIX[loc.city]}-${ri(100, 999)}-${ri(1000, 9999)}`,
        neighborhood: area,
      },
      rentAmount,
      rentDurationMonths: shortStay ? rp([3, 6]) : rp([12, 12, 24]),
      advanceMonths: rp([1, 2, 2, 3, 3, 6]),
      bedrooms: beds,
      bathrooms: baths,
      furnished: chance(isBiz ? 0.2 : 0.3),
      floorArea: ri(spec.area[0], spec.area[1]),
      parkingSpaces: isBiz ? ri(2, 10) : ri(0, 2),
      yearBuilt: ri(2005, 2025),
      rules: pickSome(RULE_POOL, 0.35),
      amenities: pickSome(AMENITY_POOL, 0.3, 2),
      views,
      inquiries: Math.round(views * (0.04 + rand() * 0.1)),
      favorites: Math.round(views * (0.02 + rand() * 0.06)),
      preferences: {
        minCreditScore: rentAmount > 4000 ? rp([50, 60, 70]) : rp([0, 15, 25, 40]),
        minIncomeMultiple: rp([2, 2.5, 3]),
        maxOccupants: isBiz ? ri(10, 50) : Math.max(2, beds * 2),
        allowSmokers: chance(0.3),
        allowPets: chance(0.5),
        allowChildren: chance(0.7),
        preferredEmployment: [],
        preferredGender: 'any',
        minAge: rp([18, 20, 21, 25]),
        maxAge: 100,
        requireReferences: chance(0.5),
        requireEmploymentProof: chance(0.5),
        requireProfileComplete: chance(0.3),
      },
      coordinates: { lat: r4(loc.lat + (rand() - 0.5) * 0.06), lng: r4(loc.lng + (rand() - 0.5) * 0.06) },
    })
  }
  const genProps = await Property.insertMany(genPropDocs)

  // ── 100 generated agreements (70 active, 15 expired, 8 pending signatures, 7 terminated) ──

  const TERM_POOL = ['Tenant responsible for utility bills', 'No subletting allowed', 'Rent due on 1st of each month', 'Landlord provides 24-hour security', 'No structural modifications without written approval', 'Compound cleaning shared', 'No loud music after 10pm', 'Garden maintenance shared', 'Pets allowed with prior approval', 'Guest registration required at the gate']
  const mkTerms = () => pickSome(TERM_POOL, 0.4, 2)

  const activeAgrDocs: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let i = 0; i < 70; i++) {
    const p = genProps[i]
    const tenant = genTenants[i % genTenants.length]
    const startKey = rp(monthRange('2025-10', '2026-05'))
    const dur = rp([12, 12, 24, 24])
    activeAgrDocs.push({
      propertyId: p._id.toString(), landlordId: p.landlordId, tenantId: tenant._id.toString(),
      status: 'active', startDate: `${startKey}-01`, endDate: `${addMonths(startKey, dur)}-01`,
      rentAmount: p.rentAmount, securityDeposit: round50(p.rentAmount * rp([0.5, 1])), advanceMonths: p.advanceMonths,
      terms: mkTerms(), landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1,
    })
  }
  const otherAgrDocs: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  const freeProps = genProps.slice(70)
  for (let i = 0; i < 15; i++) {
    const p = freeProps[i]
    const tenant = genTenants[(i * 7 + 13) % genTenants.length]
    const startKey = rp(monthRange('2025-02', '2025-07'))
    otherAgrDocs.push({
      propertyId: p._id.toString(), landlordId: p.landlordId, tenantId: tenant._id.toString(),
      status: 'expired', startDate: `${startKey}-01`, endDate: `${addMonths(startKey, 12)}-01`,
      rentAmount: p.rentAmount, securityDeposit: round50(p.rentAmount * 0.5), advanceMonths: p.advanceMonths,
      terms: mkTerms(), landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1,
    })
  }
  for (let i = 0; i < 8; i++) {
    const p = freeProps[15 + i]
    const tenant = genTenants[(i * 11 + 3) % genTenants.length]
    const startKey = rp(monthRange('2026-08', '2026-10'))
    const dur = rp([12, 24])
    otherAgrDocs.push({
      propertyId: p._id.toString(), landlordId: p.landlordId, tenantId: tenant._id.toString(),
      status: 'pending_signatures', startDate: `${startKey}-01`, endDate: `${addMonths(startKey, dur)}-01`,
      rentAmount: p.rentAmount, securityDeposit: round50(p.rentAmount * 0.5), advanceMonths: p.advanceMonths,
      terms: mkTerms(), landlordSignature: now, complianceFlags: [], version: 1,
    })
  }
  for (let i = 0; i < 7; i++) {
    const p = freeProps[23 + i]
    const tenant = genTenants[(i * 5 + 27) % genTenants.length]
    const startKey = rp(monthRange('2025-01', '2025-08'))
    otherAgrDocs.push({
      propertyId: p._id.toString(), landlordId: p.landlordId, tenantId: tenant._id.toString(),
      status: 'terminated', startDate: `${startKey}-01`, endDate: `${addMonths(startKey, 24)}-01`,
      rentAmount: p.rentAmount, securityDeposit: round50(p.rentAmount * 0.5), advanceMonths: p.advanceMonths,
      terms: mkTerms(), landlordSignature: now, tenantSignature: now, complianceFlags: [], version: 1,
    })
  }
  const genActiveAgreements = await Agreement.insertMany(activeAgrDocs)
  const genOtherAgreements = await Agreement.insertMany(otherAgrDocs)

  // ── Payment histories (advance payment + up to 6 monthly payments per agreement) ──

  const genPaymentDocs: Record<string, unknown>[] = []
  let paySeq = 0
  const payRef = () => `PAY-BULK-${String(paySeq++).padStart(6, '0')}`
  const PAY_METHODS = ['mtn_momo', 'mtn_momo', 'mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const genPaymentsFor = (agr: any) => {
    const agrId = String(agr._id)
    // Upfront advance payment at agreement start
    genPaymentDocs.push({
      agreementId: agrId, tenantId: agr.tenantId, landlordId: agr.landlordId,
      amount: agr.rentAmount * Math.max(1, agr.advanceMonths), method: rp(PAY_METHODS), status: 'completed',
      reference: payRef(), paidAt: agr.startDate,
    })
    let endKey = agr.endDate.slice(0, 7)
    if (agr.status === 'terminated') endKey = rp(monthRange('2026-03', '2026-06'))
    const startKey = agr.startDate.slice(0, 7)
    const from = startKey > '2026-02' ? startKey : '2026-02'
    const to = endKey < '2026-07' ? endKey : '2026-07'
    if (from > to) return
    for (const key of monthRange(from, to)) {
      const r = rand()
      let status: string
      let paidAt: string | null = null
      if (key === '2026-07') {
        if (r < 0.55) { status = 'completed'; paidAt = `${key}-${pad2(ri(1, 12))}` }
        else if (r < 0.75) status = 'pending'
        else if (r < 0.88) status = 'processing'
        else status = 'failed'
      } else if (r < 0.8) {
        status = 'completed'; paidAt = `${key}-${pad2(ri(1, 4))}`
      } else if (r < 0.91) {
        status = 'completed'; paidAt = `${key}-${pad2(ri(7, 18))}` // late payment
      } else if (r < 0.97) {
        status = 'failed'
      } else {
        status = 'pending'
      }
      const doc: Record<string, unknown> = {
        agreementId: agrId, tenantId: agr.tenantId, landlordId: agr.landlordId,
        amount: agr.rentAmount, method: rp(PAY_METHODS), status, reference: payRef(), paidAt,
      }
      if (status === 'failed') doc.failureReason = rp(['Insufficient funds', 'MoMo prompt timed out', 'User cancelled request', 'Bank service unavailable'])
      genPaymentDocs.push(doc)
    }
  }
  for (const a of genActiveAgreements) genPaymentsFor(a)
  for (const a of genOtherAgreements) {
    if (a.status === 'expired' || a.status === 'terminated') genPaymentsFor(a)
  }
  await Payment.insertMany(genPaymentDocs)

  // ── Payment streaks derived from payment history ──

  const paidMonthsByTenant = new Map<string, Set<string>>()
  for (const p of genPaymentDocs) {
    if (p.status === 'completed' && p.paidAt) {
      const uid = p.tenantId as string
      const set = paidMonthsByTenant.get(uid) ?? new Set<string>()
      set.add(String(p.paidAt).slice(0, 7))
      paidMonthsByTenant.set(uid, set)
    }
  }
  const streakByTenant = new Map<string, number>()
  const streakDocs: Record<string, unknown>[] = []
  for (const [uid, months] of paidMonthsByTenant) {
    if (months.size < 2) continue
    let streak = 0
    let cursor = '2026-07'
    while (months.has(cursor)) { streak++; cursor = addMonths(cursor, -1) }
    streakByTenant.set(uid, streak)
    const sorted = [...months].sort()
    const breaks: Record<string, unknown>[] = []
    if (!months.has('2026-07') && chance(0.7)) {
      breaks.push({ brokenAt: new Date('2026-07-03T12:00:00.000Z'), previousStreak: ri(2, 6), reason: 'Missed monthly payment' })
    }
    streakDocs.push({
      userId: uid,
      currentStreak: streak,
      longestStreak: streak + ri(0, 3),
      lastPaymentMonth: sorted[sorted.length - 1],
      lastPaymentAt: new Date(`${sorted[sorted.length - 1]}-05T10:00:00.000Z`),
      streakStartedAt: streak > 0 ? new Date(`${addMonths('2026-07', -(streak - 1))}-01T00:00:00.000Z`) : undefined,
      breaks,
    })
  }
  await PaymentStreak.insertMany(streakDocs)

  // ── 150 property reviews ──

  const REVIEW_TITLES = ['Great place to live', 'Decent for the price', 'Lovely apartment', 'Could be better', 'Excellent location', 'Good value for money', 'Peaceful neighborhood', 'Highly recommended', 'Average experience', 'Nice and quiet', 'Solid choice', 'Pleasantly surprised']
  const REVIEW_BODIES = ['I have lived here for several months and the experience has been mostly positive. The landlord responds to issues and the neighborhood is safe.', 'The location is convenient for work and the rent is fair for what you get. Water supply has been reliable.', 'A decent property overall. A few minor maintenance issues but nothing serious. Would consider renewing my lease.', 'Very happy with this place. The compound is clean, security is tight, and neighbors are friendly.', 'The apartment matches the listing photos. Move-in was smooth and the agreement process on RentOS was straightforward.', 'Good property but the road leading here gets muddy in the rainy season. Otherwise no complaints.', 'Affordable and well located. The room is smaller than expected but the area makes up for it.', 'Premium living at a fair price. The amenities work as advertised and management is professional.', 'Had some plumbing issues initially but they were fixed within a week. Landlord is reasonable.', 'Great value for this part of town. I would recommend it to young professionals.', 'The building is new and everything works. Commute to work is easy from here.', 'Quiet and secure. Perfect for a small family. The caretaker is very helpful.']
  const PROS_POOL = ['Good security', 'Reliable water', 'Great location', 'Affordable rent', 'Friendly neighbors', 'Clean compound', 'Spacious rooms', 'Responsive landlord', 'Near transport', 'Quiet area']
  const CONS_POOL = ['Limited parking', 'No WiFi included', 'Occasional water shortage', 'Road needs repair', 'Noisy on weekends', 'Far from CBD', 'Small kitchen', 'Power fluctuations']

  const verifiedPairs = new Set<string>()
  for (const a of [...genActiveAgreements, ...genOtherAgreements]) verifiedPairs.add(`${a.propertyId}-${a.tenantId}`)
  const reviewDocs: Record<string, unknown>[] = []
  const reviewPairs = new Set<string>()
  let guard = 0
  while (reviewDocs.length < 150 && guard++ < 5000) {
    const p = rp(genProps)
    const u = rp(genTenants)
    const pair = `${p._id}-${u._id}`
    if (reviewPairs.has(pair)) continue
    reviewPairs.add(pair)
    const rating = weighted([[5, 30], [4, 45], [3, 20], [2, 5]])
    reviewDocs.push({
      propertyId: p._id.toString(),
      userId: u._id.toString(),
      userName: `${u.firstName} ${u.lastName}`,
      rating,
      title: rp(REVIEW_TITLES),
      content: rp(REVIEW_BODIES),
      pros: pickSome(PROS_POOL, 0.4, 1),
      cons: pickSome(CONS_POOL, 0.35),
      wouldRecommend: rating >= 3,
      landlordResponsive: ri(2, 5),
      maintenance: ri(2, 5),
      valueForMoney: ri(2, 5),
      neighborhood: ri(2, 5),
      verified: verifiedPairs.has(`${p._id.toString()}-${u._id.toString()}`),
    })
  }
  await Review.insertMany(reviewDocs)

  // ── Tenant profiles + credit scores for 40 generated tenants ──

  const OCCUPATIONS = ['Teacher', 'Nurse', 'Accountant', 'Bank Officer', 'Civil Servant', 'Trader', 'Software Developer', 'Marketing Officer', 'Pharmacist', 'Engineer', 'Journalist', 'Lawyer', 'Doctor', 'Uber Driver', 'Electrician', 'Fashion Designer', 'University Student', 'Lecturer', 'Police Officer', 'Sales Executive', 'HR Officer', 'Chef', 'Architect', 'Data Analyst']
  const GH_EMPLOYERS = ['Ghana Education Service', 'Korle-Bu Teaching Hospital', 'GCB Bank', 'MTN Ghana', 'Ghana Revenue Authority', 'Coca-Cola Bottling', 'Unilever Ghana', 'Hubtel', 'Zeepay', 'Absa Bank Ghana', 'Ghana Ports & Harbours Authority', 'Citi FM', 'Ghana Health Service', 'Self-employed', 'Ecobank Ghana', 'Newmont Ghana']
  const EDUCATION = ['shs', 'diploma', 'bachelors', 'bachelors', 'masters']
  const HOMETOWNS = ['Kumasi', 'Accra', 'Tamale', 'Cape Coast', 'Ho', 'Sunyani', 'Takoradi', 'Koforidua', 'Bolgatanga', 'Wa', 'Obuasi', 'Tema']
  const LANGS = [['English', 'Twi'], ['English', 'Ga'], ['English', 'Ewe'], ['English', 'Fante'], ['English', 'Dagbani'], ['English', 'Twi', 'Ga'], ['English', 'Hausa'], ['English', 'Nzema']]

  const profileDocs: Record<string, unknown>[] = []
  const creditDocs: Record<string, unknown>[] = []
  for (let i = 0; i < 40; i++) {
    const u = genTenants[i]
    const uid = u._id.toString()
    const female = FEMALE_FIRST.includes(u.firstName)
    const hasChildren = chance(0.35)
    const married = chance(0.4)
    profileDocs.push({
      userId: uid,
      dateOfBirth: `${ri(1975, 2004)}-${pad2(ri(1, 12))}-${pad2(ri(1, 28))}`,
      gender: female ? 'female' : 'male',
      maritalStatus: married ? 'married' : 'single',
      nationality: 'Ghanaian',
      religion: weighted([['christian', 70], ['muslim', 25], ['traditional', 5]]),
      ethnicGroup: rp(['Akan', 'Ga-Dangme', 'Ewe', 'Mole-Dagbon', 'Guan', 'Gurma']),
      hometown: rp(HOMETOWNS),
      languagesSpoken: rp(LANGS),
      bio: `${rp(OCCUPATIONS)} based in ${rp(HOMETOWNS)}. Looking for a comfortable and secure place to rent.`,
      highestEducation: rp(EDUCATION),
      institution: rp(['University of Ghana', 'KNUST', 'University of Cape Coast', 'Ashesi University', 'GIMPA', 'Accra Technical University', 'University of Professional Studies']),
      graduationYear: ri(2005, 2024),
      currentlyStudying: chance(0.1),
      employmentStatus: weighted([['employed', 60], ['self_employed', 25], ['student', 10], ['unemployed', 5]]),
      occupation: rp(OCCUPATIONS),
      employer: rp(GH_EMPLOYERS),
      monthlyIncome: ri(25, 300) * 100,
      employmentDuration: rp(['less_than_1yr', '1_3yrs', '3_5yrs', '5_plus']),
      hasSpouse: married,
      hasChildren,
      numberOfChildren: hasChildren ? ri(1, 3) : 0,
      numberOfDependents: hasChildren ? ri(1, 4) : 0,
      numberOfOccupants: ri(1, 5),
      smoker: chance(0.1),
      drinker: chance(0.3),
      pets: chance(0.15),
      noiseLevel: rp(['quiet', 'quiet', 'moderate']),
      workSchedule: rp(['day', 'day', 'shift', 'remote']),
      hobbies: pickSome(['Football', 'Reading', 'Music', 'Cooking', 'Travel', 'Gaming', 'Church activities', 'Movies'], 0.4, 1),
      personalReferences: [
        { name: `${rp(MALE_FIRST)} ${rp(SURNAMES)}`, relationship: rp(['Brother', 'Uncle', 'Friend', 'Father']), phone: `024${ri(1000000, 9999999)}`, yearsKnown: ri(3, 25) },
        { name: `${rp(FEMALE_FIRST)} ${rp(SURNAMES)}`, relationship: rp(['Sister', 'Mother', 'Aunt', 'Friend']), phone: `020${ri(1000000, 9999999)}`, yearsKnown: ri(3, 25) },
      ],
      previousRentals: chance(0.6) ? [{ address: `${ri(1, 99)} ${rp(STREETS)}`, city: rp(HOMETOWNS), duration: `${ri(6, 36)} months`, monthlyRent: ri(6, 40) * 50, landlordName: `${rp(MALE_FIRST)} ${rp(SURNAMES)}`, reasonForLeaving: rp(['Needed more space', 'Job relocation', 'Rent increase', 'Moved closer to work']), canContact: true }] : [],
      hasBeenEvicted: false,
      emergencyContact: { name: `${rp(MALE_FIRST)} ${rp(SURNAMES)}`, relationship: rp(['Brother', 'Father', 'Spouse', 'Uncle']), phone: `055${ri(1000000, 9999999)}` },
      idType: 'ghana_card',
      idNumber: `GHA-${ri(100000000, 999999999)}-${ri(0, 9)}`,
      idVerified: chance(0.75),
      incomeVerified: chance(0.5),
      addressVerified: chance(0.4),
      searchPreferences: {
        preferredRegions: [rp(['Greater Accra', 'Ashanti', 'Western', 'Central', 'Northern'])],
        preferredCities: [rp(HOMETOWNS)],
        preferredType: pickSome(['apartment', 'house', 'room', 'studio'], 0.5, 1),
        minBudget: ri(2, 10) * 100,
        maxBudget: ri(15, 80) * 100,
        minBedrooms: ri(1, 3),
        needsFurnished: chance(0.4),
        needsParking: chance(0.5),
        preferredAmenities: pickSome(AMENITY_POOL, 0.3, 1),
      },
      completionScore: ri(55, 95),
      profileComplete: false,
      lastUpdated: now,
    })
    const score = ri(25, 92)
    creditDocs.push({
      userId: uid,
      score,
      factors: {
        paymentHistory: Math.round(score * 0.4),
        savingsConsistency: Math.round(score * 0.15),
        agreementCompliance: Math.round(score * 0.2),
        disputeRecord: ri(2, 9),
        accountAge: ri(2, 9),
      },
      calculatedAt: now,
    })
  }
  await TenantProfile.insertMany(profileDocs)
  await CreditScore.insertMany(creditDocs)

  // ── 40 rental applications ──

  const APP_MESSAGES = ['Good day, I am very interested in this property. I am a responsible tenant with a stable income and good references.', 'Hello, I would like to rent this property for my family. We are quiet and respectful tenants.', 'I saw your listing and it fits my needs perfectly. Can we arrange a viewing this week?', 'I am relocating for work and need accommodation urgently. I can pay the advance immediately.', 'This property is close to my workplace. I have a verified RentOS profile and good credit.', 'I am interested in a long-term lease. Please consider my application.', 'My previous landlord can provide excellent references. Looking forward to your response.']
  const APP_NOTES = ['Strong application, verified income.', 'Credit score below requirement.', 'Good tenant history, approved.', 'Incomplete profile, needs verification.', 'Excellent references, fast-tracked.', 'Unable to verify employment.']
  const appDocs: Record<string, unknown>[] = []
  for (let i = 0; i < 40; i++) {
    const tenant = rp(genTenants)
    const p = rp(freeProps)
    const status = weighted([['pending', 45], ['approved', 20], ['rejected', 20], ['withdrawn', 15]])
    const created = new Date(`${rp(monthRange('2026-04', '2026-07'))}-${pad2(ri(1, 28))}T10:00:00.000Z`)
    const doc: Record<string, unknown> = {
      tenantId: tenant._id.toString(),
      propertyId: p._id.toString(),
      landlordId: p.landlordId,
      status,
      message: rp(APP_MESSAGES),
      moveInDate: new Date(`${rp(monthRange('2026-08', '2026-11'))}-01T00:00:00.000Z`),
      duration: rp([6, 12, 12, 24]),
      createdAt: created,
    }
    if (chance(0.4)) doc.offeredRent = round50(Number(p.rentAmount) * (0.9 + rand() * 0.2))
    if (status === 'approved' || status === 'rejected') {
      doc.landlordNotes = rp(APP_NOTES)
      doc.respondedAt = new Date(created.getTime() + ri(1, 7) * 86400000)
    }
    appDocs.push(doc)
  }
  await Application.insertMany(appDocs)

  // ── 25 disputes ──

  const DISPUTE_DATA: Record<string, { titles: string[]; desc: string }> = {
    maintenance: { titles: ['Persistent plumbing leak not fixed', 'Broken water heater for weeks', 'Roof leaking during rains', 'Faulty wiring needs repair'], desc: 'The issue has been reported multiple times through the platform and directly to the landlord, but no repair has been scheduled despite the agreement terms.' },
    rent_increase: { titles: ['Illegal mid-contract rent increase', 'Rent increased without notice'], desc: 'The landlord is demanding a rent increase before the end of the contract period, contrary to the signed agreement and the Rent Act 1963.' },
    deposit_refund: { titles: ['Security deposit not refunded', 'Unjustified deposit deductions'], desc: 'I vacated the property and passed inspection, but my security deposit has not been returned within the required period.' },
    eviction: { titles: ['Threat of eviction without proper notice', 'Landlord attempting self-help eviction'], desc: 'The landlord is attempting to evict me without following the legal notice process required under Ghanaian law.' },
    illegal_clause: { titles: ['Agreement contains illegal clause', 'Excessive advance demanded'], desc: 'The rental agreement contains clauses that appear to violate the Rent Act, including penalties that exceed legal limits.' },
    other: { titles: ['Utility disconnection dispute', 'Noise complaint from neighbors', 'Unauthorized entry by landlord'], desc: 'Ongoing issue affecting my tenancy that requires mediation through the RentOS dispute resolution process.' },
  }
  const disputeDocs: Record<string, unknown>[] = []
  const disputeAgreements = [...genActiveAgreements, ...genOtherAgreements.filter((a) => a.status !== 'pending_signatures')]
  for (let i = 0; i < 25; i++) {
    const agr = rp(disputeAgreements)
    const category = weighted([['maintenance', 40], ['rent_increase', 15], ['deposit_refund', 20], ['eviction', 10], ['illegal_clause', 8], ['other', 7]])
    const status = weighted([['filed', 35], ['under_mediation', 25], ['escalated', 15], ['resolved', 15], ['closed', 10]])
    const filedByTenant = chance(0.8)
    const pool = DISPUTE_DATA[category]
    const doc: Record<string, unknown> = {
      filedBy: filedByTenant ? agr.tenantId : agr.landlordId,
      filedAgainst: filedByTenant ? agr.landlordId : agr.tenantId,
      propertyId: agr.propertyId,
      agreementId: agr._id.toString(),
      category,
      status,
      title: rp(pool.titles),
      description: pool.desc,
      evidence: chance(0.6) ? [{ type: 'image', description: 'Photo evidence submitted by filer' }] : [],
    }
    if (status !== 'filed') {
      doc.mediationNotes = 'Initial mediation session completed. Both parties presented their positions. Follow-up scheduled.'
    }
    if (status === 'resolved' || status === 'closed') {
      doc.resolution = rp(['Both parties reached agreement through mediation. Case closed.', 'Landlord completed repairs; tenant satisfied.', 'Deposit refunded in full after inspection.', 'Agreement amended to remove disputed clause.'])
    }
    if (status === 'escalated') doc.assignedTo = gov._id.toString()
    disputeDocs.push(doc)
  }
  await Dispute.insertMany(disputeDocs)

  // ── 60 savings plans ──

  const savingsDocs: Record<string, unknown>[] = []
  for (let i = 0; i < 60; i++) {
    const u = genTenants[i % 45]
    const target = ri(4, 40) * 500
    const status = weighted([['active', 70], ['completed', 12], ['paused', 10], ['cancelled', 8]])
    const startKey = rp(monthRange('2025-10', '2026-05'))
    const doc: Record<string, unknown> = {
      userId: u._id.toString(),
      targetAmount: target,
      currentAmount: status === 'completed' ? target : round50(target * rand()),
      frequency: weighted([['monthly', 65], ['weekly', 25], ['daily', 10]]),
      contributionAmount: round50(target / ri(6, 18)),
      startDate: `${startKey}-01`,
      targetDate: `${addMonths(startKey, ri(6, 18))}-01`,
      status,
      autoDebit: chance(0.5),
    }
    if (chance(0.25)) doc.linkedPropertyId = rp(genProps)._id.toString()
    savingsDocs.push(doc)
  }
  await SavingsPlan.insertMany(savingsDocs)

  // ── 25 micro-loans ──

  const LOAN_REASONS = ['Need funds for rent advance on a new apartment', 'Emergency medical expenses for a family member', 'Bridging funds while waiting for salary', 'Home furniture and appliances purchase', 'School fees for my children', 'Vehicle repair to keep commuting to work', 'Business stock purchase for my shop', 'Relocation costs to a new city']
  const loanDocs: Record<string, unknown>[] = []
  for (let i = 0; i < 25; i++) {
    const agr = rp(genActiveAgreements)
    const amount = ri(2, 20) * 500
    const tenure = ri(3, 12)
    const r = 0.15 / 12
    const monthlyPayment = round2((amount * r) / (1 - Math.pow(1 + r, -tenure)))
    const totalRepayment = round2(monthlyPayment * tenure)
    const status = weighted([['active', 40], ['repaid', 20], ['pending', 10], ['approved', 10], ['defaulted', 10], ['rejected', 10]])
    const doc: Record<string, unknown> = {
      userId: agr.tenantId,
      agreementId: agr._id.toString(),
      amount, interestRate: 15, tenure, monthlyPayment, totalRepayment,
      amountPaid: status === 'repaid' ? totalRepayment : status === 'active' ? round2(totalRepayment * rand() * 0.8) : status === 'defaulted' ? round2(totalRepayment * rand() * 0.4) : 0,
      status,
      reason: rp(LOAN_REASONS),
    }
    if (status === 'active' || status === 'repaid' || status === 'defaulted' || status === 'approved') {
      doc.creditScoreAtApproval = ri(50, 90)
    }
    if (status === 'active' || status === 'repaid' || status === 'defaulted') {
      doc.disbursedAt = `${rp(monthRange('2025-10', '2026-04'))}-15`
    }
    loanDocs.push(doc)
  }
  await Loan.insertMany(loanDocs)

  // ── 35 investments ──

  const invDocs: Record<string, unknown>[] = []
  for (let i = 0; i < 35; i++) {
    const u = rp(genTenants)
    const isBill = chance(0.65)
    const tenure = isBill ? rp([91, 91, 182, 365]) : rp([365, 730])
    const rate = isBill ? ri(26, 30) : ri(20, 25)
    const amount = ri(2, 60) * 500
    const start = new Date(`${rp(monthRange('2025-08', '2026-05'))}-${pad2(ri(1, 28))}T00:00:00.000Z`)
    const maturity = new Date(start.getTime() + tenure * 86400000)
    const matured = maturity < new Date('2026-07-14')
    const expectedReturn = round2((amount * rate * tenure) / 36500)
    const status = matured ? weighted([['matured', 70], ['withdrawn', 30]]) : weighted([['active', 75], ['pending', 25]])
    const doc: Record<string, unknown> = {
      userId: u._id.toString(),
      type: isBill ? 'treasury_bill' : 'government_bond',
      amount, interestRate: rate, tenure,
      startDate: start.toISOString().slice(0, 10),
      maturityDate: maturity.toISOString().slice(0, 10),
      status,
      expectedReturn,
      partnerId: rp(['databank', 'stanbic']),
    }
    if (status === 'matured' || status === 'withdrawn') doc.actualReturn = expectedReturn
    invDocs.push(doc)
  }
  await Investment.insertMany(invDocs)

  // ── 80 favorites ──

  const allProps = [...props, ...genProps]
  const favDocs: Record<string, unknown>[] = []
  const favPairs = new Set<string>()
  guard = 0
  while (favDocs.length < 80 && guard++ < 5000) {
    const u = rp(genTenants)
    const p = rp(allProps)
    const pair = `${u._id}-${p._id}`
    if (favPairs.has(pair)) continue
    favPairs.add(pair)
    favDocs.push({ userId: u._id.toString(), propertyId: p._id.toString() })
  }
  await Favorite.insertMany(favDocs)

  // ── Notifications for generated users (3 each) ──

  const TENANT_NOTIFS = [
    { title: 'Rent Due Soon', message: 'Your rent payment is due on the 1st of next month. Plan ahead with RentGuard.', actionUrl: '/payments' },
    { title: 'Payment Confirmed', message: 'Your rent payment has been confirmed. Your receipt is available in Payments.', actionUrl: '/payments' },
    { title: 'Savings Milestone', message: 'You have crossed 50% of your RentGuard savings goal. Keep it up!', actionUrl: '/savings' },
    { title: 'Welcome to RentOS', message: 'Welcome to RentOS! Complete your tenant profile to boost your credit score.', actionUrl: '/profile' },
    { title: 'Credit Score Updated', message: 'Your rental credit score has been recalculated. View your score breakdown.', actionUrl: '/profile' },
    { title: 'New Review Request', message: 'How is your rental experience? Leave a review for your property.', actionUrl: '/reviews' },
  ]
  const HOST_NOTIFS = [
    { title: 'Payment Received', message: 'A tenant rent payment has been received via mobile money.', actionUrl: '/payments' },
    { title: 'New Application', message: 'A new rental application has been submitted for one of your properties.', actionUrl: '/applications' },
    { title: 'Property Views', message: 'Your listings received new views this week.', actionUrl: '/properties' },
    { title: 'New Inquiry', message: 'A prospective tenant sent an inquiry about your property.', actionUrl: '/properties' },
    { title: 'Maintenance Request', message: 'A tenant has filed a new maintenance request.', actionUrl: '/properties' },
    { title: 'Rent Collection Summary', message: 'Your monthly rent collection summary is ready.', actionUrl: '/payments' },
  ]
  const notifDocs: Record<string, unknown>[] = []
  for (const u of genUsers) {
    const pool = u.activeRole === 'tenant' ? TENANT_NOTIFS : HOST_NOTIFS
    for (let k = 0; k < 3; k++) {
      const n = rp(pool)
      notifDocs.push({ userId: u._id.toString(), title: n.title, message: n.message, channel: 'in_app', read: chance(0.5), actionUrl: n.actionUrl })
    }
  }
  await Notification.insertMany(notifDocs)

  // ── 15 conversations with messages ──

  const TENANT_MSGS = ['Good day, I wanted to confirm that my rent payment has gone through.', 'Please the kitchen tap has been leaking since yesterday.', 'Is it possible to schedule a viewing for my cousin this weekend?', 'Thank you for the quick response, I appreciate it.', 'The prepaid meter card needs replacement.', 'Can we discuss the lease renewal terms when convenient?', 'Good evening, the security light at the gate is not working.']
  const HOST_MSGS = ['Good day, yes I have received it. Thank you.', 'I will send the plumber tomorrow morning.', 'Noted, I will look into it and get back to you.', 'Please give me two days to sort that out.', 'The caretaker will come this weekend to check.', 'Thank you for your patience.', 'I have asked the electrician to pass by tomorrow.']
  const convoDocs: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  const convoMsgs: { senderId: string; text: string; createdAt: Date }[][] = []
  for (let i = 0; i < 15; i++) {
    const agr = genActiveAgreements[(i * 5) % genActiveAgreements.length]
    const tenantId = agr.tenantId
    const hostId = agr.landlordId
    const nMsgs = ri(3, 6)
    let t = new Date(`${rp(monthRange('2026-06', '2026-07'))}-${pad2(ri(1, 20))}T09:00:00.000Z`)
    const msgs: { senderId: string; text: string; createdAt: Date }[] = []
    for (let k = 0; k < nMsgs; k++) {
      const fromTenant = k % 2 === 0
      msgs.push({ senderId: fromTenant ? tenantId : hostId, text: fromTenant ? rp(TENANT_MSGS) : rp(HOST_MSGS), createdAt: new Date(t) })
      t = new Date(t.getTime() + ri(1, 36) * 3600000)
    }
    const last = msgs[msgs.length - 1]
    convoDocs.push({
      participants: [tenantId, hostId],
      propertyId: agr.propertyId,
      lastMessage: { text: last.text, senderId: last.senderId, createdAt: last.createdAt },
      unreadCount: { [tenantId]: last.senderId === hostId ? 1 : 0, [hostId]: last.senderId === tenantId ? 1 : 0 },
      createdAt: msgs[0].createdAt,
      updatedAt: last.createdAt,
    })
    convoMsgs.push(msgs)
  }
  const genConvos = await Conversation.insertMany(convoDocs)
  for (let i = 0; i < genConvos.length; i++) {
    const msgs = convoMsgs[i]
    await Message.insertMany(msgs.map((m, k) => ({
      conversationId: genConvos[i]._id.toString(),
      senderId: m.senderId,
      text: m.text,
      read: k < msgs.length - 1,
      createdAt: m.createdAt,
    })))
  }

  // ── 20 maintenance requests ──

  const MAINT_DATA: Record<string, { titles: string[]; desc: string }> = {
    plumbing: { titles: ['Leaking kitchen pipe', 'Blocked toilet', 'Water tank not filling', 'Broken shower head'], desc: 'Water-related issue that needs a plumber. Getting worse and may cause damage if not fixed soon.' },
    electrical: { titles: ['Power outlet not working', 'Flickering lights', 'Prepaid meter fault', 'Extractor fan dead'], desc: 'Electrical fault in the unit. Requires a qualified electrician to inspect and repair.' },
    structural: { titles: ['Cracked wall in bedroom', 'Peeling exterior paint', 'Broken window louvres', 'Sagging ceiling board'], desc: 'Structural issue noticed in the property. Requesting inspection and repair.' },
    pest: { titles: ['Termites in door frames', 'Cockroach infestation', 'Rodents in ceiling'], desc: 'Pest problem that needs fumigation before it spreads further.' },
    appliance: { titles: ['AC not cooling', 'Water heater not working', 'Washing machine leaking'], desc: 'Appliance provided with the unit has stopped working properly.' },
    security: { titles: ['Broken gate lock', 'Security light not working', 'Fence damaged'], desc: 'Security concern at the property that needs urgent attention.' },
    other: { titles: ['General maintenance needed', 'Compound cleaning required'], desc: 'General maintenance request for the property.' },
  }
  const maintDocs: Record<string, unknown>[] = []
  for (let i = 0; i < 20; i++) {
    const agr = rp(genActiveAgreements)
    const category = weighted([['plumbing', 30], ['electrical', 20], ['structural', 15], ['pest', 12], ['appliance', 12], ['security', 6], ['other', 5]])
    const status = weighted([['requested', 30], ['acknowledged', 15], ['scheduled', 15], ['in_progress', 15], ['completed', 25]])
    const pool = MAINT_DATA[category]
    const created = new Date(`${rp(monthRange('2026-05', '2026-07'))}-${pad2(ri(1, 28))}T11:00:00.000Z`)
    const doc: Record<string, unknown> = {
      propertyId: agr.propertyId,
      agreementId: agr._id.toString(),
      tenantId: agr.tenantId,
      landlordId: agr.landlordId,
      title: rp(pool.titles),
      description: pool.desc,
      category,
      priority: weighted([['low', 20], ['medium', 40], ['high', 30], ['urgent', 10]]),
      status,
      images: [],
      createdAt: created,
      updatedAt: new Date(created.getTime() + ri(1, 10) * 86400000),
    }
    if (status === 'completed') {
      doc.completedAt = new Date(created.getTime() + ri(2, 14) * 86400000).toISOString()
      doc.cost = ri(5, 40) * 20
      doc.vendorName = `${rp(MALE_FIRST)} ${rp(SURNAMES)}`
    }
    if (status === 'scheduled' || status === 'in_progress') doc.scheduledDate = _addDays(now, ri(-3, 7))
    maintDocs.push(doc)
  }
  await MaintenanceRequest.insertMany(maintDocs)

  // ── 10 service bookings ──

  const BOOKING_DESCS = ['Fix leaking pipe under the kitchen sink.', 'Repair faulty circuit breaker in the main hall.', 'Deep cleaning of the entire apartment before move-in.', 'Install new water heater in the bathroom.', 'Repaint two bedrooms and fix door frames.', 'Fumigate the whole house against termites.', 'Inspect and service the standby generator.', 'Fix broken window louvres and burglar-proof bars.']
  const bookingDocs: Record<string, unknown>[] = []
  for (let i = 0; i < 10; i++) {
    const worker = rp(workers)
    const fromTenant = chance(0.6)
    const agr = rp(genActiveAgreements)
    const status = weighted([['pending', 25], ['confirmed', 20], ['in_progress', 10], ['completed', 35], ['cancelled', 10]])
    const estimated = ri(5, 30) * 20
    const doc: Record<string, unknown> = {
      requesterId: fromTenant ? agr.tenantId : agr.landlordId,
      requesterRole: fromTenant ? 'tenant' : 'landlord',
      workerId: worker._id.toString(),
      type: rp(['repair', 'maintenance', 'cleaning', 'installation', 'inspection']),
      description: rp(BOOKING_DESCS),
      status,
      scheduledDate: _addDays(now, ri(-20, 10)),
      scheduledTime: `${pad2(ri(8, 16))}:00`,
      estimatedCost: estimated,
      paymentStatus: 'pending',
      notes: [],
      propertyId: agr.propertyId,
    }
    if (status === 'confirmed' || status === 'in_progress' || status === 'completed') {
      doc.quoteProvided = true
      doc.quoteAmount = estimated
      doc.quoteAccepted = true
    }
    if (status === 'completed') {
      doc.finalCost = estimated - ri(0, 4) * 10
      doc.paymentStatus = 'paid'
      doc.rating = ri(3, 5)
      doc.review = rp(['Excellent work, very professional.', 'Job well done and on time.', 'Good service, would book again.', 'Neat work and fair pricing.'])
    }
    bookingDocs.push(doc)
  }
  await ServiceBooking.insertMany(bookingDocs)

  // ── Move-out records for expired / terminated agreements ──

  const DAMAGE_DESCS = ['Broken window glass', 'Damaged door lock', 'Stained wall requiring repainting', 'Cracked floor tiles', 'Missing light fittings', 'Damaged kitchen cabinet']
  const moveOutDocs: Record<string, unknown>[] = []
  const moveOutAgreements = [
    ...genOtherAgreements.filter((a) => a.status === 'expired').slice(0, 5),
    ...genOtherAgreements.filter((a) => a.status === 'terminated').slice(0, 3),
  ]
  for (const agr of moveOutAgreements) {
    const status = weighted([['closed', 25], ['refund_paid', 25], ['refund_pending', 20], ['disputed', 15], ['inspection_scheduled', 15]])
    const deposit = agr.securityDeposit
    const damages: { description: string; cost: number; photos: string[] }[] = []
    if (chance(0.6)) {
      for (let k = 0; k < ri(1, 2); k++) damages.push({ description: rp(DAMAGE_DESCS), cost: ri(2, 12) * 50, photos: [] })
    }
    const deductionsTotal = damages.reduce((s, d) => s + d.cost, 0)
    const refundAmount = Math.max(0, deposit - deductionsTotal)
    const moveOutDate = agr.endDate
    const doc: Record<string, unknown> = {
      agreementId: agr._id.toString(),
      tenantId: agr.tenantId,
      landlordId: agr.landlordId,
      propertyId: agr.propertyId,
      status,
      initiatedBy: chance(0.7) ? 'tenant' : 'landlord',
      moveOutDate,
      securityDeposit: deposit,
      damages,
      deductionsTotal,
      refundAmount,
      notes: [{ text: 'Move-out process initiated through RentOS.', by: agr.landlordId, at: `${moveOutDate}T09:00:00.000Z` }],
    }
    if (status !== 'inspection_scheduled') {
      doc.inspectionDate = _addDays(moveOutDate, -2)
      doc.inspectionNotes = damages.length > 0 ? 'Property inspected. Damages documented and costed.' : 'Property inspected. Good condition, no damages found.'
    }
    if (status === 'refund_paid' || status === 'closed') {
      doc.refundedAt = _addDays(moveOutDate, ri(3, 21))
      doc.refundReference = `REF-BULK-${agr._id.toString().slice(-6)}`
      doc.tenantAcknowledgedAt = _addDays(moveOutDate, ri(3, 21))
      doc.landlordAcknowledgedAt = _addDays(moveOutDate, ri(1, 5))
    }
    moveOutDocs.push(doc)
  }
  await MoveOut.insertMany(moveOutDocs)

  // ── Achievements for active tenants ──

  const ACHIEVEMENT_CATALOG = [
    { code: 'first_payment', title: 'First Payment', description: 'Made your first rent payment on RentOS', icon: '💳', tier: 'bronze' },
    { code: 'streak_3', title: '3-Month Streak', description: 'Paid rent on time 3 months in a row', icon: '🔥', tier: 'bronze' },
    { code: 'streak_6', title: '6-Month Streak', description: 'Paid rent on time 6 months in a row', icon: '🏅', tier: 'silver' },
    { code: 'savings_goal', title: 'Savings Champion', description: 'Completed a RentGuard savings goal', icon: '🎯', tier: 'silver' },
    { code: 'profile_complete', title: 'Verified Profile', description: 'Completed and verified your tenant profile', icon: '✅', tier: 'bronze' },
    { code: 'loan_repaid', title: 'Loan Repaid', description: 'Fully repaid a RentOS micro-loan', icon: '💰', tier: 'silver' },
    { code: 'top_reviewer', title: 'Community Reviewer', description: 'Shared helpful property reviews', icon: '⭐', tier: 'bronze' },
    { code: 'rentguard_pro', title: 'RentGuard Pro', description: 'Saved consistently for 6 months', icon: '🛡️', tier: 'gold' },
    { code: 'early_adopter', title: 'Early Adopter', description: 'Joined RentOS in its first year', icon: '🚀', tier: 'platinum' },
  ]
  const achievementDocs: Record<string, unknown>[] = []
  for (let i = 0; i < 24; i++) {
    const u = genTenants[i]
    const uid = u._id.toString()
    const streak = streakByTenant.get(uid) ?? 0
    const codes = ['first_payment']
    if (i < 20) codes.push('profile_complete')
    if (streak >= 3) codes.push('streak_3')
    if (streak >= 6) codes.push('streak_6')
    codes.push(['savings_goal', 'top_reviewer', 'rentguard_pro', 'loan_repaid'][i % 4])
    if (i % 8 === 0) codes.push('early_adopter')
    for (const code of codes) {
      const def = ACHIEVEMENT_CATALOG.find((a) => a.code === code)!
      achievementDocs.push({
        userId: uid,
        code: def.code,
        title: def.title,
        description: def.description,
        icon: def.icon,
        tier: def.tier,
        earnedAt: new Date(`${rp(monthRange('2026-01', '2026-07'))}-${pad2(ri(1, 28))}T12:00:00.000Z`),
      })
    }
  }
  // Showcase achievements on the primary demo tenant too
  for (const code of ['first_payment', 'streak_6', 'early_adopter', 'rentguard_pro']) {
    const def = ACHIEVEMENT_CATALOG.find((a) => a.code === code)!
    achievementDocs.push({
      userId: t1, code: def.code, title: def.title, description: def.description, icon: def.icon, tier: def.tier,
      earnedAt: new Date(`${rp(monthRange('2026-01', '2026-06'))}-15T12:00:00.000Z`),
    })
  }
  await Achievement.insertMany(achievementDocs)

  // ════════════════════════════════════════════

  const counts = await Promise.all([
    User.countDocuments(), Property.countDocuments(), Agreement.countDocuments(),
    Payment.countDocuments(), SavingsPlan.countDocuments(), Dispute.countDocuments(),
    TenantProfile.countDocuments(), CreditScore.countDocuments(), Review.countDocuments(),
    Loan.countDocuments(), Investment.countDocuments(), LegalArticle.countDocuments(),
    BlogPost.countDocuments(), Notification.countDocuments(), Wallet.countDocuments(),
    Conversation.countDocuments(), Message.countDocuments(), Application.countDocuments(),
    Favorite.countDocuments(), ProfileAccess.countDocuments(), Invitation.countDocuments(),
    DocumentModel.countDocuments(), AuditLog.countDocuments(),
    FinancingOffer.countDocuments(), FinancingApplication.countDocuments(),
    FinancingContract.countDocuments(), Employer.countDocuments(),
    Employment.countDocuments(), DeductionMandate.countDocuments(), PayrollRun.countDocuments(),
    Worker.countDocuments(), ServiceBooking.countDocuments(), MaintenanceRequest.countDocuments(),
    Achievement.countDocuments(), PaymentStreak.countDocuments(), MoveOut.countDocuments(),
  ])
  const total = counts.reduce((a, b) => a + b, 0)

  const collectionNames = ['users', 'properties', 'agreements', 'payments', 'savingsplans', 'disputes', 'tenantprofiles', 'creditscores', 'reviews', 'loans', 'investments', 'legalarticles', 'blogposts', 'notifications', 'wallets', 'conversations', 'messages', 'applications', 'favorites', 'profileaccesses', 'invitations', 'documents', 'auditlogs', 'financingoffers', 'financingapplications', 'financingcontracts', 'employers', 'employments', 'deductionmandates', 'payrollruns', 'workers', 'servicebookings', 'maintenancerequests', 'achievements', 'paymentstreaks', 'moveouts']
  console.log(`\nSeeded ${total} documents across ${counts.length} collections.`)
  counts.forEach((c, i) => console.log(`  ${(collectionNames[i] ?? `collection_${i}`).padEnd(24)} ${c}`))
  console.log('\nDemo accounts (all passwords: password123):')
  console.log('  Tenant 1:       kwame@rentos.gh      (78 credit, software dev, active loans & investments)')
  console.log('  Tenant 2:       ama@rentos.gh        (65 credit, marketing manager)')
  console.log('  Tenant 3:       kofi@rentos.gh       (88 credit, CEO, business owner)')
  console.log('  Tenant 4:       abena@rentos.gh      (35 credit, unverified, junior accountant)')
  console.log('  Tenant 5:       akua@rentos.gh       (82 credit, diplomat, Trasacco resident)')
  console.log('  Tenant 6:       yeboah@rentos.gh     (76 credit, finance director, Roman Ridge)')
  console.log('  Tenant 7:       nii@rentos.gh        (55 credit, logistics officer, Kasoa)')
  console.log('  Tenant 8:       serwa@rentos.gh      (28 credit, unverified, beauty salon owner)')
  console.log('  Landlord 1:     yaw@rentos.gh        (8 properties in Accra)')
  console.log('  Landlord 2:     adjoa@rentos.gh      (6 properties across Ghana)')
  console.log('  Landlord 3:     kwaku@rentos.gh      (6 properties incl. Trasacco, Cape Coast)')
  console.log('  Landlord 4:     efua@rentos.gh       (4 properties incl. Tamale, Ho, Sunyani)')
  console.log('  Prop Manager 1: manager@rentos.gh    (4 managed properties)')
  console.log('  Prop Manager 2: kwadwo@rentos.gh     (2 managed properties)')
  console.log('  Government:     gov@rentos.gh        (gov permissions: review, disputes, analytics, legal, simulation)')
  console.log('  Legal Officer:  legal@rentos.gh      (legal permissions: disputes, blog, legal articles)')
  console.log('  Admin:          admin@rentos.gh       (admin permissions: users, properties, disputes, blog)')
  console.log('  Admin 2:        ofi@rentos.gh         (full admin permissions incl. manage_permissions, system)')
  console.log('  Super Admin:    superadmin@rentos.gh  (super_admin role — bypasses all permission checks)')
  console.log('  Owner Admin:    hayfordstanley@gmail.com  (super_admin — password: 1945@Berlinbunker)')
  console.log('  Financier 1:    bloom@rentos.gh       (offers rent advance + deposit loans)')
  console.log('  Financier 2:    rentplus@rentos.gh    (payroll-linked, lower rates)')
  console.log('  Employer 1:     mtn-hr@rentos.gh      (MTN Ghana — 3 employees, monthly payroll)')
  console.log('  Employer 2:     ucc-hr@rentos.gh      (University of Cape Coast — 1 employee)')
  console.log('\nPending invitations:')
  console.log('  mensah.akufo@rentos.gh    → government role (invited by super admin)')
  console.log('  grace.tetteh@rentos.gh    → legal_officer role (invited by super admin)')
  console.log('  daniel.quartey@rentos.gh  → admin role (invited by ofi)')
}
