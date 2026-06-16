import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native'
import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { spacing, useThemeColors } from '../lib/theme'

const faqs = [
  { q: 'How do I pay my rent?', a: 'Go to the Payments tab and tap "Make Payment". Select your agreement, enter the amount, choose a payment method (MTN MoMo, Telecel Cash, AirtelTigo Money, or Bank Transfer), and confirm.' },
  { q: 'How does RentGuard savings work?', a: 'RentGuard lets you save towards rent. Create a savings plan with a target amount and contribution frequency. You can also invest in Treasury Bills and Government Bonds, or apply for micro-loans for rent shortfalls.' },
  { q: 'How do I file a dispute?', a: 'Navigate to Disputes from your profile menu and tap "File a Dispute". Provide details about the issue, select a category, and submit. A mediator will review your case.' },
  { q: 'What is my credit score?', a: 'Your Rent Credit Score (0-100) reflects your reliability as a tenant. It\'s based on payment history (40%), savings consistency (20%), agreement compliance (20%), dispute record (10%), and account age (10%).' },
  { q: 'How do I sign a rental agreement?', a: 'Go to Agreements from your profile. Find the agreement with "pending signatures" status and tap "Sign". Both landlord and tenant must sign for the agreement to become active.' },
  { q: 'Can I invest my savings?', a: 'Yes! In the RentGuard section, tap the Investments tab. You can invest in Treasury Bills (91-364 days) or Government Bonds (2-5 years) through our partner institutions.' },
]

const contactOptions = [
  { icon: 'mail-outline' as const, label: 'Email Support', value: 'support@rentos.com.gh', action: () => Linking.openURL('mailto:support@rentos.com.gh') },
  { icon: 'call-outline' as const, label: 'Phone', value: '+233 30 XXX XXXX', action: () => Linking.openURL('tel:+23330XXXXXXX') },
  { icon: 'location-outline' as const, label: 'Office', value: 'Accra, Ghana', action: undefined },
]

export default function HelpScreen() {
  const c = useThemeColors()

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Contact */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Contact Us</Text>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
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
            We typically respond within 24 hours during business days.
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
      style={[styles.faqCard, { backgroundColor: c.card, borderColor: c.border }]}
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
  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', marginBottom: spacing.sm },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  contactRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 12 },
  contactIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  contactLabel: { fontSize: 11, fontFamily: 'Manrope_500Medium' },
  contactValue: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', marginTop: 2 },
  faqCard: { borderRadius: 12, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  faqHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faqQ: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  faqA: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 20, marginTop: spacing.sm },
  responseCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: spacing.md, marginTop: spacing.lg },
  responseText: { fontSize: 13, fontFamily: 'Manrope_500Medium', flex: 1 },
})
