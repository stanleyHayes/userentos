import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'
import { AITextInput } from '../components/AITextInput'

interface TenantProfile {
  id: string; userId: string; completionScore: number; bio: string; dateOfBirth: string
  gender: string; maritalStatus: string; nationality: string; employmentStatus: string
  occupation: string; employer: string; monthlyIncome: number; smokingStatus: string
  petStatus: string; noiseLevel: string; languagesSpoken: string[]; ethnicGroup: string
  highestEducation: string; institution: string; fieldOfStudy: string
  graduationYear: number | null; currentlyStudying: boolean
}

const genderOptions = ['male', 'female', 'other', 'prefer_not_to_say']
const maritalOptions = ['single', 'married', 'divorced', 'widowed']
const employmentOptions = ['employed', 'self_employed', 'unemployed', 'student', 'retired']
const smokingOptions = ['non_smoker', 'smoker', 'occasional']
const petOptions = ['no_pets', 'has_pets', 'open_to_pets']
const noiseOptions = ['quiet', 'moderate', 'social']
const nationalityOptions = ['Ghanaian', 'Nigerian', 'Togolese', 'Ivorian', 'British', 'American', 'Other']
const languageOptions = ['English', 'Twi', 'Ga', 'Ewe', 'Hausa', 'Fante', 'Dagbani', 'Nzema', 'Other']
const ethnicGroupOptions = ['Akan', 'Ewe', 'Ga-Dangme', 'Mole-Dagbon', 'Guan', 'Gurma', 'Grusi', 'Mande', 'Other']
const educationOptions = ['none', 'basic', 'shs', 'diploma', 'bachelors', 'masters', 'phd']
const currencyOptions = ['GHS', 'USD', 'EUR', 'GBP', 'NGN']
const currencySymbols: Record<string, string> = { GHS: '\u20B5', USD: '$', EUR: '\u20AC', GBP: '\u00A3', NGN: '\u20A6' }

interface IncomeSource { source: string; amount: number; currency: string }

