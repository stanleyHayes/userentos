import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Pressable, Alert } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { neuCard } from '../../lib/neu'
import { api } from '../../lib/api'
import { useAuthStore, type User } from '../../stores/authStore'
import { AuthShell, authInset } from '../../components/AuthShell'
import { MotionReveal, PressScale } from '../../components/Motion'
import type { UserRole } from '../../types/shared'
import { ConsentCheckbox } from '../../components/ConsentCheckbox'
import { buildAcceptance } from '../../../../packages/shared/legalVersions'
import { isRoleOffered } from '../../../../packages/shared/regulatedFeatures'
import { COMING_SOON_ACCOUNT_TYPES, PROFESSIONAL_TYPES, type ProfessionalType } from '../../../../packages/shared/productScope'
import { useRegulatedFeatures, useSignupRoles } from '../../hooks/useRegulatedFeatures'

type IconName = keyof typeof Ionicons.glyphMap

// The two journeys this phase runs end to end get the large cards.
const primaryRoles: { value: UserRole; label: string; icon: IconName; desc: string }[] = [
  { value: 'tenant', label: 'Tenant', icon: 'home-outline', desc: 'Find a place to rent, buy or stay, and talk to agents on WhatsApp or RentOS.' },
  { value: 'property_manager', label: 'Agent / Agency / Property Manager', icon: 'briefcase-outline', desc: 'List properties, get your own website and handle enquiries in one place.' },
]

// Account types an operator can reopen (SIGNUP_ROLES on the API) without an app release.
const roles: { value: UserRole; label: string; icon: IconName; desc: string }[] = [
  { value: 'landlord', label: 'Landlord', icon: 'business-outline', desc: 'List & manage properties' },
  { value: 'service_provider', label: 'Service Provider', icon: 'construct-outline', desc: 'Offer trade & repair services' },
  { value: 'financier', label: 'Financier', icon: 'cash-outline', desc: 'Lend rent advances & loans' },
  { value: 'employer', label: 'Employer', icon: 'people-outline', desc: 'Run payroll deductions' },
  { value: 'business', label: 'Local Business', icon: 'storefront-outline', desc: 'Advertise products & services' },
  { value: 'developer', label: 'Property Developer', icon: 'build-outline', desc: 'Study demand and publish off-plan projects' },
]

const STEPS: { label: string; icon: IconName }[] = [
  { label: 'Account type', icon: 'people-outline' },
  { label: 'Your details', icon: 'lock-closed-outline' },
  { label: 'Profile', icon: 'briefcase-outline' },
]

/**
 * Sign-up asks only for what an account needs. Tenants and agents go straight
 * in (agents finish their business profile and website in onboarding); the
 * profile step survives only for account types an operator may reopen whose
 * profile is created at sign-up. Plans come later — the API gives a new agent
 * the free default plan, and paid plans go through the store screen.
 */
const DETAILS_ROLES: UserRole[] = ['service_provider', 'business', 'employer', 'financier']

/** Where a new account lands: agents set up their business; tenants start finding a home. */
function landingFor(role: UserRole): string {
  if (role === 'property_manager') return '/onboarding'
  if (role === 'tenant') return '/(tabs)/properties'
  return '/(tabs)'
}

const TRADE_OPTIONS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'painting', label: 'Painting' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'tiling', label: 'Tiling' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'hvac', label: 'HVAC / AC' },
  { value: 'security', label: 'Security' },
  { value: 'gardening', label: 'Gardening' },
  { value: 'appliance', label: 'Appliance Repair' },
  { value: 'moving', label: 'Moving' },
  { value: 'pest', label: 'Pest Control' },
]

const INSTITUTION_TYPES = ['Bank', 'Microfinance', 'Savings & Loans', 'Fintech']

