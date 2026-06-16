import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Switch, Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'
import { AITextInput } from '../components/AITextInput'

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central', 'Northern', 'Volta', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Savannah', 'North East', 'Oti', 'Western North']
const TYPES = ['apartment', 'house', 'room', 'studio', 'townhouse', 'hostel', 'shared_room', 'commercial', 'warehouse']
const AMENITIES = ['Water', 'Electricity', 'WiFi', 'Parking', 'Security', 'AC', 'Generator', 'Swimming Pool', 'Gym', 'Garden', 'Garage', 'Elevator', 'Balcony', 'Laundry', 'CCTV']

export default function AddPropertyScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [images, setImages] = useState<string[]>([])

  const [form, setForm] = useState({
    title: '', description: '', type: 'apartment',
    street: '', city: '', region: 'Greater Accra', neighborhood: '', digitalAddress: '',
    rentAmount: '', rentDurationMonths: '12', advanceMonths: '3',
    bedrooms: '1', bathrooms: '1', furnished: false, parkingSpaces: '0', floorArea: '',
    amenities: [] as string[],
    rules: '',
  })

  function u(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleAmenity(a: string) {
    u('amenities', form.amenities.includes(a) ? form.amenities.filter((x: string) => x !== a) : [...form.amenities, a])
  }

  async function pickImages() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10 - images.length,
    })
    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 10))
    }
  }

  async function handleSubmit() {
    if (!form.title.trim()) { Alert.alert('Error', 'Please enter a title'); return }
    if (!form.description.trim()) { Alert.alert('Error', 'Please enter a description'); return }
    if (!form.street.trim() || !form.city.trim()) { Alert.alert('Error', 'Street and city are required'); return }
    if (!form.rentAmount || Number(form.rentAmount) <= 0) { Alert.alert('Error', 'Please enter a valid rent amount'); return }

    setSubmitting(true)
    try {
      const property = await api.post<Record<string, unknown>>('/properties', {
        title: form.title, description: form.description, type: form.type,
        address: { street: form.street, city: form.city, region: form.region, neighborhood: form.neighborhood || undefined, digitalAddress: form.digitalAddress || undefined },
        rentAmount: Number(form.rentAmount),
        rentDurationMonths: Number(form.rentDurationMonths),
        advanceMonths: Number(form.advanceMonths),
        bedrooms: Number(form.bedrooms), bathrooms: Number(form.bathrooms),
        furnished: form.furnished, parkingSpaces: Number(form.parkingSpaces),
        floorArea: form.floorArea ? Number(form.floorArea) : undefined,
        amenities: form.amenities,
        rules: form.rules ? form.rules.split('\n').filter(Boolean) : [],
      })

      // Upload images
      if (images.length > 0 && property?.id) {
        const formData = new FormData()
        for (const uri of images) {
          const filename = uri.split('/').pop() ?? 'photo.jpg'
          formData.append('images', { uri, name: filename, type: 'image/jpeg' } as unknown as Blob)
        }
        await fetch(
          `${__DEV__ ? 'http://localhost:3002/api' : process.env.EXPO_PUBLIC_API_URL + '/api'}/properties/${property.id}/images`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${(await import('../stores/authStore')).useAuthStore.getState().token}` },
            body: formData,
          }
        )
      }

      Alert.alert('Success', 'Property listed successfully!', [
        { text: 'View', onPress: () => router.replace(`/property/${property.id}`) },
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', _err.message || 'Failed to create property')
    } finally { setSubmitting(false) }
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: c.surface }]} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Basic Info */}
      <Section title="Basic Information" icon="home-outline" c={c}>
        <Field label="Title *" value={form.title} onChangeText={(v) => u('title', v)} c={c} placeholder="e.g. 2-Bedroom Apartment, East Legon" />
        <AITextInput label="Description *" aiContext="property description" value={form.description} onChangeText={(v) => u('description', v)} placeholder="Describe the property..." numberOfLines={5} />
        <Text style={[s.fieldLabel, { color: c.text }]}>Type</Text>
        <View style={s.chipRow}>
          {TYPES.map((t) => (
            <TouchableOpacity key={t} style={[s.chip, { borderColor: c.border }, form.type === t && { borderColor: c.primary, backgroundColor: c.primary + '10' }]} onPress={() => u('type', t)}>
              <Text style={[s.chipText, { color: form.type === t ? c.primary : c.text }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      {/* Location */}
      <Section title="Location" icon="location-outline" c={c}>
        <Field label="Street *" value={form.street} onChangeText={(v) => u('street', v)} c={c} placeholder="e.g. 14 Oxford Street" />
        <Field label="City *" value={form.city} onChangeText={(v) => u('city', v)} c={c} placeholder="e.g. Osu" />
        <Text style={[s.fieldLabel, { color: c.text }]}>Region</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={s.chipRow}>
            {REGIONS.map((r) => (
              <TouchableOpacity key={r} style={[s.chip, { borderColor: c.border }, form.region === r && { borderColor: c.primary, backgroundColor: c.primary + '10' }]} onPress={() => u('region', r)}>
                <Text style={[s.chipText, { color: form.region === r ? c.primary : c.text }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Field label="Neighborhood" value={form.neighborhood} onChangeText={(v) => u('neighborhood', v)} c={c} placeholder="e.g. Airport Residential" />
        <Field label="Digital Address" value={form.digitalAddress} onChangeText={(v) => u('digitalAddress', v)} c={c} placeholder="e.g. GA-123-4567" />
      </Section>

      {/* Pricing */}
      <Section title="Pricing" icon="cash-outline" c={c}>
        <Field label="Rent Amount (GHS) *" value={form.rentAmount} onChangeText={(v) => u('rentAmount', v)} c={c} keyboardType="numeric" placeholder="e.g. 2500" />
        <Field label="Lease Duration (months)" value={form.rentDurationMonths} onChangeText={(v) => u('rentDurationMonths', v)} c={c} keyboardType="numeric" />
        <Field label="Advance (months, max 6)" value={form.advanceMonths} onChangeText={(v) => u('advanceMonths', v)} c={c} keyboardType="numeric" />
      </Section>

      {/* Details */}
      <Section title="Property Details" icon="bed-outline" c={c}>
        <View style={s.row}>
          <View style={{ flex: 1 }}><Field label="Bedrooms" value={form.bedrooms} onChangeText={(v) => u('bedrooms', v)} c={c} keyboardType="numeric" /></View>
          <View style={{ flex: 1 }}><Field label="Bathrooms" value={form.bathrooms} onChangeText={(v) => u('bathrooms', v)} c={c} keyboardType="numeric" /></View>
        </View>
        <View style={s.row}>
          <View style={{ flex: 1 }}><Field label="Parking Spaces" value={form.parkingSpaces} onChangeText={(v) => u('parkingSpaces', v)} c={c} keyboardType="numeric" /></View>
          <View style={{ flex: 1 }}><Field label="Floor Area (sqm)" value={form.floorArea} onChangeText={(v) => u('floorArea', v)} c={c} keyboardType="numeric" /></View>
        </View>
        <View style={[s.switchRow, { borderColor: c.border }]}>
          <Text style={[s.switchLabel, { color: c.text }]}>Furnished</Text>
          <Switch value={form.furnished} onValueChange={(v) => u('furnished', v)} trackColor={{ false: c.border, true: c.primary + '60' }} thumbColor={form.furnished ? c.primary : '#f4f3f4'} />
        </View>
      </Section>

      {/* Amenities */}
      <Section title="Amenities" icon="wifi-outline" c={c}>
        <View style={s.chipRow}>
          {AMENITIES.map((a) => {
            const active = form.amenities.includes(a)
            return (
              <TouchableOpacity key={a} style={[s.chip, { borderColor: c.border }, active && { borderColor: c.accent, backgroundColor: c.accent + '10' }]} onPress={() => toggleAmenity(a)}>
                {active && <Ionicons name="checkmark" size={14} color={c.accent} />}
                <Text style={[s.chipText, { color: active ? c.accent : c.text }]}>{a}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </Section>

      {/* Images */}
      <Section title="Photos" icon="images-outline" c={c}>
        <TouchableOpacity style={[s.imagePickerBtn, { borderColor: c.border }]} onPress={pickImages} activeOpacity={0.7}>
          <Ionicons name="cloud-upload-outline" size={28} color={c.muted} />
          <Text style={[s.imagePickerText, { color: c.muted }]}>Tap to select photos (max 10)</Text>
          <Text style={[s.imagePickerHint, { color: c.muted }]}>{images.length}/10 selected</Text>
        </TouchableOpacity>
        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            {images.map((uri, i) => (
              <View key={i} style={s.previewWrap}>
                <Image source={{ uri }} style={s.previewImg} />
                <TouchableOpacity style={s.previewRemove} onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))}>
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </Section>

      {/* Rules */}
      <Section title="House Rules" icon="document-text-outline" c={c}>
        <AITextInput label="Rules (one per line)" aiContext="house rules for a rental property" value={form.rules} onChangeText={(v) => u('rules', v)} placeholder={"No loud music after 10pm\nNo smoking indoors"} numberOfLines={6} />
      </Section>

      {/* Submit */}
      <TouchableOpacity
        style={[s.submitBtn, { backgroundColor: c.primary }, submitting && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={s.submitBtnText}>List Property</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

function Section({ title, icon, c, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; c: ReturnType<typeof useThemeColors>; children: React.ReactNode }) {
  return (
    <View style={[s.section, { backgroundColor: c.white }]}>
      <View style={s.sectionHeader}>
        <Ionicons name={icon} size={18} color={c.primary} />
        <Text style={[s.sectionTitle, { color: c.primaryDark }]}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

function Field({ label, value, onChangeText, c, ...props }: {
  label: string; value: string; onChangeText: (t: string) => void; c: ReturnType<typeof useThemeColors>
} & Partial<React.ComponentProps<typeof TextInput>>) {
  return (
    <>
      <Text style={[s.fieldLabel, { color: c.text }]}>{label}</Text>
      <TextInput
        style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
        placeholderTextColor={c.muted}
        value={value}
        onChangeText={onChangeText}
        {...props}
      />
    </>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.md },
  section: { borderRadius: 12, padding: spacing.lg, marginBottom: spacing.md, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: 6, marginTop: spacing.sm },
  input: { borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 14, borderWidth: 1, fontFamily: 'Manrope_500Medium' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  row: { flexDirection: 'row', gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, marginTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  switchLabel: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  imagePickerBtn: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 28, alignItems: 'center', gap: 6 },
  imagePickerText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  imagePickerHint: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  previewWrap: { marginRight: 10, position: 'relative' },
  previewImg: { width: 80, height: 80, borderRadius: 10 },
  previewRemove: { position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 18 },
  submitBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Manrope_700Bold' },
})
