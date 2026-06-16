import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

const TRADE_OPTIONS = ['plumbing', 'electrical', 'carpentry', 'painting', 'pest', 'cleaning', 'security', 'appliance']

export default function BecomeWorkerScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [trades, setTrades] = useState<string[]>([])
  const [skills, setSkills] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [serviceRadius, setServiceRadius] = useState('')
  const [yearsExperience, setYearsExperience] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/workers', {
        name,
        phone,
        trades,
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        bio,
        location,
        hourlyRate: Number(hourlyRate) || 0,
        serviceRadius: Number(serviceRadius) || 10,
        yearsExperience: Number(yearsExperience) || 0,
        status: 'active',
      }),
    onSuccess: () => {
      Alert.alert('Success', 'Your worker profile has been created!', [
        { text: 'OK', onPress: () => router.push('/workers') },
      ])
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create worker profile. Please try again.')
    },
  })

  function toggleTrade(trade: string) {
    setTrades((prev) => (prev.includes(trade) ? prev.filter((t) => t !== trade) : [...prev, trade]))
  }

  function handleSubmit() {
    if (!name.trim() || !phone.trim() || trades.length === 0) {
      Alert.alert('Required', 'Please fill in your name, phone, and select at least one trade.')
      return
    }
    mutation.mutate()
  }

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <View style={[s.header, { backgroundColor: c.primary }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Become a Worker</Text>
        <Text style={s.headerSubtitle}>Offer your skills on RentOS</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.label, { color: c.text }]}>Full Name *</Text>
          <TextInput
            style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
            placeholder="Kwasi Osei"
            placeholderTextColor={c.muted}
            value={name}
            onChangeText={setName}
          />

          <Text style={[s.label, { color: c.text }]}>Phone Number *</Text>
          <TextInput
            style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
            placeholder="0244441111"
            placeholderTextColor={c.muted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <Text style={[s.label, { color: c.text }]}>Trades *</Text>
          <View style={s.chipRow}>
            {TRADE_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  s.chip,
                  { backgroundColor: trades.includes(t) ? c.primary : c.surface, borderColor: c.border },
                ]}
                onPress={() => toggleTrade(t)}
              >
                <Text style={[s.chipText, { color: trades.includes(t) ? '#fff' : c.textLight }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.label, { color: c.text }]}>Skills (comma separated)</Text>
          <TextInput
            style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
            placeholder="Pipe fitting, Leak detection, ..."
            placeholderTextColor={c.muted}
            value={skills}
            onChangeText={setSkills}
          />

          <Text style={[s.label, { color: c.text }]}>Bio</Text>
          <TextInput
            style={[s.input, s.textarea, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
            placeholder="Tell customers about your experience..."
            placeholderTextColor={c.muted}
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
          />

          <Text style={[s.label, { color: c.text }]}>Location</Text>
          <TextInput
            style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
            placeholder="Accra"
            placeholderTextColor={c.muted}
            value={location}
            onChangeText={setLocation}
          />

          <View style={s.row}>
            <View style={s.half}>
              <Text style={[s.label, { color: c.text }]}>Hourly Rate (GHS)</Text>
              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                placeholder="80"
                placeholderTextColor={c.muted}
                value={hourlyRate}
                onChangeText={setHourlyRate}
                keyboardType="numeric"
              />
            </View>
            <View style={s.half}>
              <Text style={[s.label, { color: c.text }]}>Service Radius (km)</Text>
              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                placeholder="15"
                placeholderTextColor={c.muted}
                value={serviceRadius}
                onChangeText={setServiceRadius}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={[s.label, { color: c.text }]}>Years of Experience</Text>
          <TextInput
            style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
            placeholder="5"
            placeholderTextColor={c.muted}
            value={yearsExperience}
            onChangeText={setYearsExperience}
            keyboardType="numeric"
          />

          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: c.primary }]}
            onPress={handleSubmit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.submitBtnText}>Create Worker Profile</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { position: 'absolute', top: 56, left: spacing.lg, width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 22, fontFamily: 'Manrope_800ExtraBold' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  scroll: { padding: spacing.lg },
  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, fontFamily: 'Manrope_400Regular', marginTop: 4 },
  textarea: { height: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  submitBtn: { marginTop: spacing.lg, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
})
