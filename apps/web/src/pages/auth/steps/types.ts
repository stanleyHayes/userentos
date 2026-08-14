/** Shared state shapes for the registration wizard (RegisterPage + steps). */

export interface AccountForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
}

/**
 * Role-specific details collected on step 3. All fields are strings (or string
 * arrays) so the form stays controlled; numeric conversion happens at submit.
 * Only a subset of these persist — see persistRoleProfile in RegisterPage.
 */
export interface RoleDetails {
  // tenant
  searchCity: string
  monthlyBudget: string
  bedrooms: string
  // landlord
  propertiesOwned: string
  primaryCity: string
  ghanaCardId: string
  // property_manager
  agencyName: string
  yearsExperience: string
  regionsCovered: string
  // service_provider
  trades: string[]
  location: string
  serviceRadiusKm: string
  hourlyRate: string
  bio: string
  // financier
  institutionName: string
  institutionType: string
  licenseNo: string
  // employer
  legalName: string
  tradingName: string
  industry: string
  tin: string
  businessAddress: string
  cityRegion: string
  // business
  businessName: string
  businessCategory: string
  businessCity: string
  businessDescription: string
}

export const emptyRoleDetails: RoleDetails = {
  searchCity: '',
  monthlyBudget: '',
  bedrooms: '',
  propertiesOwned: '',
  primaryCity: '',
  ghanaCardId: '',
  agencyName: '',
  yearsExperience: '',
  regionsCovered: '',
  trades: [],
  location: '',
  serviceRadiusKm: '10',
  hourlyRate: '',
  bio: '',
  institutionName: '',
  institutionType: 'Bank',
  licenseNo: '',
  legalName: '',
  tradingName: '',
  industry: '',
  tin: '',
  businessAddress: '',
  cityRegion: '',
  businessName: '',
  businessCategory: 'furniture',
  businessCity: '',
  businessDescription: '',
}
