import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, type TextInputProps } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

interface AITextInputProps extends TextInputProps {
  /** Label shown above the input */
  label?: string
  /** Context for AI generation (e.g. "property description", "dispute details") */
  aiContext: string
  /** Callback when text changes (receives the raw string) */
  onChangeText: (text: string) => void
  value: string
}

export function AITextInput({ label, aiContext, value, onChangeText, style, ...props }: AITextInputProps) {
  const c = useThemeColors()
  const [loading, setLoading] = useState(false)

  async function handleGenerate() {
    if (!value.trim() || loading) return
    setLoading(true)
    try {
      const result = await api.post<{ text: string }>('/ai/generate', {
        prompt: value.trim(),
        context: aiContext,
      })
      if (result.text) onChangeText(result.text)
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading(false)
    }
  }

  return (
    <View>
      {label && <Text style={[s.label, { color: c.text }]}>{label}</Text>}
      <View style={[s.wrapper, { backgroundColor: c.surface, borderColor: c.border }]}>
        <TextInput
          style={[s.input, { color: c.text }, style]}
          placeholderTextColor={c.muted}
          multiline
          textAlignVertical="top"
          value={value}
          onChangeText={onChangeText}
          {...props}
        />
        <TouchableOpacity
          style={[s.aiBtn, { backgroundColor: c.primary + '18' }]}
          onPress={handleGenerate}
          disabled={!value.trim() || loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size={14} color={c.primary} />
          ) : (
            <Ionicons name="sparkles" size={14} color={c.primary} />
          )}
          <Text style={[s.aiBtnText, { color: c.primary }]}>AI</Text>
        </TouchableOpacity>
      </View>
      <Text style={[s.hint, { color: c.muted }]}>Type a short description and tap AI to expand</Text>
    </View>
  )
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: 6, marginTop: spacing.md },
  wrapper: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  input: { paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 14, fontSize: 14, fontFamily: 'Manrope_500Medium', minHeight: 100 },
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.06)', alignSelf: 'flex-end', borderRadius: 8, margin: 8, marginTop: 0 },
  aiBtnText: { fontSize: 12, fontFamily: 'Manrope_700Bold' },
  hint: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 4 },
})
