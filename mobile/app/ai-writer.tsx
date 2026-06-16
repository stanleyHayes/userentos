import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  Clipboard, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

const TABS = [
  { key: 'listing', label: 'Listing', icon: 'document-text-outline' as const },
  { key: 'formalize', label: 'Formalize', icon: 'create-outline' as const },
  { key: 'translate', label: 'Translate', icon: 'language-outline' as const },
  { key: 'quality', label: 'Quality', icon: 'checkmark-circle-outline' as const },
]

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'simple', label: 'Simple' },
]

// Values are the server's supported language codes (en|tw|ga|ee).
const LANGUAGES = [
  { value: 'tw', label: 'Twi' },
  { value: 'ga', label: 'Ga' },
  { value: 'ee', label: 'Ewe' },
]

export default function AIWriterScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('listing')
  const [input, setInput] = useState('')
  const [tone, setTone] = useState('professional')
  const [language, setLanguage] = useState('tw')
  const [result, setResult] = useState('')

  // Each tab maps to its real, separate server endpoint and response shape.
  const generate = useMutation({
    mutationFn: async (): Promise<string> => {
      if (activeTab === 'listing') {
        const d = await api.post<{ text: string }>('/ai/generate', {
          prompt: input,
          context: `${tone} property rental listing`,
        })
        return d.text ?? ''
      }
      if (activeTab === 'formalize') {
        const d = await api.post<{ text: string }>('/ai/formalize', { text: input })
        return d.text ?? ''
      }
      if (activeTab === 'translate') {
        const d = await api.post<{ text: string }>('/ai/translate', { text: input, targetLanguage: language })
        return d.text ?? ''
      }
      // quality
      const d = await api.post<{ score: number; feedback?: string[]; missing?: string[] }>(
        '/ai/listing-quality',
        { description: input },
      )
      const lines = [`Score: ${d.score ?? 0}/100`]
      if (d.feedback?.length) lines.push('', 'Feedback:', ...d.feedback.map((f) => `• ${f}`))
      if (d.missing?.length) lines.push('', 'Missing details:', ...d.missing.map((m) => `• ${m}`))
      return lines.join('\n')
    },
    onSuccess: (text: string) => setResult(text),
    onError: () => {
      Alert.alert('Error', 'Failed to generate content. Please try again.')
    },
  })

  function handleCopy() {
    if (!result) return
    // Clipboard from react-native is removed in current Expo SDKs; guard so the
    // copy button never crashes when the API is unavailable.
    if (Clipboard?.setString) {
      Clipboard.setString(result)
      Alert.alert('Copied', 'Result copied to clipboard')
    } else {
      Alert.alert('Copy unavailable', 'Select and copy the text manually.')
    }
  }

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <View style={[s.header, { backgroundColor: c.primary }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>AI Writing Assistant</Text>
        <Text style={s.headerSubtitle}>Generate, polish, and improve listings</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabScroll}
        contentContainerStyle={s.tabContent}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, { backgroundColor: activeTab === tab.key ? c.primary : c.card, borderColor: c.border }]}
            onPress={() => { setActiveTab(tab.key); setResult('') }}
          >
            <Ionicons name={tab.icon} size={16} color={activeTab === tab.key ? '#fff' : c.text} />
            <Text style={[s.tabText, { color: activeTab === tab.key ? '#fff' : c.text }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {activeTab === 'listing' && (
            <>
              <Text style={[s.label, { color: c.text }]}>Tone</Text>
              <View style={s.chipRow}>
                {TONES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.chip, { backgroundColor: tone === t.value ? c.primary : c.surface, borderColor: c.border }]}
                    onPress={() => setTone(t.value)}
                  >
                    <Text style={[s.chipText, { color: tone === t.value ? '#fff' : c.textLight }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {activeTab === 'translate' && (
            <>
              <Text style={[s.label, { color: c.text }]}>Target Language</Text>
              <View style={s.chipRow}>
                {LANGUAGES.map((l) => (
                  <TouchableOpacity
                    key={l.value}
                    style={[s.chip, { backgroundColor: language === l.value ? c.primary : c.surface, borderColor: c.border }]}
                    onPress={() => setLanguage(l.value)}
                  >
                    <Text style={[s.chipText, { color: language === l.value ? '#fff' : c.textLight }]}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={[s.label, { color: c.text }]}>
            {activeTab === 'listing' ? 'Property Details' : activeTab === 'formalize' ? 'Informal Text' : activeTab === 'translate' ? 'Text to Translate' : 'Listing Text'}
          </Text>
          <TextInput
            style={[s.input, s.textarea, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
            placeholder={
              activeTab === 'listing' ? '2-bedroom apartment in East Legon, 95sqm, furnished, parking...'
                : activeTab === 'formalize' ? 'Hey bro, got a nice place for rent...'
                : activeTab === 'translate' ? 'Spacious 3-bedroom house with garden...'
                : 'Enter your listing text for quality scoring...'
            }
            placeholderTextColor={c.muted}
            value={input}
            onChangeText={setInput}
            multiline
            numberOfLines={5}
          />

          <TouchableOpacity
            style={[s.generateBtn, { backgroundColor: c.primary }]}
            onPress={() => generate.mutate()}
            disabled={generate.isPending || !input.trim()}
          >
            {generate.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.generateBtnText}>Generate</Text>
            )}
          </TouchableOpacity>
        </View>

        {result ? (
          <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.resultHeader}>
              <Text style={[s.resultTitle, { color: c.text }]}>Result</Text>
              <TouchableOpacity onPress={handleCopy}>
                <Ionicons name="copy-outline" size={18} color={c.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.resultText, { color: c.textLight }]}>{result}</Text>
          </View>
        ) : null}
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
  tabScroll: { marginTop: spacing.md },
  tabContent: { paddingHorizontal: spacing.lg, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  tabText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  scroll: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, fontFamily: 'Manrope_400Regular', marginTop: 4 },
  textarea: { height: 100, textAlignVertical: 'top' },
  generateBtn: { marginTop: spacing.lg, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  generateBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  resultTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  resultText: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 20 },
})
