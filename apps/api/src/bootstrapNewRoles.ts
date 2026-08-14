/**
 * Idempotent bootstrap for the Financier + Employer roles.
 * Adds demo accounts, offers, employer profiles, and sample data only if missing.
 * Safe to run on a database that has already been seeded.
 */
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import mongoose from 'mongoose'
import { config } from './config/index.js'
import { User } from './models/User.js'
import { FinancingOffer } from './models/FinancingOffer.js'
import { Employer } from './models/Employer.js'
import { Employment } from './models/Employment.js'

function generateSecurePassword(): string {
  return crypto.randomBytes(24).toString('hex')
}

async function ensureUser(payload: Record<string, unknown>) {
  const existing = await User.findOne({ email: (payload as { email: string }).email })
  if (existing) return existing
  const hash = await bcrypt.hash(generateSecurePassword(), config.bcryptRounds)
  return User.create({ ...payload, passwordHash: hash, isVerified: true })
}

async function run() {
  await mongoose.connect(config.mongoUri)
  console.log('Connected to MongoDB.')

  const bloom = await ensureUser({
    email: 'bloom@rentos.gh', phone: '0302456789',
    firstName: 'Bloom', lastName: 'Capital',
    roles: ['financier'], activeRole: 'financier',
    permissions: [
      'users:view', 'agreements:view', 'payments:view',
      'financing:view', 'financing:offer', 'financing:approve',
      'financing:disburse', 'financing:collect', 'financing:default_manage',
      'analytics:view',
    ],
  })

  const rentplus = await ensureUser({
    email: 'rentplus@rentos.gh', phone: '0302987654',
    firstName: 'RentPlus', lastName: 'Finance',
    roles: ['financier'], activeRole: 'financier',
    permissions: [
      'users:view', 'agreements:view', 'payments:view',
      'financing:view', 'financing:offer', 'financing:approve',
      'financing:disburse', 'financing:collect',
      'analytics:view',
    ],
  })

  const employerOwner1 = await ensureUser({
    email: 'mtn-hr@rentos.gh', phone: '0244111000',
    firstName: 'MTN', lastName: 'Ghana HR',
    roles: ['employer'], activeRole: 'employer',
    permissions: [
      'users:view',
      'employer:view_employees', 'employer:invite_employees',
      'employer:configure_deductions', 'employer:approve_deductions',
      'employer:run_payroll', 'employer:disburse', 'employer:view_payroll_reports',
    ],
  })

  const employerOwner2 = await ensureUser({
    email: 'ucc-hr@rentos.gh', phone: '0244222000',
    firstName: 'UCC', lastName: 'HR',
    roles: ['employer'], activeRole: 'employer',
    permissions: [
      'users:view',
      'employer:view_employees', 'employer:invite_employees',
      'employer:configure_deductions', 'employer:approve_deductions',
      'employer:run_payroll', 'employer:disburse', 'employer:view_payroll_reports',
    ],
  })

  // Offers
  const offerCount = await FinancingOffer.countDocuments({ financierId: { $in: [bloom._id.toString(), rentplus._id.toString()] } })
  if (offerCount === 0) {
    await FinancingOffer.insertMany([
      {
        financierId: bloom._id.toString(),
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
        financierId: bloom._id.toString(),
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
        financierId: rentplus._id.toString(),
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
    console.log('Inserted 3 financing offers.')
  } else {
    console.log(`Financing offers already exist (${offerCount}) — skipping.`)
  }

  // Employer profiles
  let mtn = await Employer.findOne({ ownerId: employerOwner1._id.toString() })
  if (!mtn) {
    mtn = await Employer.create({
      ownerId: employerOwner1._id.toString(),
      legalName: 'Scancom PLC (MTN Ghana)',
      tradingName: 'MTN Ghana',
      tin: 'GH-TIN-001234567',
      ssnitEmployerNumber: 'SSN-EMP-12345',
      industry: 'Telecommunications',
      address: { street: 'Independence Avenue', city: 'Accra', region: 'Greater Accra', digitalAddress: 'GA-184-3528' },
      contactEmail: 'mtn-hr@rentos.gh', contactPhone: '0244111000',
      payrollCycle: 'monthly', paydayDayOfMonth: 28,
      verificationStatus: 'verified', verifiedAt: new Date().toISOString(), totalEmployees: 0,
    })
    console.log('Created MTN employer profile.')
  }

  let ucc = await Employer.findOne({ ownerId: employerOwner2._id.toString() })
  if (!ucc) {
    ucc = await Employer.create({
      ownerId: employerOwner2._id.toString(),
      legalName: 'University of Cape Coast',
      tradingName: 'UCC',
      tin: 'GH-TIN-009876543',
      ssnitEmployerNumber: 'SSN-EMP-54321',
      industry: 'Education',
      address: { street: 'University Ave', city: 'Cape Coast', region: 'Central', digitalAddress: 'CC-094-1212' },
      contactEmail: 'ucc-hr@rentos.gh', contactPhone: '0244222000',
      payrollCycle: 'monthly', paydayDayOfMonth: 25,
      verificationStatus: 'verified', verifiedAt: new Date().toISOString(), totalEmployees: 0,
    })
    console.log('Created UCC employer profile.')
  }

  // Link a few existing tenants as employees of MTN/UCC
  const tenant1 = await User.findOne({ email: 'kwame@rentos.gh' })
  const tenant2 = await User.findOne({ email: 'ama@rentos.gh' })
  const tenant5 = await User.findOne({ email: 'akua@rentos.gh' })
  const tenant6 = await User.findOne({ email: 'yeboah@rentos.gh' })

  async function linkEmployment(employerId: string, userId: string, staff: string, title: string, salary: number, start: string) {
    const existing = await Employment.findOne({ employerId, userId })
    if (existing) return existing
    return Employment.create({ employerId, userId, staffNumber: staff, jobTitle: title, netMonthlySalary: salary, status: 'active', startDate: start })
  }

  if (tenant1) await linkEmployment(mtn._id.toString(), tenant1._id.toString(), 'MTN-1001', 'Senior Software Engineer', 8500, '2023-01-15')
  if (tenant2) await linkEmployment(mtn._id.toString(), tenant2._id.toString(), 'MTN-1002', 'Marketing Manager', 6200, '2022-06-01')
  if (tenant6) await linkEmployment(mtn._id.toString(), tenant6._id.toString(), 'MTN-1003', 'Finance Director', 12000, '2021-03-12')
  if (tenant5) await linkEmployment(ucc._id.toString(), tenant5._id.toString(), 'UCC-2001', 'Senior Lecturer', 7000, '2020-09-01')

  const mtnCount = await Employment.countDocuments({ employerId: mtn._id.toString() })
  const uccCount = await Employment.countDocuments({ employerId: ucc._id.toString() })
  mtn.totalEmployees = mtnCount
  ucc.totalEmployees = uccCount
  await Promise.all([mtn.save(), ucc.save()])
  console.log(`MTN employees: ${mtnCount}, UCC employees: ${uccCount}`)

  console.log('\nBootstrap complete.')
  process.exit(0)
}

run().catch((err) => {
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
