import mongoose, { Schema, type Document } from 'mongoose'

export interface ITenantProfile extends Document {
  userId: string

  // PERSONAL
  dateOfBirth?: string
  gender?: string
  maritalStatus?: string
  nationality?: string
  religion?: string
  ethnicGroup?: string
  hometown?: string
  languagesSpoken: string[]
  bio?: string

  // ACADEMIC
  highestEducation?: string
  institution?: string
  fieldOfStudy?: string
  graduationYear?: number
  currentlyStudying: boolean

  // PROFESSIONAL
  employmentStatus?: string
  occupation?: string
  employer?: string
  employerAddress?: string
  monthlyIncome?: number
  employmentDuration?: string
  workPhone?: string
  linkedinUrl?: string
  professionalLicense?: string

  // FAMILY
  hasSpouse: boolean
  spouseName?: string
  spouseOccupation?: string
  hasChildren: boolean
  numberOfChildren?: number
  childrenAges?: string
  numberOfDependents: number
  numberOfOccupants: number
  occupantDetails?: string

  // LIFESTYLE
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

  // REFERENCES
  personalReferences: { name: string; relationship: string; phone: string; email?: string; occupation?: string; yearsKnown?: number }[]
  professionalReferences: { name: string; title: string; company: string; phone: string; email?: string }[]

  // RENTAL HISTORY
  previousRentals: { address: string; city: string; duration: string; monthlyRent?: number; landlordName?: string; landlordPhone?: string; reasonForLeaving?: string; canContact: boolean }[]
  hasBeenEvicted: boolean
  evictionDetails?: string

  // EMERGENCY
  emergencyContact: { name?: string; relationship?: string; phone?: string; address?: string }

  // VERIFICATION
  idType?: string
  idNumber?: string
  idDocumentUrl?: string
  idVerified: boolean
  proofOfIncomeUrl?: string
  incomeVerified: boolean
  proofOfAddressUrl?: string
  addressVerified: boolean
  selfieUrl?: string

  // SEARCH PREFERENCES
  searchPreferences: {
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

  // META
  completionScore: number
  profileComplete: boolean
  lastUpdated: string
}

export function calcScore(p: object): number {
  const raw = p as Record<string, unknown>
  let total = 0
  const check = (fields: unknown[], weight: number) => {
    const filled = fields.filter((v) => v !== undefined && v !== null && v !== '').length
    return Math.round((filled / fields.length) * weight)
  }

  // Personal (15)
  total += check([raw.dateOfBirth, raw.gender, raw.maritalStatus, raw.nationality, raw.religion], 15)
  // Academic (10)
  total += check([raw.highestEducation, raw.institution || raw.highestEducation === 'none', raw.fieldOfStudy || raw.highestEducation === 'none'], 10)
  // Professional (15)
  total += check([raw.employmentStatus, raw.occupation, raw.monthlyIncome, raw.employmentDuration], 15)
  // Family (10)
  total += check([raw.hasSpouse !== undefined ? 'y' : undefined, raw.hasChildren !== undefined ? 'y' : undefined, raw.numberOfOccupants, raw.numberOfDependents !== undefined ? 'y' : undefined], 10)
  // Lifestyle (10)
  total += check([raw.smoker !== undefined ? 'y' : undefined, raw.noiseLevel, raw.workSchedule, raw.pets !== undefined ? 'y' : undefined], 10)
  // Personal refs (10) — need 2
  const personalRefs = Array.isArray(raw.personalReferences) ? raw.personalReferences : []
  if (personalRefs.length >= 2) total += 10
  else if (personalRefs.length === 1) total += 5
  // Professional refs (5) — need 1
  const profRefs = Array.isArray(raw.professionalReferences) ? raw.professionalReferences : []
  if (profRefs.length >= 1) total += 5
  // Rental history (10)
  const prevRentals = Array.isArray(raw.previousRentals) ? raw.previousRentals : []
  if (prevRentals.length >= 1) total += 10
  // Emergency (5)
  const emergency = raw.emergencyContact as Record<string, unknown> | undefined
  if (emergency?.name && emergency?.phone) total += 5
  // Verification (10)
  if (raw.idType && raw.idNumber) total += 5
  if (raw.idVerified) total += 3
  if (raw.incomeVerified) total += 2

  return Math.min(100, total)
}

const tenantProfileSchema = new Schema<ITenantProfile>({
  userId: { type: String, required: true, unique: true, index: true },

  dateOfBirth: String, gender: String, maritalStatus: String, nationality: String,
  religion: String, ethnicGroup: String, hometown: String, languagesSpoken: [String], bio: String,

  highestEducation: String, institution: String, fieldOfStudy: String, graduationYear: Number,
  currentlyStudying: { type: Boolean, default: false },

  employmentStatus: String, occupation: String, employer: String, employerAddress: String,
  monthlyIncome: Number, employmentDuration: String, workPhone: String, linkedinUrl: String, professionalLicense: String,

  hasSpouse: { type: Boolean, default: false }, spouseName: String, spouseOccupation: String,
  hasChildren: { type: Boolean, default: false }, numberOfChildren: Number, childrenAges: String,
  numberOfDependents: { type: Number, default: 0 }, numberOfOccupants: { type: Number, default: 1 }, occupantDetails: String,

  smoker: { type: Boolean, default: false }, drinker: { type: Boolean, default: false },
  pets: { type: Boolean, default: false }, petType: String, petCount: Number,
  noiseLevel: String, workSchedule: String, hobbies: [String], clubs: [String],
  dietaryRestrictions: String, vehicleOwner: { type: Boolean, default: false }, vehicleType: String,

  personalReferences: [{ name: String, relationship: String, phone: String, email: String, occupation: String, yearsKnown: Number }],
  professionalReferences: [{ name: String, title: String, company: String, phone: String, email: String }],

  previousRentals: [{ address: String, city: String, duration: String, monthlyRent: Number, landlordName: String, landlordPhone: String, reasonForLeaving: String, canContact: { type: Boolean, default: true } }],
  hasBeenEvicted: { type: Boolean, default: false }, evictionDetails: String,

  emergencyContact: { name: String, relationship: String, phone: String, address: String },

  idType: String, idNumber: String, idDocumentUrl: String, idVerified: { type: Boolean, default: false },
  proofOfIncomeUrl: String, incomeVerified: { type: Boolean, default: false },
  proofOfAddressUrl: String, addressVerified: { type: Boolean, default: false }, selfieUrl: String,

  searchPreferences: {
    preferredRegions: [String],
    preferredCities: [String],
    preferredType: [String],
    minBudget: { type: Number, default: 0 },
    maxBudget: { type: Number, default: 50000 },
    minBedrooms: { type: Number, default: 0 },
    needsFurnished: { type: Boolean, default: false },
    needsParking: { type: Boolean, default: false },
    preferredAmenities: [String],
  },

  completionScore: { type: Number, default: 0 },
  profileComplete: { type: Boolean, default: false },
  lastUpdated: String,
}, { timestamps: true })

tenantProfileSchema.pre('save', function () {
  this.completionScore = calcScore(this)
  this.profileComplete = this.completionScore >= 100
  this.lastUpdated = new Date().toISOString()
})

export const TenantProfile = mongoose.model<ITenantProfile>('TenantProfile', tenantProfileSchema)
