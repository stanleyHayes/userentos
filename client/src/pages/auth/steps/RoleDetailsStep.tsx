import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { MapPin, Building2, Briefcase, Banknote, Wrench, BadgeCheck, Store } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { cn } from '@/lib/utils'
import { TRADE_OPTIONS } from '@/lib/trades'
import { formatGhanaCard } from '@/lib/ghana'
import { BUSINESS_CATEGORY_OPTIONS } from '@/hooks/useApi'
import type { UserRole } from '@/types'
import type { RoleDetails } from './types'

const INSTITUTION_TYPES = ['Bank', 'Microfinance', 'Savings & Loans', 'Fintech']

const ROLE_TITLES: Partial<Record<UserRole, { title: string; hint: string }>> = {
  tenant: { title: 'Your home search', hint: 'Helps us pre-fill your tenant profile — all optional.' },
  landlord: { title: 'Your portfolio', hint: 'A few details about your properties — all optional.' },
  property_manager: { title: 'Your agency', hint: 'Tell us about your practice — all optional.' },
  service_provider: { title: 'Your services', hint: 'This creates your worker profile so clients can book you.' },
  financier: { title: 'Your institution', hint: 'Tell us about your institution — all optional.' },
  employer: { title: 'Your company', hint: 'Provide your legal name and TIN to set up your employer profile now.' },
  business: { title: 'Your business', hint: 'This creates your public business profile so renters can find your offers. Business name and city are required for setup.' },
}

interface Props {
  role: UserRole
  details: RoleDetails
  update: (field: keyof RoleDetails, value: string) => void
  toggleTrade: (trade: string) => void
}

