import { useEffect, useState } from 'react'
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

type IconName = keyof typeof Ionicons.glyphMap

const roles: { value: UserRole; label: string; icon: IconName; desc: string }[] = [
  { value: 'tenant', label: 'Tenant', icon: 'home-outline', desc: 'Find & rent homes' },
  { value: 'landlord', label: 'Landlord', icon: 'business-outline', desc: 'List & manage properties' },
  { value: 'property_manager', label: 'Manager / Agent', icon: 'briefcase-outline', desc: 'Manage properties & close deals' },
  { value: 'service_provider', label: 'Service Provider', icon: 'construct-outline', desc: 'Offer trade & repair services' },
  { value: 'financier', label: 'Financier', icon: 'cash-outline', desc: 'Lend rent advances & loans' },
  { value: 'employer', label: 'Employer', icon: 'people-outline', desc: 'Run payroll deductions' },
  { value: 'business', label: 'Local Business', icon: 'storefront-outline', desc: 'Advertise products & services' },
  { value: 'developer', label: 'Property Developer', icon: 'build-outline', desc: 'Study demand and publish off-plan projects' },
]

const STEPS: { label: string; icon: IconName }[] = [
  { label: 'Role', icon: 'people-outline' },
  { label: 'Account', icon: 'lock-closed-outline' },
  { label: 'Details', icon: 'briefcase-outline' },
  { label: 'Plan', icon: 'trophy-outline' },
]

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

interface Package {
  id: string
  name: string
  price: number
  billingCycle?: 'monthly' | 'yearly'
  maxProperties: number
  benefits?: string[]
  isDefault?: boolean
}

const ROLE_TITLES: Partial<Record<UserRole, { title: string; hint: string }>> = {
  tenant: { title: 'Your home search', hint: 'Helps us pre-fill your tenant profile — all optional.' },
  landlord: { title: 'Your portfolio', hint: 'A few details about your properties — all optional.' },
  property_manager: { title: 'Your agency', hint: 'Tell us about your practice — informational only.' },
  service_provider: { title: 'Your services', hint: 'This creates your worker profile so clients can book you.' },
  financier: { title: 'Your institution', hint: 'Tell us about your institution — informational only.' },
  employer: { title: 'Your company', hint: 'Provide your legal name and TIN to set up your employer profile now.' },
  business: { title: 'Your business', hint: 'This creates your public business profile. Name and city are required.' },
}

/**
 * Best-effort persistence of the step-3 role details, run after registration
 * and login. Throws on failure — the caller catches and alerts, so a failure
 * here never blocks the user from entering the app.
 *
 * Not everything is persistable:
 * - landlord: only ghanaCardId is accepted by PATCH /users/me.
 * - property_manager / financier: no endpoint accepts these fields today.
 */
async function persistRoleProfile(role: UserRole, account: AccountForm, details: RoleDetails): Promise<void> {
  switch (role) {
    case 'tenant': {
      // GET auto-creates the profile server-side; only PATCH when the user
      // actually entered something.
      await api.get('/tenant-profile/me')
      const searchPreferences: Record<string, unknown> = {}
      if (details.searchCity.trim()) searchPreferences.preferredCities = [details.searchCity.trim().slice(0, 60)]
      if (details.monthlyBudget && Number(details.monthlyBudget) > 0) searchPreferences.maxBudget = Number(details.monthlyBudget)
      if (details.bedrooms && Number(details.bedrooms) > 0) searchPreferences.minBedrooms = Math.floor(Number(details.bedrooms))
      if (Object.keys(searchPreferences).length > 0) {
        await api.patch('/tenant-profile/me', { searchPreferences })
      }
      break
    }
    case 'landlord': {
      if (details.ghanaCardId.trim()) {
        await api.patch('/users/me', { ghanaCardId: details.ghanaCardId.trim() })
      }
      break
    }
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
      // property_manager & financier details are informational only.
      break
  }
}

/** Plan used when the user skips: the default package, else the cheapest free one. */
function pickFreePackage(packages: Package[]): Package | null {
  return (
    packages.find((p) => p.isDefault) ??
    packages.filter((p) => p.price <= 0).sort((a, b) => a.price - b.price)[0] ??
    null
  )
}

function formatCurrency(n: number) {
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
}

