import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { TenantProfile, calcScore } from '../models/TenantProfile.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

// Recalculate score if stale (0 but profile has data)
async function ensureScore<T extends object>(profile: T): Promise<T> {
  const score = calcScore(profile)
  const raw = profile as Record<string, unknown> & { _id: unknown; completionScore?: number; profileComplete?: boolean }
  if (score !== raw.completionScore) {
    await TenantProfile.updateOne(
      { _id: raw._id as string },
      { completionScore: score, profileComplete: score >= 100 }
    )
    raw.completionScore = score
    raw.profileComplete = score >= 100
  }
  return profile
}

// Get my profile
router.get('/me', authenticate, async (req, res) => {
  let profile = await TenantProfile.findOne({ userId: req.user!.userId }).lean()
  if (!profile) {
    const created = await TenantProfile.create({ userId: req.user!.userId })
    profile = created.toObject()
  }
  const scored = await ensureScore(profile)
  success(res, { ...scored, id: (scored._id as Types.ObjectId).toString() })
})

// Update my profile
// Allowlist-validated: only known profile fields, bounded sizes/types — the
// previous blocklist approach let callers mass-assign garbage of any size/type.
const profilePatchSchema = z.object({
  dateOfBirth: z.string().max(30).optional(),
  gender: z.string().max(30).optional(),
  maritalStatus: z.string().max(30).optional(),
  nationality: z.string().max(60).optional(),
  religion: z.string().max(60).optional(),
  ethnicGroup: z.string().max(60).optional(),
  hometown: z.string().max(120).optional(),
  languagesSpoken: z.array(z.string().max(40)).max(20).optional(),
  bio: z.string().max(2000).optional(),
  highestEducation: z.string().max(60).optional(),
  institution: z.string().max(120).optional(),
  fieldOfStudy: z.string().max(120).optional(),
  graduationYear: z.number().int().min(1950).max(2100).optional(),
  currentlyStudying: z.boolean().optional(),
  employmentStatus: z.string().max(40).optional(),
  occupation: z.string().max(120).optional(),
  employer: z.string().max(120).optional(),
  employerAddress: z.string().max(300).optional(),
  monthlyIncome: z.number().min(0).max(1e9).optional(),
  employmentDuration: z.string().max(60).optional(),
  workPhone: z.string().max(20).optional(),
  linkedinUrl: z.string().url().max(300).optional().or(z.literal('')),
  professionalLicense: z.string().max(120).optional(),
  hasSpouse: z.boolean().optional(),
  spouseName: z.string().max(120).optional(),
  spouseOccupation: z.string().max(120).optional(),
  hasChildren: z.boolean().optional(),
  numberOfChildren: z.number().int().min(0).max(30).optional(),
  childrenAges: z.string().max(120).optional(),
  numberOfDependents: z.number().int().min(0).max(50).optional(),
  numberOfOccupants: z.number().int().min(0).max(50).optional(),
  occupantDetails: z.string().max(1000).optional(),
  smoker: z.boolean().optional(),
  drinker: z.boolean().optional(),
  pets: z.boolean().optional(),
  petType: z.string().max(60).optional(),
  petCount: z.number().int().min(0).max(50).optional(),
  noiseLevel: z.string().max(40).optional(),
  workSchedule: z.string().max(60).optional(),
  hobbies: z.array(z.string().max(60)).max(20).optional(),
  clubs: z.array(z.string().max(60)).max(20).optional(),
  dietaryRestrictions: z.string().max(500).optional(),
  vehicleOwner: z.boolean().optional(),
  vehicleType: z.string().max(60).optional(),
  personalReferences: z.array(z.object({
    name: z.string().max(120),
    relationship: z.string().max(60),
    phone: z.string().max(20),
    email: z.string().email().max(120).optional().or(z.literal('')),
    occupation: z.string().max(120).optional(),
    yearsKnown: z.number().int().min(0).max(100).optional(),
  })).max(10).optional(),
  professionalReferences: z.array(z.object({
    name: z.string().max(120),
    title: z.string().max(120),
    company: z.string().max(120),
    phone: z.string().max(20),
    email: z.string().email().max(120).optional().or(z.literal('')),
  })).max(10).optional(),
  previousRentals: z.array(z.object({
    address: z.string().max(300),
    city: z.string().max(120),
    duration: z.string().max(60),
    monthlyRent: z.number().min(0).max(1e9).optional(),
    landlordName: z.string().max(120).optional(),
    landlordPhone: z.string().max(20).optional(),
    reasonForLeaving: z.string().max(500).optional(),
    canContact: z.boolean(),
  })).max(10).optional(),
  hasBeenEvicted: z.boolean().optional(),
  evictionDetails: z.string().max(1000).optional(),
  emergencyContact: z.object({
    name: z.string().max(120).optional(),
    relationship: z.string().max(60).optional(),
    phone: z.string().max(20).optional(),
    address: z.string().max(300).optional(),
  }).optional(),
  idType: z.string().max(60).optional(),
  idNumber: z.string().max(60).optional(),
  idDocumentUrl: z.string().max(500).optional(),
  proofOfIncomeUrl: z.string().max(500).optional(),
  proofOfAddressUrl: z.string().max(500).optional(),
  selfieUrl: z.string().max(500).optional(),
  searchPreferences: z.object({
    preferredRegions: z.array(z.string().max(60)).max(20).optional(),
    preferredCities: z.array(z.string().max(60)).max(20).optional(),
    preferredType: z.array(z.string().max(60)).max(20).optional(),
    minBudget: z.number().min(0).max(1e9).optional(),
    maxBudget: z.number().min(0).max(1e9).optional(),
    minBedrooms: z.number().int().min(0).max(20).optional(),
    needsFurnished: z.boolean().optional(),
    needsParking: z.boolean().optional(),
    preferredAmenities: z.array(z.string().max(60)).max(30).optional(),
  }).optional(),
}).strict() // unknown keys are rejected, not silently dropped

router.patch('/me', authenticate, async (req, res) => {
  const profile = await TenantProfile.findOne({ userId: req.user!.userId })
  if (!profile) { error(res, 'Profile not found', 404); return }

  const parsed = profilePatchSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  Object.assign(profile, parsed.data)
  await profile.save() // pre-save hook calculates score

  success(res, { ...profile.toObject(), id: profile._id.toString() })
})

// Landlord/Gov: view tenant profile by userId (requires approved access)
router.get('/:userId', authenticate, async (req, res) => {
  const roles = req.user!.roles
  if (!roles.includes('landlord') && !roles.includes('property_manager') && !roles.includes('government') && !roles.includes('admin') && !roles.includes('super_admin')) {
    error(res, 'Not authorized', 403); return
  }

  const targetUserId = param(req.params.userId)

  // Check if requester has approved access to this tenant's profile
  const access = await ProfileAccess.findOne({
    requesterId: req.user!.userId,
    tenantId: targetUserId,
    status: 'approved',
  })

  if (!access) {
    error(res, 'Access not granted. Please request permission to view this tenant\'s profile.', 403); return
  }

  const profile = await TenantProfile.findOne({ userId: targetUserId }).lean()
  if (!profile) { error(res, 'Profile not found', 404); return }
  const scored = await ensureScore(profile)
  success(res, { ...scored, id: (scored._id as Types.ObjectId).toString() })
})

export default router