export function RoleDetailsStep({ role, details, update, toggleTrade }: Props) {
  const heading = ROLE_TITLES[role]

  return (
    <div className="space-y-5">
      <div className="animate-fade-up" style={{ animationDelay: '0.05s' }}>
        <h2 className="text-base font-bold text-primary-dark dark:text-white">{heading?.title}</h2>
        <p className="text-xs text-muted dark:text-gray-500 mt-0.5">{heading?.hint}</p>
      </div>

      {role === 'tenant' && (
        <>
          <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <CityAutocomplete id="searchCity" label="Where are you searching?" value={details.searchCity} onChange={(v) => update('searchCity', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <TextField id="monthlyBudget" label="Monthly budget (GHS)" type="number" value={details.monthlyBudget} onChange={(e) => update('monthlyBudget', e.target.value)} fullWidth placeholder="e.g. 2500" slotProps={{ inputLabel: { shrink: true } }} />
            <TextField id="bedrooms" label="Bedrooms" type="number" value={details.bedrooms} onChange={(e) => update('bedrooms', e.target.value)} fullWidth placeholder="e.g. 2" slotProps={{ inputLabel: { shrink: true } }} />
          </div>
        </>
      )}

      {role === 'landlord' && (
        <>
          <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <TextField id="propertiesOwned" label="Properties owned" type="number" value={details.propertiesOwned} onChange={(e) => update('propertiesOwned', e.target.value)} fullWidth placeholder="e.g. 3" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Building2 size={18} className="text-gray-400" /></InputAdornment> } }} />
            <CityAutocomplete id="primaryCity" label="Primary city" value={details.primaryCity} onChange={(v) => update('primaryCity', v)} />
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <TextField id="ghanaCardId" label="Ghana Card ID (optional)" value={details.ghanaCardId} onChange={(e) => update('ghanaCardId', formatGhanaCard(e.target.value))} fullWidth placeholder="GHA-XXXXXXXXX-X" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><BadgeCheck size={18} className="text-gray-400" /></InputAdornment> } }} />
          </div>
        </>
      )}

      {role === 'property_manager' && (
        <>
          <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <TextField id="agencyName" label="Agency / company name" value={details.agencyName} onChange={(e) => update('agencyName', e.target.value)} fullWidth placeholder="e.g. Asante Realty" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Briefcase size={18} className="text-gray-400" /></InputAdornment> } }} />
          </div>
          <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <TextField id="yearsExperience" label="Years of experience" type="number" value={details.yearsExperience} onChange={(e) => update('yearsExperience', e.target.value)} fullWidth placeholder="e.g. 5" slotProps={{ inputLabel: { shrink: true } }} />
            <TextField id="regionsCovered" label="Regions covered" value={details.regionsCovered} onChange={(e) => update('regionsCovered', e.target.value)} fullWidth placeholder="e.g. Greater Accra" slotProps={{ inputLabel: { shrink: true } }} />
          </div>
        </>
      )}

      {role === 'service_provider' && (
        <>
          {/* Trades and location are required — they feed POST /api/workers. */}
          <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Trades *</label>
            <div className="flex flex-wrap gap-2">
              {TRADE_OPTIONS.map((t) => (
                <button key={t.value} type="button" onClick={() => toggleTrade(t.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                    details.trades.includes(t.value)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface dark:bg-[#0c0e1a] text-muted border-border dark:border-[#252a3a] hover:border-primary'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <CityAutocomplete id="spLocation" label="Location / City *" value={details.location} onChange={(v) => update('location', v)} required />
            <TextField id="serviceRadiusKm" label="Service radius (km)" type="number" value={details.serviceRadiusKm} onChange={(e) => update('serviceRadiusKm', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
            <TextField id="hourlyRate" label="Hourly rate (GHS, optional)" type="number" value={details.hourlyRate} onChange={(e) => update('hourlyRate', e.target.value)} fullWidth placeholder="Optional" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Wrench size={18} className="text-gray-400" /></InputAdornment> } }} />
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '0.25s' }}>
            <TextField id="spBio" label="Bio (optional)" value={details.bio} onChange={(e) => update('bio', e.target.value)} fullWidth multiline rows={3} placeholder="Tell potential clients about your experience and expertise..." slotProps={{ inputLabel: { shrink: true } }} />
          </div>
        </>
      )}

      {role === 'financier' && (
        <>
          <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <TextField id="institutionName" label="Institution name" value={details.institutionName} onChange={(e) => update('institutionName', e.target.value)} fullWidth placeholder="e.g. Nhyira Microfinance" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Banknote size={18} className="text-gray-400" /></InputAdornment> } }} />
            <Select id="institutionType" label="Institution type" value={details.institutionType} onChange={(e) => update('institutionType', e.target.value)}
              options={INSTITUTION_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <TextField id="licenseNo" label="License no (optional)" value={details.licenseNo} onChange={(e) => update('licenseNo', e.target.value)} fullWidth placeholder="BoG license number" slotProps={{ inputLabel: { shrink: true } }} />
          </div>
        </>
      )}

      {role === 'employer' && (
        <>
          <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <TextField id="legalName" label="Company legal name" value={details.legalName} onChange={(e) => update('legalName', e.target.value)} fullWidth placeholder="e.g. Acme Ghana Ltd" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Building2 size={18} className="text-gray-400" /></InputAdornment> } }} />
            <TextField id="tradingName" label="Trading name" value={details.tradingName} onChange={(e) => update('tradingName', e.target.value)} fullWidth placeholder="e.g. Acme" slotProps={{ inputLabel: { shrink: true } }} />
          </div>
          <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <TextField id="industry" label="Industry" value={details.industry} onChange={(e) => update('industry', e.target.value)} fullWidth placeholder="e.g. Agriculture" slotProps={{ inputLabel: { shrink: true } }} />
            <TextField id="tin" label="TIN (optional)" value={details.tin} onChange={(e) => update('tin', e.target.value)} fullWidth placeholder="Tax Identification Number" slotProps={{ inputLabel: { shrink: true } }} />
          </div>
          <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            <TextField id="businessAddress" label="Business address" value={details.businessAddress} onChange={(e) => update('businessAddress', e.target.value)} fullWidth placeholder="e.g. 12 Independence Ave" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><MapPin size={18} className="text-gray-400" /></InputAdornment> } }} />
            <CityAutocomplete id="cityRegion" label="City" value={details.cityRegion} onChange={(v) => update('cityRegion', v)} />
          </div>
        </>
      )}

      {role === 'business' && (
        <>
          {/* Name and city are required — they feed POST /api/businesses/me. */}
          <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <TextField id="businessName" label="Business name *" value={details.businessName} onChange={(e) => update('businessName', e.target.value)} fullWidth placeholder="e.g. Adwoa Furniture Hub" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Store size={18} className="text-gray-400" /></InputAdornment> } }} />
          </div>
          <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <Select id="businessCategory" label="Category" value={details.businessCategory} onChange={(e) => update('businessCategory', e.target.value)}
              options={BUSINESS_CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
            />
            <CityAutocomplete id="businessCity" label="City *" value={details.businessCity} onChange={(v) => update('businessCity', v)} required />
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
            <TextField id="businessDescription" label="Description (optional)" value={details.businessDescription} onChange={(e) => update('businessDescription', e.target.value)} fullWidth multiline rows={3} placeholder="Tell renters what you offer — delivery areas, brands, installation, support..." slotProps={{ inputLabel: { shrink: true } }} />
          </div>
        </>
      )}
    </div>
  )
}
