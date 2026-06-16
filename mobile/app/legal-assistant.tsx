import { useState, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

interface Message { role: 'user' | 'assistant'; content: string }

export default function LegalAssistantScreen() {
  const c = useThemeColors()
  const scrollRef = useRef<ScrollView>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function send() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setLoading(true)
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)

    try {
      const data = await api.post<{ reply: string }>('/ai/chat', { messages: updated })
      setMessages([...updated, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages([...updated, { role: 'assistant', content: 'Sorry, I could not process your request. Please try again.' }])
    } finally {
      setLoading(false)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.surface }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {messages.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: c.primary + '10' }]}>
            <Ionicons name="sparkles" size={32} color={c.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: c.primaryDark }]}>AI Legal Assistant</Text>
          <Text style={[s.emptyDesc, { color: c.muted }]}>
            Ask questions about Ghanaian rental law, tenant rights, landlord obligations, and dispute resolution.
          </Text>
          <View style={s.suggestions}>
            {[
              'Can my landlord charge more than 6 months advance?',
              'What notice is required for eviction?',
              'How do I file a dispute with Rent Control?',
            ].map((q) => (
              <TouchableOpacity key={q} style={[s.suggestion, { borderColor: c.border }]} onPress={() => { setInput(q); }}>
                <Text style={[s.suggestionText, { color: c.primary }]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={s.chatArea} contentContainerStyle={s.chatContent}>
          {messages.map((msg, i) => (
            <View key={i} style={[s.bubble, msg.role === 'user' ? [s.userBubble, { backgroundColor: c.primary }] : [s.aiBubble, { backgroundColor: c.white }]]}>
              {msg.role === 'assistant' && (
                <View style={s.aiHeader}>
                  <Ionicons name="sparkles" size={12} color={c.primary} />
                  <Text style={[s.aiLabel, { color: c.primary }]}>AI Assistant</Text>
                </View>
              )}
              <Text style={[s.bubbleText, { color: msg.role === 'user' ? '#fff' : c.text }]}>{msg.content}</Text>
            </View>
          ))}
          {loading && (
            <View style={[s.bubble, s.aiBubble, { backgroundColor: c.white }]}>
              <ActivityIndicator size="small" color={c.primary} />
            </View>
          )}
        </ScrollView>
      )}

      <View style={[s.inputBar, { backgroundColor: c.white, borderColor: c.border }]}>
        <TextInput
          style={[s.textInput, { color: c.text }]}
          placeholder="Ask about rental law..."
          placeholderTextColor={c.muted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
        />
        <TouchableOpacity style={[s.sendBtn, { backgroundColor: input.trim() && !loading ? c.primary : c.border }]} onPress={send} disabled={!input.trim() || loading}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  emptyTitle: { fontSize: 20, fontFamily: 'Manrope_700Bold', marginBottom: spacing.xs },
  emptyDesc: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 300, marginBottom: spacing.lg },
  suggestions: { gap: spacing.sm, width: '100%', maxWidth: 340 },
  suggestion: { borderWidth: 1, borderRadius: 12, padding: 12 },
  suggestionText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  chatArea: { flex: 1 },
  chatContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: 20 },
  bubble: { maxWidth: '85%', borderRadius: 16, padding: 14 },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  aiLabel: { fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  bubbleText: { fontSize: 14, fontFamily: 'Manrope_400Regular', lineHeight: 21 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: spacing.sm, paddingBottom: Platform.OS === 'ios' ? 28 : spacing.sm, borderTopWidth: 1, gap: spacing.sm },
  textInput: { flex: 1, fontSize: 15, fontFamily: 'Manrope_400Regular', maxHeight: 100, paddingVertical: 8, paddingHorizontal: 12 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
})
