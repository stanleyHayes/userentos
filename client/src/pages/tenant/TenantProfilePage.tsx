import { useState, type FormEvent } from 'react'
import type { TenantProfile } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState as SharedEmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { FormGrid } from '@/components/ui/FormGrid'
import { Badge } from '@/components/ui/Badge'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/Skeleton'
import { DatePicker } from '@/components/ui/DatePicker'
import {
  User, Briefcase, GraduationCap, Heart, Users, Shield, Phone, Home,
  Plus, X, CheckCircle, AlertCircle, Loader2, ChevronRight, Lock,
  DollarSign, Trash2,
} from 'lucide-react'
import { DoodleStars } from '@/components/ui/Doodles'

interface Profile extends Partial<TenantProfile> {
  incomeSources?: Array<{ source: string; amount: number; currency: string }>
  primaryCurrency?: string
  employerAddress?: string
  professionalLicense?: string
  occupantDetails?: string
}

const TABS = [
  { key: 'personal', label: 'Personal', icon: <User size={16} />, weight: 15 },
  { key: 'academic', label: 'Academic', icon: <GraduationCap size={16} />, weight: 10 },
  { key: 'professional', label: 'Professional', icon: <Briefcase size={16} />, weight: 15 },
  { key: 'family', label: 'Family', icon: <Users size={16} />, weight: 10 },
  { key: 'lifestyle', label: 'Lifestyle', icon: <Heart size={16} />, weight: 10 },
  { key: 'references', label: 'References', icon: <Phone size={16} />, weight: 15 },
  { key: 'rental_history', label: 'History', icon: <Home size={16} />, weight: 10 },
  { key: 'verification', label: 'Verification', icon: <Shield size={16} />, weight: 15 },
] as const