const BUSINESS_CATEGORIES = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'appliances', label: 'Appliances' },
  { value: 'internet', label: 'Internet' },
  { value: 'moving', label: 'Moving' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'other', label: 'Other' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const passwordRequirements = [
  { key: 'length', label: 'At least 8 characters', test: (pw: string) => pw.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: (pw: string) => /[A-Z]/.test(pw) },
  { key: 'lowercase', label: 'One lowercase letter', test: (pw: string) => /[a-z]/.test(pw) },
  { key: 'number', label: 'One number', test: (pw: string) => /\d/.test(pw) },
  { key: 'special', label: 'One special character (!@#$...)', test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
]

/** Strip a phone input down to its digits (drops +, spaces, dashes). */
function phoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

interface AccountForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
}

/**
 * Role-specific details collected on step 3. All fields are strings (or string
 * arrays) so the form stays controlled; numeric conversion happens at submit.
 * Only a subset persists — see persistRoleProfile.
 */
interface RoleDetails {
  // tenant
  searchCity: string
  monthlyBudget: string
  bedrooms: string
  // landlord
  ghanaCardId: string
  // property_manager
  agencyName: string
  yearsExperience: string
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

const emptyRoleDetails: RoleDetails = {
  searchCity: '',
  monthlyBudget: '',
  bedrooms: '',
  ghanaCardId: '',
  agencyName: '',
  yearsExperience: '',
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

const ROLE_TITLES: Partial<Record<UserRole, { title: string; hint: string }>> = {
  service_provider: { title: 'Your services', hint: 'This creates your worker profile so clients can book you.' },
  financier: { title: 'Your institution', hint: 'Tell us about your institution — informational only.' },
  employer: { title: 'Your company', hint: 'Provide your legal name and TIN to set up your employer profile now.' },
  business: { title: 'Your business', hint: 'This creates your public business profile. Name and city are required.' },
}

/**
 * Best-effort persistence of the profile step, run after registration and
 * login. Throws on failure — the caller catches and alerts, so a failure here
 * never blocks the user from entering the app. Financier details are
 * informational: no endpoint accepts them today.
 */
async function persistRoleProfile(role: UserRole, account: AccountForm, details: RoleDetails): Promise<void> {
  switch (role) {
    case 'service_provider': {
      await api.post('/workers', {
        name: `${account.firstName} ${account.lastName}`.trim(),
        phone: phoneDigits(account.phone),
        email: account.email,
        trades: details.trades,
        location: details.location.trim(),
        serviceRadiusKm: Number(details.serviceRadiusKm) > 0 ? Number(details.serviceRadiusKm) : 10,
        ...(details.hourlyRate && Number(details.hourlyRate) > 0 ? { hourlyRate: Number(details.hourlyRate) } : {}),
        ...(details.bio.trim() ? { bio: details.bio.trim() } : {}),
      })
      break
    }
    case 'employer': {
      // Server requires legalName ≥2, tin ≥5, and an address object — skip the
      // call entirely when name/TIN are missing; the dashboard nudges completion.
      const legalName = details.legalName.trim()
      const tin = details.tin.trim()
      if (legalName.length >= 2 && tin.length >= 5) {
        const cityRegion = details.cityRegion.trim()
        await api.post('/employers/me', {
          legalName,
          tin,
          ...(details.tradingName.trim() ? { tradingName: details.tradingName.trim() } : {}),
          ...(details.industry.trim() ? { industry: details.industry.trim() } : {}),
          address: {
            street: details.businessAddress.trim(),
            city: cityRegion,
            region: cityRegion,
          },
          contactEmail: account.email,
          contactPhone: phoneDigits(account.phone),
        })
      }
      break
    }
    case 'business': {
      const name = details.businessName.trim()
      const city = details.businessCity.trim()
      if (name.length >= 2 && city) {
        await api.post('/businesses/me', {
          name,
          category: details.businessCategory,
          phone: phoneDigits(account.phone),
          email: account.email.trim(),
          city,
          ...(details.businessDescription.trim() ? { description: details.businessDescription.trim() } : {}),
        })
      }
      break
    }
    default:
      break
  }
}

export default function RegisterScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState(0)
  const [role, setRole] = useState<UserRole>('tenant')
  const [professionalType, setProfessionalType] = useState<ProfessionalType>('agent')
  const [account, setAccount] = useState<AccountForm>({ firstName: '', lastName: '', email: '', phone: '', password: '' })
  const [details, setDetails] = useState<RoleDetails>(emptyRoleDetails)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [consented, setConsented] = useState(false)
  const { data: regulatedFeatures } = useRegulatedFeatures()
  const openRoles = useSignupRoles()
  const offered = (r: UserRole) => openRoles.includes(r) && isRoleOffered(r, regulatedFeatures ?? null)

  const hasDetailsStep = DETAILS_ROLES.includes(role)
  const steps = hasDetailsStep ? STEPS : STEPS.slice(0, 2)
  const lastStep = steps.length - 1

  function updateAccount(field: keyof AccountForm, value: string) { setAccount((prev) => ({ ...prev, [field]: value })) }
  function updateDetails(field: keyof RoleDetails, value: string) { setDetails((prev) => ({ ...prev, [field]: value })) }

  function toggleTrade(trade: string) {
    setDetails((prev) => ({
      ...prev,
      trades: prev.trades.includes(trade) ? prev.trades.filter((t) => t !== trade) : [...prev.trades, trade],
    }))
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return !!role
      case 1:
        return !!(
          account.firstName.trim() &&
          account.lastName.trim() &&
          EMAIL_RE.test(account.email.trim()) &&
          phoneDigits(account.phone).length >= 10 &&
          passwordRequirements.every((r) => r.test(account.password))
        )
      case 2:
        // Service providers need trades + location — they create the worker profile.
        if (role === 'service_provider') return details.trades.length >= 1 && !!details.location.trim()
        // Businesses need name + city — they create the public business profile.
        if (role === 'business') return details.businessName.trim().length >= 2 && !!details.businessCity.trim()
        return true
      default:
        return true
    }
  }

  /** Register, then (for the reopenable account types) save the profile step. */
  async function finish() {
    if (!consented) {
      setError('Please confirm you are 18 or older and accept the Terms of Service and Privacy Policy')
      return
    }
    setError('')
    setLoading(true)
    let auth: { user: User; token: string; refreshToken?: string }
    try {
      auth = await api.post<{ user: User; token: string; refreshToken?: string }>('/auth/register', {
        ...account,
        email: account.email.trim(),
        phone: phoneDigits(account.phone),
        role,
        ...(role === 'property_manager' ? { professionalType } : {}),
        acceptance: buildAcceptance(),
      })
    } catch (e) {
      setError((e as { message?: string }).message || 'Registration failed')
      setLoading(false)
      return
    }
    login(auth.user as User, auth.token, auth.refreshToken)

    if (hasDetailsStep) {
      // Best-effort; failure must not strand the user here.
      try {
        await persistRoleProfile(role, account, details)
      } catch (e) {
        Alert.alert(
          'Profile incomplete',
          `Account created, but your ${role.replace('_', ' ')} profile couldn't be saved — you can complete it later. ${(e as { message?: string }).message ?? ''}`,
        )
      }
    }

    setLoading(false)
    router.replace(landingFor(role) as never)
  }

  const heading = ROLE_TITLES[role]

  function renderField(label: string, field: keyof RoleDetails, opts?: { placeholder?: string; keyboardType?: 'default' | 'number-pad'; multiline?: boolean; required?: boolean }) {
    return (
      <View>
        <Text style={[s.label, { color: c.text }]}>{label}{opts?.required ? ' *' : ''}</Text>
        <TextInput
          style={[s.input, authInset(c), { color: c.text }, opts?.multiline && s.multilineInput]}
          value={details[field] as string}
          onChangeText={(v) => updateDetails(field, v)}
          placeholder={opts?.placeholder}
          placeholderTextColor={c.muted}
          keyboardType={opts?.keyboardType ?? 'default'}
          multiline={opts?.multiline}
          autoCapitalize={opts?.keyboardType === 'number-pad' ? 'none' : 'sentences'}
        />
      </View>
    )
  }

  function renderChipRow(options: { value: string; label: string }[], selected: string | string[], onPress: (value: string) => void) {
    return (
      <View style={s.chipRow}>
        {options.map((o) => {
          const active = Array.isArray(selected) ? selected.includes(o.value) : selected === o.value
          return (
            <PressScale
              key={o.value}
              style={[
                s.chip,
                active ? authInset(c) : neuCard(c, 10),
                { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary + '12' : c.card },
              ]}
              onPress={() => onPress(o.value)}
            >
              <Text style={[s.chipText, { color: active ? c.primary : c.textLight }]}>{o.label}</Text>
            </PressScale>
          )
        })}
      </View>
    )
  }

  return (
    <AuthShell
      eyebrow="A home for every housing workflow"
      title="Build your housing workspace."
      subtitle="Choose your role, verify your identity, and connect to Ghana's rental economy in minutes."
      formEyebrow={`Create account · Step ${step + 1} of ${steps.length}`}
      formTitle={step === 0 ? 'How will you use RentOS?' : step === 1 ? 'Your secure account' : (heading?.title ?? 'Tell us more')}
      formSubtitle={step === 0 ? 'Pick one. You can add business details after you sign up.' : step === 1 ? 'Use details you can access securely on this device.' : (heading?.hint ?? 'Add the details that make your workspace useful.')}
      icon={STEPS[step].icon}
    >
        {/* Step indicator */}
        <View style={s.stepRow}>
          {steps.map((st, i) => (
            <TouchableOpacity
              key={st.label}
              style={[s.stepPill, { backgroundColor: i === step ? c.primary : i < step ? c.primary + '12' : 'transparent' }]}
              onPress={() => i < step && setStep(i)}
              disabled={i >= step}
            >
              <Ionicons name={i < step ? 'checkmark' : st.icon} size={13} color={i === step ? '#ffffff' : i < step ? c.primary : c.muted} />
              <Text style={[s.stepPillText, { color: i === step ? '#ffffff' : i < step ? c.primary : c.muted }]}>{st.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? <View style={s.errorBox}><Text style={[s.errorText, { color: c.danger }]}>{error}</Text></View> : null}

        <MotionReveal key={step} distance={10}>
        {/* Step 1 — Account type */}
        {step === 0 && (
          <View>
            <View style={{ gap: spacing.sm }}>
              {primaryRoles.filter((r) => offered(r.value)).map((r) => {
                const active = role === r.value
                return (
                  <PressScale
                    key={r.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={[
                      s.primaryCard,
                      active ? authInset(c) : neuCard(c, 14),
                      { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary + '0D' : c.card },
                    ]}
                    onPress={() => setRole(r.value)}
                  >
                    <View style={[s.primaryIcon, { backgroundColor: active ? c.primary : c.surface }]}>
                      <Ionicons name={r.icon} size={22} color={active ? '#ffffff' : c.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.primaryLabel, { color: active ? c.primary : c.text }]}>{r.label}</Text>
                      <Text style={[s.primaryDesc, { color: c.muted }]}>{r.desc}</Text>
                    </View>
                    <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={active ? c.primary : c.border} />
                  </PressScale>
                )
              })}
            </View>

            {role === 'property_manager' && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={[s.label, { color: c.text }]}>Which describes you best?</Text>
                <View style={{ gap: 8, marginTop: 6 }}>
                  {PROFESSIONAL_TYPES.map((t) => {
                    const active = professionalType === t.value
                    return (
                      <PressScale
                        key={t.value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        style={[s.typeRow, active ? authInset(c) : neuCard(c, 10), { borderColor: active ? c.primary : c.border }]}
                        onPress={() => setProfessionalType(t.value)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[s.typeLabel, { color: active ? c.primary : c.text }]}>{t.label}</Text>
                          <Text style={[s.primaryDesc, { color: c.muted }]}>{t.description}</Text>
                        </View>
                        {active && <Ionicons name="checkmark" size={16} color={c.primary} />}
                      </PressScale>
                    )
                  })}
                </View>
              </View>
            )}

            {roles.some((r) => offered(r.value)) && (
              <View style={[s.roleGrid, { marginTop: spacing.md }]}>
                {roles.filter((r) => offered(r.value)).map((r) => {
                  const active = role === r.value
                  return (
                    <PressScale
                      key={r.value}
                      style={[
                        s.roleCard,
                        active ? authInset(c) : neuCard(c, 14),
                        { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary + '0D' : c.card },
                      ]}
                      onPress={() => setRole(r.value)}
                    >
                      <Ionicons name={r.icon} size={20} color={active ? c.primary : c.muted} style={{ marginBottom: 6 }} />
                      <Text style={[s.roleCardLabel, { color: active ? c.primary : c.text }]}>{r.label}</Text>
                      <Text style={[s.roleCardDesc, { color: c.muted }]}>{r.desc}</Text>
                    </PressScale>
                  )
                })}
              </View>
            )}

            {/* Visible but not selectable: these journeys are not finished yet. */}
            <View style={[s.soonBox, { borderColor: c.border }]} accessibilityLabel="Account types coming later">
              <Text style={[s.soonTitle, { color: c.muted }]}>COMING LATER</Text>
              <View style={s.chipRow}>
                {COMING_SOON_ACCOUNT_TYPES.filter((t) => !offered(t.role)).map((t) => (
                  <View key={t.role} style={[s.soonChip, { backgroundColor: c.surface }]} accessibilityState={{ disabled: true }}>
                    <Text style={[s.soonChipText, { color: c.muted }]}>{t.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Step 2 — Account */}
        {step === 1 && (
          <View>
            <View style={s.row}>
              <View style={s.half}>
                <Text style={[s.label, { color: c.text }]}>First Name</Text>
                <TextInput style={[s.input, authInset(c), { color: c.text }]} value={account.firstName} onChangeText={(v) => updateAccount('firstName', v)} placeholder="Kwame" placeholderTextColor={c.muted} />
              </View>
              <View style={s.half}>
                <Text style={[s.label, { color: c.text }]}>Last Name</Text>
                <TextInput style={[s.input, authInset(c), { color: c.text }]} value={account.lastName} onChangeText={(v) => updateAccount('lastName', v)} placeholder="Asante" placeholderTextColor={c.muted} />
              </View>
            </View>

            <Text style={[s.label, { color: c.text }]}>Email</Text>
            <TextInput style={[s.input, authInset(c), { color: c.text }]} value={account.email} onChangeText={(v) => updateAccount('email', v)} placeholder="you@example.com" placeholderTextColor={c.muted} keyboardType="email-address" autoCapitalize="none" />

            <Text style={[s.label, { color: c.text }]}>Phone</Text>
            <TextInput style={[s.input, authInset(c), { color: c.text }]} value={account.phone} onChangeText={(v) => updateAccount('phone', v)} placeholder="024 XXX XXXX" placeholderTextColor={c.muted} keyboardType="phone-pad" />

            <Text style={[s.label, { color: c.text }]}>Password</Text>
            <View style={[s.passwordWrap, authInset(c)]}>
              <TextInput style={[s.passwordInput, { color: c.text }]} value={account.password} onChangeText={(v) => updateAccount('password', v)} placeholder="Min 8 characters" placeholderTextColor={c.muted} secureTextEntry={!showPassword} autoCapitalize="none" />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.muted} />
              </Pressable>
            </View>
            {account.password.length > 0 && (
              <View style={s.reqList}>
                {passwordRequirements.map((r) => {
                  const ok = r.test(account.password)
                  return (
                    <View key={r.key} style={s.reqRow}>
                      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={ok ? c.accent : c.muted} />
                      <Text style={[s.reqText, { color: ok ? c.accent : c.muted }]}>{r.label}</Text>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {/* Step 3 — Profile (reopenable account types only) */}
        {step === 2 && hasDetailsStep && (
          <View>
            {heading && (
              <View style={{ marginBottom: spacing.xs }}>
                <Text style={[s.detailsTitle, { color: c.text }]}>{heading.title}</Text>
                <Text style={[s.detailsHint, { color: c.muted }]}>{heading.hint}</Text>
              </View>
            )}

            {role === 'service_provider' && (
              <>
                <Text style={[s.label, { color: c.text }]}>Trades *</Text>
                {renderChipRow(TRADE_OPTIONS, details.trades, toggleTrade)}
                {renderField('Location / City', 'location', { placeholder: 'e.g. Kumasi', required: true })}
                {renderField('Service radius (km)', 'serviceRadiusKm', { keyboardType: 'number-pad' })}
                {renderField('Hourly rate (GHS, optional)', 'hourlyRate', { placeholder: 'Optional', keyboardType: 'number-pad' })}
                {renderField('Bio (optional)', 'bio', { placeholder: 'Tell potential clients about your experience...', multiline: true })}
              </>
            )}

            {role === 'financier' && (
              <>
                {renderField('Institution name', 'institutionName', { placeholder: 'e.g. Nhyira Microfinance' })}
                <Text style={[s.label, { color: c.text }]}>Institution type</Text>
                {renderChipRow(INSTITUTION_TYPES.map((t) => ({ value: t, label: t })), details.institutionType, (v) => updateDetails('institutionType', v))}
                {renderField('License no (optional)', 'licenseNo', { placeholder: 'BoG license number' })}
              </>
            )}

            {role === 'employer' && (
              <>
                {renderField('Company legal name', 'legalName', { placeholder: 'e.g. Acme Ghana Ltd' })}
                {renderField('Trading name', 'tradingName', { placeholder: 'e.g. Acme' })}
                {renderField('Industry', 'industry', { placeholder: 'e.g. Agriculture' })}
                {renderField('TIN', 'tin', { placeholder: 'Tax Identification Number' })}
                {renderField('Business address', 'businessAddress', { placeholder: 'e.g. 12 Independence Ave' })}
                {renderField('City', 'cityRegion', { placeholder: 'e.g. Accra' })}
              </>
            )}

            {role === 'business' && (
              <>
                {renderField('Business name', 'businessName', { placeholder: 'e.g. Adwoa Furniture Hub', required: true })}
                <Text style={[s.label, { color: c.text }]}>Category</Text>
                {renderChipRow(BUSINESS_CATEGORIES, details.businessCategory, (v) => updateDetails('businessCategory', v))}
                {renderField('City', 'businessCity', { placeholder: 'e.g. Accra', required: true })}
                {renderField('Description (optional)', 'businessDescription', { placeholder: 'Tell renters what you offer...', multiline: true })}
              </>
            )}
          </View>
        )}

        </MotionReveal>

        {step === lastStep && (
          <View style={{ marginTop: spacing.lg }}>
            <ConsentCheckbox checked={consented} onChange={setConsented} disabled={loading} />
          </View>
        )}

        {/* Navigation */}
        <View style={s.navRow}>
          <PressScale
            style={[s.backBtn, { borderColor: c.border }]}
            onPress={() => (step === 0 ? router.back() : setStep(step - 1))}
            disabled={loading}
          >
            <Ionicons name="arrow-back" size={16} color={c.text} />
            <Text style={[s.backBtnText, { color: c.text }]}>Back</Text>
          </PressScale>

          {step < lastStep ? (
            <PressScale
              style={[s.continueBtn, { backgroundColor: c.primary }, !canProceed() && { opacity: 0.45 }]}
              onPress={() => canProceed() && setStep(step + 1)}
              disabled={!canProceed()}
            >
              <Text style={s.continueBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={16} color="#ffffff" />
            </PressScale>
          ) : (
            <View style={s.finishCol}>
              <PressScale style={[s.continueBtn, { backgroundColor: c.primary }, (!consented || !canProceed()) && { opacity: 0.45 }]} onPress={() => void finish()} disabled={loading || !consented || !canProceed()}>
                {loading ? <ActivityIndicator color="#ffffff" /> : (
                  <>
                    <Text style={s.continueBtnText}>Create account</Text>
                    <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                  </>
                )}
              </PressScale>
            </View>
          )}
        </View>

        <View style={s.footer}>
          <Text style={[s.footerText, { color: c.muted }]}>Already have an account? </Text>
          <Link href="/auth/login" style={[s.link, { color: c.primary }]}>Sign in</Link>
        </View>
    </AuthShell>
  )
}

const s = StyleSheet.create({
  // Step indicator
  stepRow: { flexDirection: 'row', gap: 5, marginBottom: spacing.lg },
  stepPill: { flex: 1, minWidth: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 9 },
  stepPillText: { fontSize: 10, fontFamily: 'Outfit_600SemiBold' },

  // Account type
  primaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14 },
  primaryIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  primaryLabel: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  primaryDesc: { fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 2, lineHeight: 17 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  typeLabel: { fontSize: 13, fontFamily: 'Outfit_700Bold' },
  soonBox: { marginTop: spacing.md, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 12 },
  soonTitle: { fontSize: 10, fontFamily: 'Outfit_700Bold', letterSpacing: 1 },
  soonChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  soonChipText: { fontSize: 11, fontFamily: 'Outfit_600SemiBold' },

  // Role grid
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  roleCard: { width: '47%', flexGrow: 1, minHeight: 108, borderWidth: 1.5, borderRadius: 14, padding: 12, justifyContent: 'center', alignItems: 'center' },
  roleCardLabel: { fontSize: 13, fontFamily: 'Outfit_700Bold', textAlign: 'center' },
  roleCardDesc: { fontSize: 10, fontFamily: 'Outfit_400Regular', textAlign: 'center', marginTop: 2 },

  // Form
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  label: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', marginTop: spacing.sm },
  input: { height: 52, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Outfit_400Regular', marginTop: 4 },
  multilineInput: { height: 96, paddingTop: 14, textAlignVertical: 'top' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', height: 52, marginTop: 4 },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Outfit_400Regular' },
  eyeBtn: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },
  reqList: { marginTop: spacing.sm, gap: 4 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reqText: { fontSize: 12, fontFamily: 'Outfit_400Regular' },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: spacing.xs },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: 'Outfit_500Medium' },

  // Details step
  detailsTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold' },
  detailsHint: { fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 2 },

  // Navigation
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 46, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1 },
  backBtnText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  skipBtn: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, height: 52 },
  skipBtnText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  continueBtn: { flex: 1, flexDirection: 'row', minHeight: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 7, shadowColor: '#0f1f33', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  continueBtnText: { color: '#ffffff', fontSize: 15, fontFamily: 'Outfit_700Bold' },
  finishCol: { flex: 1, gap: 4 },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { fontSize: 14, fontFamily: 'Outfit_400Regular' },
  link: { fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.09)', borderColor: 'rgba(239,68,68,0.2)', borderWidth: 1, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  errorText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },
})