export default function RegisterScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState(0)
  const [role, setRole] = useState<UserRole>('tenant')
  const [account, setAccount] = useState<AccountForm>({ firstName: '', lastName: '', email: '', phone: '', password: '' })
  const [details, setDetails] = useState<RoleDetails>(emptyRoleDetails)
  const [showPassword, setShowPassword] = useState(false)
  const [packages, setPackages] = useState<Package[]>([])
  const [pkgLoading, setPkgLoading] = useState(true)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Public endpoint — safe to fetch before the account exists.
  useEffect(() => {
    api.get<{ items: Package[] }>('/subscriptions/packages')
      .then((res) => setPackages(res.items ?? []))
      .catch(() => {})
      .finally(() => setPkgLoading(false))
  }, [])

  // Free Starter plan is preselected — derived (not synced state) so the user
  // can still override it before packages finish loading.
  const effectivePackageId = selectedPackageId ?? (packages.length > 0 ? (pickFreePackage(packages)?.id ?? packages[0].id) : null)

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

  /** Register, then run the best-effort chain: role profile → subscription. */
  async function finish(skipPlan: boolean) {
    setError('')
    setLoading(true)
    let auth: { user: User; token: string; refreshToken?: string }
    try {
      auth = await api.post<{ user: User; token: string; refreshToken?: string }>('/auth/register', {
        ...account,
        email: account.email.trim(),
        phone: phoneDigits(account.phone),
        role,
      })
    } catch (e) {
      setError((e as { message?: string }).message || 'Registration failed')
      setLoading(false)
      return
    }
    login(auth.user as User, auth.token, auth.refreshToken)

    // 1) Role profile — best-effort; failure must not strand the user here.
    try {
      await persistRoleProfile(role, account, details)
    } catch (e) {
      Alert.alert(
        'Profile incomplete',
        `Account created, but your ${role.replace('_', ' ')} profile couldn't be saved — you can complete it later. ${(e as { message?: string }).message ?? ''}`,
      )
    }

    // 2) Subscription — free plans activate instantly; paid plans are paid on
    //    the Subscription screen (MoMo), never inside the wizard.
    const chosen = skipPlan
      ? pickFreePackage(packages)
      : (packages.find((p) => p.id === effectivePackageId) ?? pickFreePackage(packages))

    let dest = '/(tabs)'
    if (chosen && chosen.price > 0 && !skipPlan) {
      dest = '/subscription'
    } else if (chosen) {
      try {
        await api.post('/subscriptions/subscribe', { packageId: chosen.id })
      } catch {
        Alert.alert('Plan not activated', 'Account created, but plan activation failed — pick a plan from the Subscription screen.')
      }
    }

    setLoading(false)
    router.replace(dest)
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
      formEyebrow={`Create account · Step ${step + 1} of ${STEPS.length}`}
      formTitle={step === 0 ? 'Choose your role' : step === 1 ? 'Your secure account' : step === 2 ? (heading?.title ?? 'Tell us more') : 'Choose your plan'}
      formSubtitle={step === 0 ? 'We will shape your workspace around how you use RentOS.' : step === 1 ? 'Use details you can access securely on this device.' : step === 2 ? (heading?.hint ?? 'Add the details that make your workspace useful.') : 'Start free and upgrade whenever your portfolio grows.'}
      icon={STEPS[step].icon}
    >
        {/* Step indicator */}
        <View style={s.stepRow}>
          {STEPS.map((st, i) => (
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
        {/* Step 1 — Role */}
        {step === 0 && (
          <View>
            <Text style={[s.label, { color: c.text }]}>I am a...</Text>
            <View style={s.roleGrid}>
              {roles.map((r) => {
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

        {/* Step 3 — Role details */}
        {step === 2 && (
          <View>
            {heading && (
              <View style={{ marginBottom: spacing.xs }}>
                <Text style={[s.detailsTitle, { color: c.text }]}>{heading.title}</Text>
                <Text style={[s.detailsHint, { color: c.muted }]}>{heading.hint}</Text>
              </View>
            )}

            {role === 'tenant' && (
              <>
                {renderField('Where are you searching?', 'searchCity', { placeholder: 'e.g. Accra' })}
                {renderField('Monthly budget (GHS)', 'monthlyBudget', { placeholder: 'e.g. 2500', keyboardType: 'number-pad' })}
                {renderField('Bedrooms', 'bedrooms', { placeholder: 'e.g. 2', keyboardType: 'number-pad' })}
              </>
            )}

            {role === 'landlord' && renderField('Ghana Card ID (optional)', 'ghanaCardId', { placeholder: 'GHA-XXXXXXXXX-X' })}

            {role === 'property_manager' && (
              <>
                {renderField('Agency / company name', 'agencyName', { placeholder: 'e.g. Asante Realty' })}
                {renderField('Years of experience', 'yearsExperience', { placeholder: 'e.g. 5', keyboardType: 'number-pad' })}
              </>
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

        {/* Step 4 — Plan */}
        {step === 3 && (
          <View>
            <Text style={[s.detailsTitle, { color: c.text }]}>Choose a plan</Text>
            <Text style={[s.detailsHint, { color: c.muted }]}>Start free — upgrade anytime from the Subscription screen.</Text>
            {pkgLoading ? (
              <ActivityIndicator color={c.primary} style={{ marginVertical: spacing.lg }} />
            ) : packages.length === 0 ? (
              <Text style={[s.detailsHint, { color: c.muted, marginTop: spacing.sm }]}>Plans will appear here once published — you can continue with the free Starter plan.</Text>
            ) : (
              <View style={s.pkgList}>
                {packages.map((pkg) => {
                  const selected = pkg.id === effectivePackageId
                  return (
                    <PressScale
                      key={pkg.id}
                      style={[
                        s.pkgCard,
                        selected ? authInset(c) : neuCard(c, 14),
                        { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primary + '0D' : c.card },
                      ]}
                      onPress={() => setSelectedPackageId(pkg.id)}
                    >
                      <View style={s.pkgHeader}>
                        <View style={[s.pkgIcon, { backgroundColor: pkg.price === 0 ? c.surface : c.primary + '15' }]}>
                          <Ionicons name={pkg.price === 0 ? 'cube-outline' : 'trophy-outline'} size={18} color={pkg.price === 0 ? c.muted : c.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.pkgName, { color: selected ? c.primary : c.text }]}>{pkg.name}</Text>
                          <Text style={[s.pkgPrice, { color: c.muted }]}>
                            <Text style={{ color: c.text, fontFamily: 'Outfit_700Bold' }}>{pkg.price === 0 ? 'Free' : formatCurrency(pkg.price)}</Text>
                            {pkg.price > 0 ? `/${pkg.billingCycle === 'yearly' ? 'year' : 'month'}` : ''}
                          </Text>
                        </View>
                        {selected && (
                          <View style={[s.pkgCheck, { backgroundColor: c.primary }]}>
                            <Ionicons name="checkmark" size={12} color="#ffffff" />
                          </View>
                        )}
                      </View>
                      <View style={s.pkgMetaRow}>
                        <Ionicons name="business-outline" size={13} color={c.primary} />
                        <Text style={[s.pkgMeta, { color: c.muted }]}>{pkg.maxProperties === -1 ? 'Unlimited' : pkg.maxProperties} properties</Text>
                        {(pkg.benefits?.length ?? 0) > 0 && (
                          <Text style={[s.pkgMeta, { color: c.muted }]}> · {pkg.benefits!.length} benefits</Text>
                        )}
                      </View>
                    </PressScale>
                  )
                })}
              </View>
            )}
          </View>
        )}
        </MotionReveal>

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

          {step === 2 && role !== 'service_provider' && role !== 'business' && (
            <TouchableOpacity style={s.skipBtn} onPress={() => setStep(3)} disabled={loading}>
              <Text style={[s.skipBtnText, { color: c.muted }]}>Skip for now</Text>
            </TouchableOpacity>
          )}

          {step < STEPS.length - 1 ? (
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
              <TouchableOpacity style={s.skipBtn} onPress={() => void finish(true)} disabled={loading}>
                <Text style={[s.skipBtnText, { color: c.muted }]}>Skip — Starter (free)</Text>
              </TouchableOpacity>
              <PressScale style={[s.continueBtn, { backgroundColor: c.primary }]} onPress={() => void finish(false)} disabled={loading || pkgLoading}>
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

  // Plan step
  pkgList: { gap: spacing.sm, marginTop: spacing.sm },
  pkgCard: { borderWidth: 1.5, borderRadius: 14, padding: 14 },
  pkgHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pkgIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  pkgName: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  pkgPrice: { fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 1 },
  pkgCheck: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  pkgMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  pkgMeta: { fontSize: 12, fontFamily: 'Outfit_400Regular' },

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
