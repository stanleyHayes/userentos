import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native'
import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { spacing, useThemeColors } from '../lib/theme'
import { neuCard } from '../lib/neu'
import { LEGAL_ENTITY } from '../../../packages/shared/legalVersions'

const faqs = [
  { q: 'How do I pay my rent?', a: 'Go to the Payments tab and tap "Make Payment". Select your agreement, enter the amount, choose a payment method (MTN MoMo, Telecel Cash, AirtelTigo Money, or Bank Transfer), and confirm.' },
  { q: 'How does RentGuard savings work?', a: 'RentGuard lets you save towards rent. Create a savings plan with a target amount and contribution frequency. Investment and micro-loan products appear only where a licensed partner provides them.' },
  { q: 'How do I file a dispute?', a: 'Navigate to Disputes from your profile menu and tap "File a Dispute". Provide details about the issue, select a category, and submit. The other party is notified, and the case can move to mediation if you cannot agree.' },
  { q: 'What is my credit score?', a: 'Your Rent Credit Score (0-100) reflects your reliability as a tenant. It\'s based on payment history (40%), savings consistency (20%), agreement compliance (20%), dispute record (10%), and account age (10%).' },
  { q: 'How do I sign a rental agreement?', a: 'Go to Agreements from your profile. Find the agreement with "pending signatures" status and tap "Sign". Both landlord and tenant must sign for the agreement to become active.' },
  { q: 'Can I invest my savings?', a: 'Investments are only offered where a partner licensed for them provides the product, under that partner\'s terms. RentOS does not give investment advice or guarantee returns. If you do not see an investment option, it is not available to you yet.' },
]

// No phone line is published until a staffed number exists — email only.
const contactOptions = [
  { icon: 'mail-outline' as const, label: 'Email Support', value: LEGAL_ENTITY.supportEmail, action: () => { Linking.openURL(`mailto:${LEGAL_ENTITY.supportEmail}`).catch(() => {}) } },
  { icon: 'location-outline' as const, label: 'Location', value: LEGAL_ENTITY.location, action: undefined },
]

export default function HelpScreen() {
  const c = useThemeColors()

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Contact */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Contact Us</Text>
        <View style={[styles.card, neuCard(c)]}>
          {contactOptions.map((opt, i) => (
            <TouchableOpacity
              key={opt.label}
              style={[styles.contactRow, i < contactOptions.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
              onPress={opt.action}
              disabled={!opt.action}
            >
              <View style={[styles.contactIcon, { backgroundColor: c.primary + '15' }]}>
                <Ionicons name={opt.icon} size={18} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactLabel, { color: c.muted }]}>{opt.label}</Text>
                <Text style={[styles.contactValue, { color: c.text }]}>{opt.value}</Text>
              </View>
              {opt.action && <Ionicons name="open-outline" size={16} color={c.muted} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* FAQs */}
        <Text style={[styles.sectionTitle, { color: c.text, marginTop: spacing.lg }]}>Frequently Asked Questions</Text>
        {faqs.map((faq, i) => (
          <FAQItem key={i} question={faq.q} answer={faq.a} />
        ))}

        {/* Response time */}
        <View style={[styles.responseCard, { backgroundColor: c.primary + '10', borderColor: c.primary + '30' }]}>
          <Ionicons name="time-outline" size={20} color={c.primary} />
          <Text style={[styles.responseText, { color: c.text }]}>
            Email {LEGAL_ENTITY.supportEmail} and we will reply by email. To report abusive content or a user, use Report in the chat or email us.
          </Text>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const c = useThemeColors()
  const [open, setOpen] = useState(false)

  return (
    <TouchableOpacity
      style={[styles.faqCard, neuCard(c)]}
      onPress={() => setOpen(!open)}
      activeOpacity={0.7}
    >
      <View style={styles.faqHeader}>
        <Text style={[styles.faqQ, { color: c.text, flex: 1 }]}>{question}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
      </View>
      {open && <Text style={[styles.faqA, { color: c.muted }]}>{answer}</Text>}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },
  card: { overflow: 'hidden' },
  contactRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 12 },
  contactIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  contactLabel: { fontSize: 11, fontFamily: 'Outfit_500Medium' },
  contactValue: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', marginTop: 2 },
  faqCard: { padding: spacing.md, marginBottom: spacing.sm },
  faqHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faqQ: { fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
  faqA: { fontSize: 13, fontFamily: 'Outfit_400Regular', lineHeight: 20, marginTop: spacing.sm },
  responseCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: spacing.md, marginTop: spacing.lg },
  responseText: { fontSize: 13, fontFamily: 'Outfit_500Medium', flex: 1 },
})