export default function TenantProfileScreen() {
  const c = useThemeColors()
  const [profile, setProfile] = useState<TenantProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    bio: '', dateOfBirth: '', gender: '', maritalStatus: '', nationality: '',
    employmentStatus: '', occupation: '', employer: '', monthlyIncome: '',
    smokingStatus: '', petStatus: '', noiseLevel: '',
    languagesSpoken: [] as string[], ethnicGroup: '',
    highestEducation: '', institution: '', fieldOfStudy: '',
    graduationYear: '' as string, currentlyStudying: false,
    primaryCurrency: 'GHS',
    incomeSources: [] as IncomeSource[],
  })

  async function load() {
    try {
      const data = await api.get<TenantProfile>('/tenant-profile/me')
      setProfile(data)
      setForm({
        bio: data.bio ?? '', dateOfBirth: data.dateOfBirth ?? '', gender: data.gender ?? '',
        maritalStatus: data.maritalStatus ?? '', nationality: data.nationality ?? '',
        employmentStatus: data.employmentStatus ?? '', occupation: data.occupation ?? '',
        employer: data.employer ?? '', monthlyIncome: data.monthlyIncome ? String(data.monthlyIncome) : '',
        smokingStatus: data.smokingStatus ?? '', petStatus: data.petStatus ?? '', noiseLevel: data.noiseLevel ?? '',
        languagesSpoken: (data as unknown as Record<string, unknown>).languagesSpoken as string[] ?? [], ethnicGroup: (data as unknown as Record<string, unknown>).ethnicGroup as string ?? '',
        highestEducation: (data as unknown as Record<string, unknown>).highestEducation as string ?? '', institution: (data as unknown as Record<string, unknown>).institution as string ?? '',
        fieldOfStudy: (data as unknown as Record<string, unknown>).fieldOfStudy as string ?? '',
        graduationYear: (data as unknown as Record<string, unknown>).graduationYear ? String((data as unknown as Record<string, unknown>).graduationYear) : '',
        currentlyStudying: (data as unknown as Record<string, unknown>).currentlyStudying as boolean ?? false,
        primaryCurrency: (data as unknown as Record<string, unknown>).primaryCurrency as string ?? 'GHS',
        incomeSources: (data as unknown as Record<string, unknown>).incomeSources as IncomeSource[] ?? [],
      })
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        ...form,
        monthlyIncome: form.monthlyIncome ? Number(form.monthlyIncome) : undefined,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
        primaryCurrency: form.primaryCurrency,
        incomeSources: form.incomeSources,
      }
      const data = await api.patch<TenantProfile>('/tenant-profile/me', payload)
      setProfile(data)
      Alert.alert('Success', 'Your profile has been updated.')
    } catch (err) {
      const _err = err as { message?: string }
      Alert.alert('Error', (err as { message?: string }).message || 'Failed to update profile')
    } finally { setSaving(false) }
  }

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: c.surface }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  const completionScore = profile?.completionScore ?? 0

  return (
    <ScrollView style={[s.container, { backgroundColor: c.surface }]}>

      <View style={[s.scoreCard, { backgroundColor: c.white }]}>
        <View style={s.scoreHeader}>
          <Text style={[s.scoreTitle, { color: c.primaryDark }]}>Profile Completion</Text>
          <Text style={[s.scoreValue, { color: c.accent }]}>{completionScore}%</Text>
        </View>
        <View style={[s.progressBar, { backgroundColor: c.surface }]}>
          <View style={[s.progressFill, { width: `${Math.min(100, completionScore)}%`, backgroundColor: c.accent }]} />
        </View>
        <Text style={[s.scoreHint, { color: c.muted }]}>
          {completionScore >= 80 ? 'Great! Your profile is looking strong.' : 'Complete your profile to increase your chances with landlords.'}
        </Text>
      </View>

      <View style={[s.sectionCard, { backgroundColor: c.white }]}>
        <View style={s.sectionHeader}>
          <Ionicons name="person-outline" size={20} color={c.primary} />
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Personal Information</Text>
        </View>
        <AITextInput label="Bio" aiContext="tenant bio for rental applications" value={form.bio} onChangeText={(v) => updateForm('bio', v)} placeholder="Tell landlords about yourself..." numberOfLines={3} />
        <FormField label="Date of Birth" value={form.dateOfBirth} onChange={(v) => updateForm('dateOfBirth', v)} placeholder="YYYY-MM-DD" c={c} />
        <OptionPicker label="Gender" value={form.gender} options={genderOptions} onChange={(v) => updateForm('gender', v)} c={c} />
        <OptionPicker label="Marital Status" value={form.maritalStatus} options={maritalOptions} onChange={(v) => updateForm('maritalStatus', v)} c={c} />
        <OptionPicker label="Nationality" value={form.nationality} options={nationalityOptions} onChange={(v) => updateForm('nationality', v)} c={c} />
        <OptionPicker label="Ethnic Group" value={form.ethnicGroup} options={ethnicGroupOptions} onChange={(v) => updateForm('ethnicGroup', v)} c={c} />
        <ChipMultiSelect label="Languages Spoken" options={languageOptions} selected={form.languagesSpoken} onChange={(v) => setForm((prev) => ({ ...prev, languagesSpoken: v }))} c={c} />
      </View>

      <View style={[s.sectionCard, { backgroundColor: c.white }]}>
        <View style={s.sectionHeader}>
          <Ionicons name="school-outline" size={20} color={c.primary} />
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Academic Background</Text>
        </View>
        <OptionPicker label="Highest Education" value={form.highestEducation} options={educationOptions} onChange={(v) => updateForm('highestEducation', v)} c={c} />
        {form.highestEducation !== '' && form.highestEducation !== 'none' && (
          <>
            <FormField label="Institution" value={form.institution} onChange={(v) => updateForm('institution', v)} placeholder="e.g. University of Ghana" c={c} />
            <FormField label="Field of Study" value={form.fieldOfStudy} onChange={(v) => updateForm('fieldOfStudy', v)} placeholder="e.g. Business Administration" c={c} />
            <ToggleField
              label="Currently Studying"
              value={form.currentlyStudying}
              onChange={(v) => {
                setForm((prev) => ({ ...prev, currentlyStudying: v, ...(v ? { graduationYear: '' } : {}) }))
              }}
              c={c}
            />
            <FormField
              label="Year of Graduation"
              value={form.graduationYear}
              onChange={(v) => updateForm('graduationYear', v)}
              placeholder="e.g. 2020"
              keyboardType="numeric"
              c={c}
              disabled={form.currentlyStudying}
            />
          </>
        )}
      </View>

      <View style={[s.sectionCard, { backgroundColor: c.white }]}>
        <View style={s.sectionHeader}>
          <Ionicons name="briefcase-outline" size={20} color={c.primary} />
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Professional Information</Text>
        </View>
        <OptionPicker label="Employment Status" value={form.employmentStatus} options={employmentOptions} onChange={(v) => updateForm('employmentStatus', v)} c={c} />
        <FormField label="Occupation" value={form.occupation} onChange={(v) => updateForm('occupation', v)} placeholder="e.g. Software Engineer" c={c} />
        <FormField label="Employer" value={form.employer} onChange={(v) => updateForm('employer', v)} placeholder="e.g. Company name" c={c} />

        {/* Primary Income with Currency */}
        <View style={s.fieldContainer}>
          <Text style={[s.fieldLabel, { color: c.muted }]}>Monthly Income</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              style={[s.fieldInput, { backgroundColor: c.surface, color: c.text, borderColor: c.border, flex: 1 }]}
              value={form.monthlyIncome}
              onChangeText={(v) => updateForm('monthlyIncome', v)}
              placeholder="e.g. 5000"
              placeholderTextColor={c.muted}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Currency Selector */}
        <View style={s.fieldContainer}>
          <Text style={[s.fieldLabel, { color: c.muted }]}>Currency</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {currencyOptions.map((cur) => (
                <TouchableOpacity
                  key={cur}
                  style={[
                    s.currencyChip,
                    { borderColor: c.border, backgroundColor: c.surface },
                    form.primaryCurrency === cur && { borderColor: c.primary, backgroundColor: c.primary + '15' },
                  ]}
                  onPress={() => setForm((prev) => ({ ...prev, primaryCurrency: cur }))}
                >
                  <Text style={[
                    s.currencyChipSymbol,
                    { color: c.muted },
                    form.primaryCurrency === cur && { color: c.primary },
                  ]}>
                    {currencySymbols[cur]}
                  </Text>
                  <Text style={[
                    s.currencyChipText,
                    { color: c.muted },
                    form.primaryCurrency === cur && { color: c.primary, fontFamily: 'Manrope_700Bold' },
                  ]}>
                    {cur}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Additional Income Sources */}
        <View style={[s.incomeSourcesBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <Ionicons name="wallet-outline" size={16} color={c.primary} />
            <Text style={[s.incomeSourcesTitle, { color: c.primaryDark }]}>Additional Income Sources</Text>
          </View>
          <Text style={[s.incomeSourcesHint, { color: c.muted }]}>Side jobs, freelancing, or other income</Text>

          {form.incomeSources.length === 0 && (
            <Text style={[s.incomeSourcesEmpty, { color: c.muted }]}>No additional income sources</Text>
          )}

          {form.incomeSources.map((src, i) => (
            <View key={i} style={[s.incomeSourceCard, { backgroundColor: c.white, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <Text style={[s.incomeSourceCardLabel, { color: c.primaryDark }]}>Source {i + 1}</Text>
                <TouchableOpacity
                  onPress={() => {
                    const updated = [...form.incomeSources]
                    updated.splice(i, 1)
                    setForm((prev) => ({ ...prev, incomeSources: updated }))
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={c.muted} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={[s.fieldInput, { backgroundColor: c.surface, color: c.text, borderColor: c.border, marginBottom: spacing.sm }]}
                value={src.source}
                onChangeText={(v) => {
                  const updated = [...form.incomeSources]
                  updated[i] = { ...updated[i], source: v }
                  setForm((prev) => ({ ...prev, incomeSources: updated }))
                }}
                placeholder="e.g. Freelancing, Side Business"
                placeholderTextColor={c.muted}
              />

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                <TextInput
                  style={[s.fieldInput, { backgroundColor: c.surface, color: c.text, borderColor: c.border, flex: 1 }]}
                  value={src.amount ? String(src.amount) : ''}
                  onChangeText={(v) => {
                    const updated = [...form.incomeSources]
                    updated[i] = { ...updated[i], amount: Number(v) || 0 }
                    setForm((prev) => ({ ...prev, incomeSources: updated }))
                  }}
                  placeholder="Amount"
                  placeholderTextColor={c.muted}
                  keyboardType="numeric"
                />
              </View>

              {/* Currency chips for this source */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {currencyOptions.map((cur) => (
                    <TouchableOpacity
                      key={cur}
                      style={[
                        s.currencyChipSmall,
                        { borderColor: c.border, backgroundColor: c.surface },
                        (src.currency || 'GHS') === cur && { borderColor: c.primary, backgroundColor: c.primary + '15' },
                      ]}
                      onPress={() => {
                        const updated = [...form.incomeSources]
                        updated[i] = { ...updated[i], currency: cur }
                        setForm((prev) => ({ ...prev, incomeSources: updated }))
                      }}
                    >
                      <Text style={[
                        s.currencyChipSmallText,
                        { color: c.muted },
                        (src.currency || 'GHS') === cur && { color: c.primary, fontFamily: 'Manrope_700Bold' },
                      ]}>
                        {cur}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          ))}

          <TouchableOpacity
            style={[s.addSourceButton, { borderColor: c.primary }]}
            onPress={() => {
              setForm((prev) => ({
                ...prev,
                incomeSources: [...prev.incomeSources, { source: '', amount: 0, currency: prev.primaryCurrency }],
              }))
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color={c.primary} />
            <Text style={[s2.addSourceButtonText, { color: c.primary }]}>Add Source</Text>
          </TouchableOpacity>
        </View>

        {/* Total Monthly Income */}
        {(() => {
          const primaryIncome = form.monthlyIncome ? Number(form.monthlyIncome) : 0
          const additionalTotal = form.incomeSources.reduce((sum, src) => sum + (src.amount || 0), 0)
          const totalIncome = primaryIncome + additionalTotal
          const symbol = currencySymbols[form.primaryCurrency] || form.primaryCurrency

          return (
            <View style={[s2.totalIncomeCard, { backgroundColor: c.primary + '10', borderColor: c.primary + '30' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="cash-outline" size={20} color={c.primary} />
                <Text style={[s2.totalIncomeLabel, { color: c.primaryDark }]}>Total Monthly Income</Text>
              </View>
              <Text style={[s2.totalIncomeValue, { color: c.primary }]}>
                {symbol} {totalIncome.toLocaleString()}
              </Text>
              {form.incomeSources.length > 0 && (
                <Text style={[s2.totalIncomeBreakdown, { color: c.muted }]}>
                  Primary: {symbol}{primaryIncome.toLocaleString()} + {form.incomeSources.length} additional source{form.incomeSources.length > 1 ? 's' : ''}
                </Text>
              )}
            </View>
          )
        })()}
      </View>

      <View style={[s.sectionCard, { backgroundColor: c.white }]}>
        <View style={s.sectionHeader}>
          <Ionicons name="heart-outline" size={20} color={c.primary} />
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Lifestyle</Text>
        </View>
        <OptionPicker label="Smoking" value={form.smokingStatus} options={smokingOptions} onChange={(v) => updateForm('smokingStatus', v)} c={c} />
        <OptionPicker label="Pets" value={form.petStatus} options={petOptions} onChange={(v) => updateForm('petStatus', v)} c={c} />
        <OptionPicker label="Noise Level" value={form.noiseLevel} options={noiseOptions} onChange={(v) => updateForm('noiseLevel', v)} c={c} />
      </View>

      <TouchableOpacity style={[s.saveButton, { backgroundColor: c.primary }]} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" />
            <Text style={s.saveButtonText}>Save Profile</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  )
}

function FormField({ label, value, onChange, placeholder, multiline, keyboardType, c, disabled }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: 'default' | 'numeric'; c: ReturnType<typeof useThemeColors>; disabled?: boolean
}) {
  return (
    <View style={s.fieldContainer}>
      <Text style={[s.fieldLabel, { color: c.muted }]}>{label}</Text>
      <TextInput
        style={[s.fieldInput, { backgroundColor: disabled ? c.border : c.surface, color: disabled ? c.muted : c.text, borderColor: c.border }, multiline && s.fieldInputMultiline]}
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted}
        multiline={multiline} numberOfLines={multiline ? 3 : 1} keyboardType={keyboardType ?? 'default'}
        editable={!disabled}
      />
    </View>
  )
}

function ToggleField({ label, value, onChange, c }: {
  label: string; value: boolean; onChange: (v: boolean) => void; c: ReturnType<typeof useThemeColors>
}) {
  return (
    <View style={s.fieldContainer}>
      <TouchableOpacity
        style={[s.toggleRow, { backgroundColor: c.surface, borderColor: c.border }]}
        onPress={() => onChange(!value)}
        activeOpacity={0.7}
      >
        <Text style={[s.toggleLabel, { color: c.text }]}>{label}</Text>
        <View style={[s.toggleTrack, { backgroundColor: value ? c.primary : c.border }]}>
          <View style={[s.toggleThumb, value && s.toggleThumbActive]} />
        </View>
      </TouchableOpacity>
    </View>
  )
}

function ChipMultiSelect({ label, options, selected, onChange, c }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; c: ReturnType<typeof useThemeColors>
}) {
  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
  }
  return (
    <View style={s.fieldContainer}>
      <Text style={[s.fieldLabel, { color: c.muted }]}>{label}</Text>
      <View style={s.optionsRow}>
        {options.map((opt) => {
          const active = selected.includes(opt)
          return (
            <TouchableOpacity
              key={opt}
              style={[s.optionChip, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.surface }]}
              onPress={() => toggle(opt)}
            >
              <Text style={[s.optionChipText, { color: active ? '#ffffff' : c.muted }, active && { fontFamily: 'Manrope_600SemiBold' }]}>
                {opt}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function OptionPicker({ label, value, options, onChange, c }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; c: ReturnType<typeof useThemeColors>
}) {
  return (
    <View style={s.fieldContainer}>
      <Text style={[s.fieldLabel, { color: c.muted }]}>{label}</Text>
      <View style={s.optionsRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[s.optionChip, { borderColor: c.border, backgroundColor: c.surface }, value === opt && { borderColor: c.primary, backgroundColor: c.primary + '10' }]}
            onPress={() => onChange(value === opt ? '' : opt)}
          >
            <Text style={[s.optionChipText, { color: c.muted }, value === opt && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>
              {opt.replace(/_/g, ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  scoreCard: { margin: spacing.md, borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  scoreTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  scoreValue: { fontSize: 20, fontFamily: 'Manrope_800ExtraBold' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  scoreHint: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginTop: spacing.sm },
  sectionCard: { marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  fieldContainer: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', marginBottom: 6 },
  fieldInput: { borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, fontFamily: 'Manrope_400Regular', borderWidth: 1 },
  fieldInputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  optionChipText: { fontSize: 12, fontFamily: 'Manrope_500Medium', textTransform: 'capitalize' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1 },
  toggleLabel: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 2 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff' },
  toggleThumbActive: { transform: [{ translateX: 20 }] },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.lg, paddingVertical: 16, borderRadius: 12 },
  saveButtonText: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: '#ffffff' },
  currencyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  currencyChipSymbol: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  currencyChipText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  currencyChipSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  currencyChipSmallText: { fontSize: 11, fontFamily: 'Manrope_500Medium' },
  incomeSourcesBox: { borderRadius: 12, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  incomeSourcesTitle: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  incomeSourcesHint: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginBottom: spacing.sm },
  incomeSourcesEmpty: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingVertical: spacing.md },
  incomeSourceCard: { borderRadius: 10, borderWidth: 1, padding: spacing.sm, marginBottom: spacing.sm },
  incomeSourceCardLabel: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  addSourceButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', marginTop: spacing.sm },
} as const)

const s2 = StyleSheet.create({
  addSourceButtonText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  totalIncomeCard: { borderRadius: 12, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md, alignItems: 'center' as const, gap: spacing.sm },
  totalIncomeLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  totalIncomeValue: { fontSize: 22, fontFamily: 'Manrope_800ExtraBold' },
  totalIncomeBreakdown: { fontSize: 11, fontFamily: 'Manrope_400Regular', textAlign: 'center' as const },
})
