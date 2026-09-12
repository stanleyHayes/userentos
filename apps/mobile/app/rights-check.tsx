import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { api } from '../lib/api'

/**
 * "Am I being abused?" — the rental-law check, on mobile.
 *
 * This existed only on the web landing page, which is the wrong way round:
 * the people most likely to be facing an eviction threat or an illegal rent
 * demand are the ones reaching for a phone, not a laptop.
 *
 * Two things reach the user here that a naive version would not show.
 *
 * The ADVANCE verdict is displayed even when the answer is that the advance
 * is LAWFUL. Telling a worried tenant that three months is within the law is
 * the single most useful thing this feature does, and saying nothing leaves
 * them to infer it from an absence of warnings.
 *
 * And "no violation found" is stated plainly rather than as an empty screen.
 * The model deliberately abstains when it is unsure, so silence here means
 * "we could not identify one", never "you have no case".
 */

interface Violation {
  law: string
  violation: string
  explanation: string
  maxPenalty: string
}

interface AbuseCheckResult {
  isViolation: boolean
  severity: 'high' | 'medium' | 'low' | null
  violations: Violation[]
  advance?: { verdict: 'violation' | 'lawful' | 'unclear'; months?: number; message: string }
  nextSteps: string[]
  contacts: {
    rentControl: { name: string; phone: string; location: string }
    chraj: { name: string; phone: string }
  }
}

const EXAMPLES = [
  'My landlord is asking for two years rent advance',
  'He changed the locks while I was at work',
  'The landlord cut my water because I complained',
  'She refuses to return my deposit',
]