export function TenantProfilePage() {
  const qc = useQueryClient()
  const { data: profile, isLoading } = useQuery({ queryKey: ['tenant-profile'], queryFn: () => api.get<Profile>('/tenant-profile/me') })
  const updateMutation = useMutation({
    mutationFn: (body: Partial<Profile>) => api.patch<Profile>('/tenant-profile/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-profile'] }),
  })

  const [form, setForm] = useState<Profile>({})
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('personal')

  // Hydrate form once when the profile is fetched (compares to previous reference,
  // not an effect — see https://react.dev/learn/you-might-not-need-an-effect).
  const [hydratedProfile, setHydratedProfile] = useState<Profile | null>(null)
  if (profile && hydratedProfile !== profile) {
    setHydratedProfile(profile)
    setForm(profile)
  }

  function u(field: string, value: unknown) { setForm((f) => ({ ...f, [field]: value })); setSaved(false) }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    await updateMutation.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (isLoading) return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )

  const score = profile?.completionScore ?? 0
  const complete = profile?.profileComplete ?? false

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Hero banner */}
      <div className={`rounded-2xl p-6 relative overflow-hidden ${complete ? 'bg-gradient-to-r from-accent to-emerald-500' : 'bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8e] dark:from-blue-600 dark:to-blue-500'}`}>
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="relative">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="5" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(score / 100) * 213.6} 213.6`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xl font-extrabold text-white">{score}%</span>
            </div>
            <div className="text-white relative">
              <DoodleStars className="absolute -top-1 -right-1 text-white/10 w-12 h-12 pointer-events-none" />
              <h1 className="text-xl font-extrabold font-display">
                {complete ? 'Profile Complete!' : 'Complete Your Profile'}
              </h1>
              <p className="text-sm text-white/70 mt-1">
                {complete
                  ? 'You can now bid on properties and sign agreements.'
                  : 'Landlords require a 100% complete profile to consider you for rent.'}
              </p>
            </div>
          </div>
          {!complete && (
            <div className="hidden md:flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
              <Lock size={14} className="text-white/70" />
              <span className="text-xs text-white/70">Bidding locked until 100%</span>
            </div>
          )}
        </div>

        {/* Section progress */}
        <div className="relative mt-4 grid grid-cols-8 gap-1">
          {TABS.map((tab) => {
            const tabComplete = getTabProgress(tab.key, form)
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`h-1.5 rounded-full transition-all ${tabComplete >= 100 ? 'bg-white' : tabComplete > 0 ? 'bg-white/50' : 'bg-white/20'}`}
                title={`${tab.label}: ${tabComplete}%`}
              />
            )
          })}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto bg-surface dark:bg-[#0c0e1a] rounded-xl border border-border dark:border-[#252a3a] p-1">
        {TABS.map((tab) => {
          const tabProg = getTabProgress(tab.key, form)
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-[#161927] text-primary dark:text-blue-400 shadow-sm dark:shadow-black/20'
                  : 'text-muted dark:text-gray-500 hover:text-primary-dark dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tabProg >= 100 && <CheckCircle size={12} className="text-accent" />}
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSave}>
        {activeTab === 'personal' && <PersonalSection form={form} u={u} />}
        {activeTab === 'academic' && <AcademicSection form={form} u={u} />}
        {activeTab === 'professional' && <ProfessionalSection form={form} u={u} />}
        {activeTab === 'family' && <FamilySection form={form} u={u} />}
        {activeTab === 'lifestyle' && <LifestyleSection form={form} u={u} />}
        {activeTab === 'references' && <ReferencesSection form={form} u={u} />}
        {activeTab === 'rental_history' && <RentalHistorySection form={form} u={u} />}
        {activeTab === 'verification' && <VerificationSection form={form} u={u} profile={profile} />}

        {/* Save bar */}
        <div className="flex items-center justify-between mt-6 sticky bottom-4 bg-white dark:bg-[#161927] rounded-xl border border-border dark:border-[#252a3a] shadow-lg dark:shadow-black/30 p-4">
          <div className="flex items-center gap-3">
            {saved && <Badge variant="success">Saved!</Badge>}
            {updateMutation.isError && <Badge variant="danger">{(updateMutation.error as Error).message}</Badge>}
            <span className="text-xs text-muted dark:text-gray-500">
              {activeTab !== TABS[TABS.length - 1].key && (
                <button type="button" onClick={() => {
                  const idx = TABS.findIndex((t) => t.key === activeTab)
                  if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1].key)
                }} className="text-primary dark:text-blue-400 hover:underline flex items-center gap-1">
                  Next: {TABS[TABS.findIndex((t) => t.key === activeTab) + 1]?.label} <ChevronRight size={12} />
                </button>
              )}
            </span>
          </div>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Save Profile'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// === Section components ===

function PersonalSection({ form, u }: { form: Profile; u: (f: string, v: unknown) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Textarea id="bio" label="About You (short bio)" value={form.bio ?? ''} onChange={(e) => u('bio', e.target.value)} placeholder="Tell landlords a bit about yourself..." aiContext="tenant bio for rental applications" />
        <FormGrid columns={3}>
          <DatePicker label="Date of Birth" value={form.dateOfBirth ?? ''} onChange={(v) => u('dateOfBirth', v)} required maxDate={new Date().toISOString().slice(0, 10)} />
          <Select id="gender" label="Gender" value={form.gender ?? ''} onChange={(e) => u('gender', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
          <Select id="maritalStatus" label="Marital Status" value={form.maritalStatus ?? ''} onChange={(e) => u('maritalStatus', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'single', label: 'Single' }, { value: 'married', label: 'Married' }, { value: 'divorced', label: 'Divorced' }, { value: 'widowed', label: 'Widowed' }]} />
        </FormGrid>
        <FormGrid columns={3}>
          <Select id="nationality" label="Nationality" value={form.nationality ?? ''} onChange={(e) => u('nationality', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'Ghanaian', label: 'Ghanaian' }, { value: 'Nigerian', label: 'Nigerian' }, { value: 'Togolese', label: 'Togolese' }, { value: 'Ivorian', label: 'Ivorian' }, { value: 'British', label: 'British' }, { value: 'American', label: 'American' }, { value: 'Other', label: 'Other' }]} />
          <Select id="religion" label="Religion" value={form.religion ?? ''} onChange={(e) => u('religion', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'christian', label: 'Christian' }, { value: 'muslim', label: 'Muslim' }, { value: 'traditional', label: 'Traditional' }, { value: 'hindu', label: 'Hindu' }, { value: 'none', label: 'None' }, { value: 'other', label: 'Other' }]} />
          <Select id="ethnicGroup" label="Ethnic Group" value={form.ethnicGroup ?? ''} onChange={(e) => u('ethnicGroup', e.target.value)} options={[{ value: '', label: 'Select...' }, { value: 'Akan', label: 'Akan' }, { value: 'Ashanti', label: 'Ashanti' }, { value: 'Fante', label: 'Fante' }, { value: 'Ewe', label: 'Ewe' }, { value: 'Ga-Dangme', label: 'Ga-Dangme' }, { value: 'Mole-Dagbon', label: 'Mole-Dagbon' }, { value: 'Guan', label: 'Guan' }, { value: 'Gurma', label: 'Gurma' }, { value: 'Grusi', label: 'Grusi' }, { value: 'Mande', label: 'Mande' }, { value: 'Other', label: 'Other' }]} />
        </FormGrid>
        <FormGrid columns={2}>
          <Input id="hometown" label="Hometown" value={form.hometown ?? ''} onChange={(e) => u('hometown', e.target.value)} placeholder="e.g. Kumasi" />
        </FormGrid>
        <ChipMultiSelect label="Languages Spoken" options={['English', 'Twi', 'Ga', 'Ewe', 'Hausa', 'Fante', 'Dagbani', 'Nzema', 'Other']} selected={form.languagesSpoken ?? []} onChange={(v) => u('languagesSpoken', v)} />
        <SectionBox title="Emergency Contact" icon={<Phone size={16} />}>
          <FormGrid columns={4} compact>
            <Input id="ecName" label="Full Name" value={form.emergencyContact?.name ?? ''} onChange={(e) => u('emergencyContact', { ...form.emergencyContact, name: e.target.value })} />
            <Input id="ecRel" label="Relationship" value={form.emergencyContact?.relationship ?? ''} onChange={(e) => u('emergencyContact', { ...form.emergencyContact, relationship: e.target.value })} />
            <Input id="ecPhone" label="Phone" value={form.emergencyContact?.phone ?? ''} onChange={(e) => u('emergencyContact', { ...form.emergencyContact, phone: e.target.value })} />
            <Input id="ecAddr" label="Address" value={form.emergencyContact?.address ?? ''} onChange={(e) => u('emergencyContact', { ...form.emergencyContact, address: e.target.value })} />
          </FormGrid>
        </SectionBox>
      </CardContent>
    </Card>
  )
}

function AcademicSection({ form, u }: { form: Profile; u: (f: string, v: unknown) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Academic Background</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Select id="education" label="Highest Level of Education" value={form.highestEducation ?? ''} onChange={(e) => u('highestEducation', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'none', label: 'No Formal Education' }, { value: 'basic', label: 'Basic / JHS' }, { value: 'shs', label: 'SHS / Secondary' }, { value: 'diploma', label: 'Diploma / HND' }, { value: 'bachelors', label: "Bachelor's Degree" }, { value: 'masters', label: "Master's Degree" }, { value: 'phd', label: 'PhD / Doctorate' }]} />
        {form.highestEducation && form.highestEducation !== 'none' && (
          <>
            <FormGrid columns={2}>
              <Input id="institution" label="Institution" value={form.institution ?? ''} onChange={(e) => u('institution', e.target.value)} required placeholder="e.g. University of Ghana" />
              <Input id="field" label="Field of Study" value={form.fieldOfStudy ?? ''} onChange={(e) => u('fieldOfStudy', e.target.value)} required placeholder="e.g. Business Administration" />
            </FormGrid>
            <FormGrid columns={2}>
              <Input id="gradYear" label="Year of Graduation" type="number" value={String(form.graduationYear ?? '')} onChange={(e) => u('graduationYear', Number(e.target.value) || undefined)} placeholder="2020" disabled={form.currentlyStudying ?? false} />
              <Toggle label="Currently Studying" value={form.currentlyStudying ?? false} onChange={(v) => { u('currentlyStudying', v); if (v) u('graduationYear', undefined) }} />
            </FormGrid>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const CURRENCY_OPTIONS = [
  { value: 'GHS', label: 'GHS - Ghana Cedi' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'NGN', label: 'NGN - Nigerian Naira' },
]

const CURRENCY_SYMBOLS: Record<string, string> = { GHS: '\u20B5', USD: '$', EUR: '\u20AC', GBP: '\u00A3', NGN: '\u20A6' }

function ProfessionalSection({ form, u }: { form: Profile; u: (f: string, v: unknown) => void }) {
  const incomeSources: Array<{ source: string; amount: number; currency: string }> = form.incomeSources ?? []
  const primaryCurrency = form.primaryCurrency ?? 'GHS'

  const primaryIncome = form.monthlyIncome ?? 0
  const additionalTotal = incomeSources.reduce((sum, s) => sum + (s.amount || 0), 0)
  const totalIncome = primaryIncome + additionalTotal

  function addIncomeSource() {
    u('incomeSources', [...incomeSources, { source: '', amount: 0, currency: primaryCurrency }])
  }

  function removeIncomeSource(index: number) {
    const updated = [...incomeSources]
    updated.splice(index, 1)
    u('incomeSources', updated)
  }

  function updateIncomeSource(index: number, field: string, value: unknown) {
    const updated = [...incomeSources]
    updated[index] = { ...updated[index], [field]: value }
    u('incomeSources', updated)
  }

  return (
    <Card>
      <CardHeader><CardTitle>Professional / Employment</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Select id="empStatus" label="Employment Status" value={form.employmentStatus ?? ''} onChange={(e) => u('employmentStatus', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'employed', label: 'Employed (Full-time)' }, { value: 'part_time', label: 'Employed (Part-time)' }, { value: 'self_employed', label: 'Self-Employed / Business Owner' }, { value: 'freelancer', label: 'Freelancer / Contract' }, { value: 'student', label: 'Student' }, { value: 'unemployed', label: 'Currently Unemployed' }, { value: 'retired', label: 'Retired' }]} />
        {form.employmentStatus && form.employmentStatus !== 'unemployed' && (
          <>
            <FormGrid columns={2}>
              <Input id="occupation" label="Job Title / Occupation" value={form.occupation ?? ''} onChange={(e) => u('occupation', e.target.value)} required placeholder="e.g. Accountant, Teacher, Trader" />
              <Input id="employer" label="Employer / Business Name" value={form.employer ?? ''} onChange={(e) => u('employer', e.target.value)} placeholder="e.g. MTN Ghana, Self" />
            </FormGrid>
            <FormGrid columns={3}>
              <Input id="income" label="Monthly Income" type="number" value={String(form.monthlyIncome ?? '')} onChange={(e) => u('monthlyIncome', Number(e.target.value) || undefined)} required placeholder="e.g. 5000" />
              <Select id="primaryCurrency" label="Currency" value={primaryCurrency} onChange={(e) => u('primaryCurrency', e.target.value)} options={CURRENCY_OPTIONS} />
              <Select id="empDur" label="How Long?" value={form.employmentDuration ?? ''} onChange={(e) => u('employmentDuration', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'less_than_6mo', label: 'Less than 6 months' }, { value: 'less_than_1yr', label: '6 months - 1 year' }, { value: '1_3yrs', label: '1-3 years' }, { value: '3_5yrs', label: '3-5 years' }, { value: '5_plus', label: '5+ years' }]} />
            </FormGrid>
            <FormGrid columns={3}>
              <Input id="workPhone" label="Work Phone" value={form.workPhone ?? ''} onChange={(e) => u('workPhone', e.target.value)} />
              <Input id="employerAddr" label="Employer Address" value={form.employerAddress ?? ''} onChange={(e) => u('employerAddress', e.target.value)} />
              <Input id="profLicense" label="Professional License (if any)" value={form.professionalLicense ?? ''} onChange={(e) => u('professionalLicense', e.target.value)} placeholder="e.g. ICAG, GBC" />
            </FormGrid>

            {/* Additional Income Sources */}
            <SectionBox title="Additional Income Sources" icon={<DollarSign size={16} />}>
              <p className="text-xs text-muted dark:text-gray-500 mb-3">Add side jobs, freelancing, or other income sources</p>

              {incomeSources.length === 0 && (
                <p className="text-sm text-muted dark:text-gray-500 text-center py-4">No additional income sources added</p>
              )}

              {incomeSources.map((src, i) => (
                <div key={i} className="rounded-xl bg-white dark:bg-[#161927] border border-border dark:border-[#252a3a] p-3 relative mb-3">
                  <button
                    type="button"
                    className="absolute top-2 right-2 text-muted hover:text-danger dark:hover:text-red-400 transition-colors"
                    onClick={() => removeIncomeSource(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                  <FormGrid columns={3} compact className="pr-6">
                    <Input
                      id={`is-name-${i}`}
                      label="Source"
                      value={src.source}
                      onChange={(e) => updateIncomeSource(i, 'source', e.target.value)}
                      placeholder="e.g. Freelancing, Side Business"
                    />
                    <Input
                      id={`is-amount-${i}`}
                      label="Monthly Amount"
                      type="number"
                      value={String(src.amount || '')}
                      onChange={(e) => updateIncomeSource(i, 'amount', Number(e.target.value) || 0)}
                      placeholder="e.g. 2000"
                    />
                    <Select
                      id={`is-currency-${i}`}
                      label="Currency"
                      value={src.currency || 'GHS'}
                      onChange={(e) => updateIncomeSource(i, 'currency', e.target.value)}
                      options={CURRENCY_OPTIONS}
                    />
                  </FormGrid>
                </div>
              ))}

              <Button type="button" size="sm" variant="outline" onClick={addIncomeSource}>
                <Plus size={14} /> Add Income Source
              </Button>
            </SectionBox>

            {/* Total Monthly Income */}
            <div className="rounded-xl bg-gradient-to-r from-[#1e3a5f]/5 to-[#2d5a8e]/5 dark:from-blue-500/10 dark:to-blue-600/10 border border-primary/20 dark:border-blue-500/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign size={18} className="text-primary dark:text-blue-400" />
                  <span className="text-sm font-semibold text-primary-dark dark:text-white">Total Monthly Income</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-primary dark:text-blue-400">
                    {CURRENCY_SYMBOLS[primaryCurrency] || primaryCurrency}{' '}
                    {totalIncome.toLocaleString()}
                  </span>
                  {incomeSources.length > 0 && (
                    <p className="text-[11px] text-muted dark:text-gray-500 mt-0.5">
                      Primary: {CURRENCY_SYMBOLS[primaryCurrency]}{primaryIncome.toLocaleString()}
                      {' + '}
                      {incomeSources.length} additional source{incomeSources.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function FamilySection({ form, u }: { form: Profile; u: (f: string, v: unknown) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Family & Occupants</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FormGrid columns={2}>
          <Input id="occupants" label="Number of Occupants (including you)" type="number" value={String(form.numberOfOccupants ?? 1)} onChange={(e) => u('numberOfOccupants', Number(e.target.value))} required min="1" />
          <Input id="dependents" label="Number of Dependents" type="number" value={String(form.numberOfDependents ?? 0)} onChange={(e) => u('numberOfDependents', Number(e.target.value))} required min="0" />
        </FormGrid>
        <Toggle label="Do you have a spouse / partner?" value={form.hasSpouse ?? false} onChange={(v) => u('hasSpouse', v)} />
        {form.hasSpouse && (
          <FormGrid columns={2}>
            <Input id="spouseName" label="Spouse Name" value={form.spouseName ?? ''} onChange={(e) => u('spouseName', e.target.value)} />
            <Input id="spouseOcc" label="Spouse Occupation" value={form.spouseOccupation ?? ''} onChange={(e) => u('spouseOccupation', e.target.value)} />
          </FormGrid>
        )}
        <Toggle label="Do you have children?" value={form.hasChildren ?? false} onChange={(v) => u('hasChildren', v)} />
        {form.hasChildren && (
          <FormGrid columns={2}>
            <Input id="numChildren" label="Number of Children" type="number" value={String(form.numberOfChildren ?? '')} onChange={(e) => u('numberOfChildren', Number(e.target.value))} />
            <Input id="childAges" label="Children's Ages" value={form.childrenAges ?? ''} onChange={(e) => u('childrenAges', e.target.value)} placeholder="e.g. 3, 7, 12" />
          </FormGrid>
        )}
        <Textarea id="occupantDetails" label="Who will be living with you?" value={form.occupantDetails ?? ''} onChange={(e) => u('occupantDetails', e.target.value)} placeholder="e.g. My wife and 2 children. Sometimes my mother visits for a month." />
      </CardContent>
    </Card>
  )
}

function LifestyleSection({ form, u }: { form: Profile; u: (f: string, v: unknown) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Lifestyle & Habits</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Toggle label="Do you smoke?" value={form.smoker ?? false} onChange={(v) => u('smoker', v)} />
          <Toggle label="Do you drink alcohol?" value={form.drinker ?? false} onChange={(v) => u('drinker', v)} />
          <Toggle label="Do you have pets?" value={form.pets ?? false} onChange={(v) => u('pets', v)} />
        </div>
        {form.pets && (
          <FormGrid columns={2}>
            <Input id="petType" label="Type of Pet" value={form.petType ?? ''} onChange={(e) => u('petType', e.target.value)} placeholder="e.g. Dog, Cat" />
            <Input id="petCount" label="How Many?" type="number" value={String(form.petCount ?? '')} onChange={(e) => u('petCount', Number(e.target.value))} />
          </FormGrid>
        )}
        <FormGrid columns={2}>
          <Select id="noise" label="Noise Level" value={form.noiseLevel ?? ''} onChange={(e) => u('noiseLevel', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'quiet', label: 'Quiet - I keep to myself' }, { value: 'moderate', label: 'Moderate - Occasional guests' }, { value: 'social', label: 'Social - Regular gatherings' }]} />
          <Select id="schedule" label="Work Schedule" value={form.workSchedule ?? ''} onChange={(e) => u('workSchedule', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'day', label: 'Day shift (9-5)' }, { value: 'night', label: 'Night shift' }, { value: 'flexible', label: 'Flexible hours' }, { value: 'remote', label: 'Work from home' }, { value: 'rotating', label: 'Rotating shifts' }]} />
        </FormGrid>
        <FormGrid columns={2}>
          <Toggle label="Do you own a vehicle?" value={form.vehicleOwner ?? false} onChange={(v) => u('vehicleOwner', v)} />
          {form.vehicleOwner && <Input id="vehicleType" label="Vehicle Type" value={form.vehicleType ?? ''} onChange={(e) => u('vehicleType', e.target.value)} placeholder="e.g. Toyota Corolla" />}
        </FormGrid>
        <Input id="hobbies" label="Hobbies & Interests" value={(form.hobbies ?? []).join(', ')} onChange={(e) => u('hobbies', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} placeholder="e.g. Reading, Football, Cooking" />
        <Input id="clubs" label="Clubs & Associations" value={(form.clubs ?? []).join(', ')} onChange={(e) => u('clubs', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} placeholder="e.g. Rotary Club, Church choir" />
      </CardContent>
    </Card>
  )
}

function ReferencesSection({ form, u }: { form: Profile; u: (f: string, v: unknown) => void }) {
  const pRefs = form.personalReferences ?? []
  const proRefs = form.professionalReferences ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Personal References</CardTitle>
              <p className="text-xs text-muted dark:text-gray-500 mt-1">At least 2 required (family, friends, community leaders)</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => u('personalReferences', [...pRefs, { name: '', relationship: '', phone: '' }])}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {pRefs.length === 0 && <EmptyState text="Add at least 2 personal references" />}
          {pRefs.map((ref, i) => (
            <RefCard key={i} onRemove={() => { const r = [...pRefs]; r.splice(i, 1); u('personalReferences', r) }}>
              <FormGrid columns={3} compact>
                <Input id={`pr-n-${i}`} label="Full Name" value={ref.name} onChange={(e) => { const r = [...pRefs]; r[i] = { ...r[i], name: e.target.value }; u('personalReferences', r) }} />
                <Input id={`pr-r-${i}`} label="Relationship" value={ref.relationship} onChange={(e) => { const r = [...pRefs]; r[i] = { ...r[i], relationship: e.target.value }; u('personalReferences', r) }} placeholder="e.g. Uncle, Pastor" />
                <Input id={`pr-p-${i}`} label="Phone" value={ref.phone} onChange={(e) => { const r = [...pRefs]; r[i] = { ...r[i], phone: e.target.value }; u('personalReferences', r) }} />
                <Input id={`pr-o-${i}`} label="Their Occupation" value={ref.occupation ?? ''} onChange={(e) => { const r = [...pRefs]; r[i] = { ...r[i], occupation: e.target.value }; u('personalReferences', r) }} />
                <Input id={`pr-y-${i}`} label="Years Known" type="number" value={String(ref.yearsKnown ?? '')} onChange={(e) => { const r = [...pRefs]; r[i] = { ...r[i], yearsKnown: Number(e.target.value) || undefined }; u('personalReferences', r) }} />
                <Input id={`pr-e-${i}`} label="Email" value={ref.email ?? ''} onChange={(e) => { const r = [...pRefs]; r[i] = { ...r[i], email: e.target.value }; u('personalReferences', r) }} />
              </FormGrid>
            </RefCard>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Professional References</CardTitle>
              <p className="text-xs text-muted dark:text-gray-500 mt-1">At least 1 required (employer, supervisor, colleague)</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => u('professionalReferences', [...proRefs, { name: '', title: '', company: '', phone: '' }])}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {proRefs.length === 0 && <EmptyState text="Add at least 1 professional reference" />}
          {proRefs.map((ref, i) => (
            <RefCard key={i} onRemove={() => { const r = [...proRefs]; r.splice(i, 1); u('professionalReferences', r) }}>
              <FormGrid columns={3} compact>
                <Input id={`prf-n-${i}`} label="Full Name" value={ref.name} onChange={(e) => { const r = [...proRefs]; r[i] = { ...r[i], name: e.target.value }; u('professionalReferences', r) }} />
                <Input id={`prf-t-${i}`} label="Title / Position" value={ref.title} onChange={(e) => { const r = [...proRefs]; r[i] = { ...r[i], title: e.target.value }; u('professionalReferences', r) }} />
                <Input id={`prf-c-${i}`} label="Company" value={ref.company} onChange={(e) => { const r = [...proRefs]; r[i] = { ...r[i], company: e.target.value }; u('professionalReferences', r) }} />
                <Input id={`prf-p-${i}`} label="Phone" value={ref.phone} onChange={(e) => { const r = [...proRefs]; r[i] = { ...r[i], phone: e.target.value }; u('professionalReferences', r) }} />
                <Input id={`prf-e-${i}`} label="Email" value={ref.email ?? ''} onChange={(e) => { const r = [...proRefs]; r[i] = { ...r[i], email: e.target.value }; u('professionalReferences', r) }} />
              </FormGrid>
            </RefCard>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function RentalHistorySection({ form, u }: { form: Profile; u: (f: string, v: unknown) => void }) {
  const rentals = form.previousRentals ?? []
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Rental History</CardTitle>
            <p className="text-xs text-muted dark:text-gray-500 mt-1">At least 1 previous rental required (or state if first-time renter)</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => u('previousRentals', [...rentals, { address: '', city: '', duration: '', canContact: true }])}>
            <Plus size={14} /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Toggle label="Have you ever been evicted?" value={form.hasBeenEvicted ?? false} onChange={(v) => u('hasBeenEvicted', v)} />
        {form.hasBeenEvicted && (
          <Textarea id="evictionDetails" label="Please explain" value={form.evictionDetails ?? ''} onChange={(e) => u('evictionDetails', e.target.value)} placeholder="Explain the circumstances..." />
        )}

        {rentals.length === 0 && <EmptyState text="Add your rental history" />}
        {rentals.map((rental, i) => (
          <RefCard key={i} onRemove={() => { const r = [...rentals]; r.splice(i, 1); u('previousRentals', r) }}>
            <FormGrid columns={3} compact>
              <Input id={`rh-a-${i}`} label="Address" value={rental.address} onChange={(e) => { const r = [...rentals]; r[i] = { ...r[i], address: e.target.value }; u('previousRentals', r) }} />
              <Input id={`rh-c-${i}`} label="City" value={rental.city} onChange={(e) => { const r = [...rentals]; r[i] = { ...r[i], city: e.target.value }; u('previousRentals', r) }} />
              <Input id={`rh-d-${i}`} label="Duration" value={rental.duration} onChange={(e) => { const r = [...rentals]; r[i] = { ...r[i], duration: e.target.value }; u('previousRentals', r) }} placeholder="e.g. 2 years" />
              <Input id={`rh-r-${i}`} label="Monthly Rent (GHS)" type="number" value={String(rental.monthlyRent ?? '')} onChange={(e) => { const r = [...rentals]; r[i] = { ...r[i], monthlyRent: Number(e.target.value) || undefined }; u('previousRentals', r) }} />
              <Input id={`rh-ln-${i}`} label="Landlord Name" value={rental.landlordName ?? ''} onChange={(e) => { const r = [...rentals]; r[i] = { ...r[i], landlordName: e.target.value }; u('previousRentals', r) }} />
              <Input id={`rh-lp-${i}`} label="Landlord Phone" value={rental.landlordPhone ?? ''} onChange={(e) => { const r = [...rentals]; r[i] = { ...r[i], landlordPhone: e.target.value }; u('previousRentals', r) }} />
            </FormGrid>
            <FormGrid columns={2} compact className="mt-2">
              <Input id={`rh-reason-${i}`} label="Reason for Leaving" value={rental.reasonForLeaving ?? ''} onChange={(e) => { const r = [...rentals]; r[i] = { ...r[i], reasonForLeaving: e.target.value }; u('previousRentals', r) }} />
              <Toggle label="Landlord can be contacted?" value={rental.canContact ?? true} onChange={(v) => { const r = [...rentals]; r[i] = { ...r[i], canContact: v }; u('previousRentals', r) }} />
            </FormGrid>
          </RefCard>
        ))}
      </CardContent>
    </Card>
  )
}

function VerificationSection({ form, u, profile }: { form: Profile; u: (f: string, v: unknown) => void; profile: Profile | undefined }) {
  return (
    <Card>
      <CardHeader><CardTitle>Identity & Verification</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FormGrid columns={2}>
          <Select id="idType" label="ID Type" value={form.idType ?? ''} onChange={(e) => u('idType', e.target.value)} required options={[{ value: '', label: 'Select...' }, { value: 'ghana_card', label: 'Ghana Card (Recommended)' }, { value: 'passport', label: 'Passport' }, { value: 'voter_id', label: "Voter's ID" }, { value: 'drivers_license', label: "Driver's License" }]} />
          <Input id="idNumber" label="ID Number" value={form.idNumber ?? ''} onChange={(e) => u('idNumber', e.target.value)} required placeholder="Enter your ID number" />
        </FormGrid>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <VerifyBadge label="ID Verified" verified={profile?.idVerified ?? false} />
          <VerifyBadge label="Income Verified" verified={profile?.incomeVerified ?? false} />
          <VerifyBadge label="Address Verified" verified={profile?.addressVerified ?? false} />
        </div>

        <p className="text-xs text-muted dark:text-gray-500">
          Upload your ID document, proof of income, and proof of address through the Documents section. Our team will verify them within 24-48 hours.
        </p>
      </CardContent>
    </Card>
  )
}

// === Shared components ===

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border dark:border-[#252a3a] p-3">
      <span className="text-sm text-primary-dark dark:text-white">{label}</span>
      <button type="button" onClick={() => onChange(!value)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${value ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  )
}

function ChipMultiSelect({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
  }
  return (
    <div>
      <p className="text-sm font-medium text-primary-dark dark:text-white mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                active
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-500 border-border dark:border-[#252a3a] hover:border-primary hover:text-primary'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SectionBox({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border dark:border-[#252a3a] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-primary">{icon}</span>
        <p className="text-sm font-semibold text-primary-dark dark:text-white">{title}</p>
      </div>
      {children}
    </div>
  )
}

function RefCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border dark:border-[#252a3a] p-3 relative">
      <button type="button" className="absolute top-2 right-2 text-muted hover:text-danger transition-colors" onClick={onRemove}><X size={14} /></button>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <SharedEmptyState preset="general" title={text} compact />
}

function VerifyBadge({ label, verified }: { label: string; verified: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border dark:border-[#252a3a] p-3">
      {verified ? <CheckCircle size={20} className="text-accent" /> : <AlertCircle size={20} className="text-muted" />}
      <div>
        <p className="text-sm font-semibold text-primary-dark dark:text-white">{label}</p>
        <p className="text-[11px] text-muted dark:text-gray-500">{verified ? 'Verified' : 'Pending'}</p>
      </div>
    </div>
  )
}

function getTabProgress(tab: string, form: Profile): number {
  switch (tab) {
    case 'personal': return [form.dateOfBirth, form.gender, form.maritalStatus, form.nationality, form.religion].filter(Boolean).length * 20
    case 'academic': return form.highestEducation ? (form.highestEducation === 'none' ? 100 : [form.institution, form.fieldOfStudy].filter(Boolean).length * 50) : 0
    case 'professional': return form.employmentStatus ? (form.employmentStatus === 'unemployed' ? 100 : [form.occupation, form.monthlyIncome, form.employmentDuration].filter(Boolean).length * 33) : 0
    case 'family': return [form.numberOfOccupants, form.hasSpouse !== undefined, form.hasChildren !== undefined].filter(Boolean).length * 33
    case 'lifestyle': return [form.smoker !== undefined && form.smoker !== null, form.noiseLevel, form.workSchedule, form.pets !== undefined && form.pets !== null].filter(Boolean).length * 25
    case 'references': {
      let s = 0
      if ((form.personalReferences ?? []).length >= 2) s += 67
      else if ((form.personalReferences ?? []).length >= 1) s += 33
      if ((form.professionalReferences ?? []).length >= 1) s += 33
      return Math.min(100, s)
    }
    case 'rental_history': return (form.previousRentals ?? []).length >= 1 ? 100 : 0
    case 'verification': {
      let s = 0
      if (form.idType && form.idNumber) s += 50
      if (form.idVerified) s += 30
      if (form.incomeVerified) s += 20
      return s
    }
    default: return 0
  }
}