export default function RightsCheckScreen() {
  const c = useThemeColors()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AbuseCheckResult | null>(null)
  const [error, setError] = useState('')

  async function check(text?: string) {
    const q = (text ?? query).trim()
    if (q.length < 5) {
      setError('Please describe your situation in a little more detail.')
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      // Public endpoint — deliberately works without signing in, because
      // someone being pushed out of their home should not have to register
      // first to find out whether it is legal.
      const data = await api.post<AbuseCheckResult>('/ai/abuse-check', { query: q })
      setResult(data)
    } catch (err) {
      setError((err as Error).message || 'Could not check right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const advanceTone = (verdict: string) =>
    verdict === 'violation' ? c.danger : verdict === 'lawful' ? '#16a34a' : c.warning

  const advanceIcon = (verdict: string) =>
    verdict === 'violation' ? 'close-circle' : verdict === 'lawful' ? 'checkmark-circle' : 'alert-circle'

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={[s.card, neuCard(c)]}>
          <Text style={[s.title, { color: c.text }]}>Is this legal?</Text>
          <Text style={[s.subtitle, { color: c.textLight }]}>
            Describe what your landlord is doing. We check it against the Rent Act, 1963
            (Act 220) and tell you what the law says — including when everything is in order.
          </Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. My landlord wants 18 months rent advance before I can move in"
            placeholderTextColor={c.muted}
            multiline
            numberOfLines={4}
            style={[s.input, neuInset(c), { color: c.text }]}
            textAlignVertical="top"
          />

          {error ? <Text style={[s.error, { color: c.danger }]}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.button, { backgroundColor: c.primary, opacity: loading ? 0.6 : 1 }]}
            onPress={() => check()}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.buttonText}>Check my situation</Text>}
          </TouchableOpacity>

          {!result && !loading && (
            <View style={s.examples}>
              <Text style={[s.examplesLabel, { color: c.muted }]}>Or try one of these:</Text>
              {EXAMPLES.map((ex) => (
                <TouchableOpacity key={ex} onPress={() => { setQuery(ex); void check(ex) }}>
                  <Text style={[s.exampleText, { color: c.primary }]}>“{ex}”</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {result && (
          <>
            <View style={[
              s.card,
              neuCard(c),
              { borderLeftWidth: 4, borderLeftColor: result.isViolation ? c.danger : '#16a34a' },
            ]}>
              <View style={s.verdictRow}>
                <Ionicons
                  name={result.isViolation ? 'alert-circle' : 'checkmark-circle'}
                  size={24}
                  color={result.isViolation ? c.danger : '#16a34a'}
                />
                <Text style={[s.verdictTitle, { color: c.text }]}>
                  {result.isViolation ? 'Possible violation found' : 'No clear violation found'}
                </Text>
              </View>
              <Text style={[s.verdictBody, { color: c.textLight }]}>
                {result.isViolation
                  ? `What you described may involve ${result.violations.length} issue${result.violations.length === 1 ? '' : 's'} under Ghanaian rental law.`
                  : 'We could not identify a clear breach from what you described. That is not legal advice — if something still feels wrong, Rent Control will look at it for free.'}
              </Text>
            </View>

            {result.advance && (
              <View style={[
                s.card,
                neuCard(c),
                { borderLeftWidth: 4, borderLeftColor: advanceTone(result.advance.verdict) },
              ]}>
                <View style={s.verdictRow}>
                  <Ionicons
                    name={advanceIcon(result.advance.verdict)}
                    size={20}
                    color={advanceTone(result.advance.verdict)}
                  />
                  <Text style={[s.sectionTitle, { color: c.text }]}>Rent advance</Text>
                </View>
                <Text style={[s.verdictBody, { color: c.textLight }]}>
                  {result.advance.message}
                </Text>
              </View>
            )}

            {result.violations.map((v, i) => (
              <View key={i} style={[s.card, neuCard(c)]}>
                <Text style={[s.sectionTitle, { color: c.text }]}>{v.violation}</Text>
                <Text style={[s.lawRef, { color: c.primary }]}>{v.law}</Text>
                <Text style={[s.verdictBody, { color: c.textLight }]}>{v.explanation}</Text>
                <View style={[s.penalty, neuInset(c)]}>
                  <Text style={[s.penaltyLabel, { color: c.muted }]}>Maximum penalty</Text>
                  <Text style={[s.penaltyText, { color: c.text }]}>{v.maxPenalty}</Text>
                </View>
              </View>
            ))}

            <View style={[s.card, neuCard(c)]}>
              <Text style={[s.sectionTitle, { color: c.text }]}>What to do next</Text>
              {result.nextSteps.map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <Text style={[s.stepNumber, { color: c.primary }]}>{i + 1}</Text>
                  <Text style={[s.stepText, { color: c.textLight }]}>{step}</Text>
                </View>
              ))}
            </View>

            <View style={[s.card, neuCard(c)]}>
              <Text style={[s.sectionTitle, { color: c.text }]}>Free help</Text>
              <TouchableOpacity
                style={s.contactRow}
                onPress={() => void Linking.openURL(`tel:${result.contacts.rentControl.phone}`)}
              >
                <Ionicons name="call" size={18} color={c.primary} />
                <View style={s.contactBody}>
                  <Text style={[s.contactName, { color: c.text }]}>{result.contacts.rentControl.name}</Text>
                  <Text style={[s.contactDetail, { color: c.textLight }]}>{result.contacts.rentControl.phone}</Text>
                  <Text style={[s.contactDetail, { color: c.muted }]}>{result.contacts.rentControl.location}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.contactRow}
                onPress={() => void Linking.openURL(`tel:${result.contacts.chraj.phone}`)}
              >
                <Ionicons name="call" size={18} color={c.primary} />
                <View style={s.contactBody}>
                  <Text style={[s.contactName, { color: c.text }]}>{result.contacts.chraj.name}</Text>
                  <Text style={[s.contactDetail, { color: c.textLight }]}>{result.contacts.chraj.phone}</Text>
                </View>
              </TouchableOpacity>
            </View>

            <Text style={[s.disclaimer, { color: c.muted }]}>
              This is general information about Ghanaian rental law, not legal advice on your
              specific case. Rent Control and CHRAJ both advise tenants free of charge.
            </Text>

            <TouchableOpacity
              style={[s.button, { backgroundColor: c.primary }]}
              onPress={() => { setResult(null); setQuery('') }}
            >
              <Text style={s.buttonText}>Check another situation</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  card: { padding: spacing.lg, borderRadius: 20 },
  title: { fontSize: 22, fontFamily: 'Outfit_800ExtraBold', marginBottom: 4 },
  subtitle: { fontSize: 13, fontFamily: 'Outfit_400Regular', lineHeight: 19, marginBottom: spacing.md },
  input: {
    minHeight: 110, borderRadius: 14, padding: spacing.md,
    fontSize: 14, fontFamily: 'Outfit_400Regular',
  },
  error: { fontSize: 12, fontFamily: 'Outfit_500Medium', marginTop: spacing.sm },
  button: {
    marginTop: spacing.md, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_700Bold' },
  examples: { marginTop: spacing.lg, gap: 6 },
  examplesLabel: { fontSize: 12, fontFamily: 'Outfit_500Medium', marginBottom: 2 },
  exampleText: { fontSize: 13, fontFamily: 'Outfit_400Regular', lineHeight: 20 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  verdictTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', flex: 1 },
  verdictBody: { fontSize: 13, fontFamily: 'Outfit_400Regular', lineHeight: 20 },
  sectionTitle: { fontSize: 15, fontFamily: 'Outfit_700Bold', marginBottom: 4 },
  lawRef: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', marginBottom: 6 },
  penalty: { marginTop: spacing.md, padding: spacing.md, borderRadius: 12 },
  penaltyLabel: { fontSize: 11, fontFamily: 'Outfit_500Medium', marginBottom: 2 },
  penaltyText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  stepRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  stepNumber: { fontSize: 13, fontFamily: 'Outfit_700Bold', width: 16 },
  stepText: { flex: 1, fontSize: 13, fontFamily: 'Outfit_400Regular', lineHeight: 20 },
  contactRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', marginTop: spacing.md },
  contactBody: { flex: 1 },
  contactName: { fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
  contactDetail: { fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 1 },
  disclaimer: { fontSize: 11, fontFamily: 'Outfit_400Regular', lineHeight: 17, paddingHorizontal: spacing.sm },
})
