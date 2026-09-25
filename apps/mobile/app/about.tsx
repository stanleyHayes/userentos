import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard } from '../lib/neu'
import { Logo } from '../components/Logo'
import { LEGAL_URLS, legalEntityName } from '../../../packages/shared/legalVersions'

const features = [
  { icon: 'document-text-outline' as const, title: 'Digital Agreements', desc: 'Tenancy agreements signed electronically' },
  { icon: 'card-outline' as const, title: 'Mobile Payments', desc: 'Pay rent via MTN MoMo, Telecel, AirtelTigo, or bank transfer' },
  { icon: 'wallet-outline' as const, title: 'RentGuard Savings', desc: 'Save towards rent with automated savings plans' },
  { icon: 'shield-checkmark-outline' as const, title: 'Rent-Law Checks', desc: 'Flags agreement terms that may breach the Rent Act, 1963 (Act 220) — information, not legal advice' },
  { icon: 'chatbubbles-outline' as const, title: 'Dispute Resolution', desc: 'File and track rental disputes with mediation support' },
  { icon: 'analytics-outline' as const, title: 'Credit Scoring', desc: 'Build your rental credit score with every on-time payment' },
  { icon: 'scale-outline' as const, title: 'Know Your Rights', desc: 'Plain-language guides to Ghanaian rental law' },
]

export default function AboutScreen() {
  const c = useThemeColors()

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={s.content}>
        {/* Logo + Brand */}
        <View style={s.brandSection}>
          <Logo size={56} variant="mark" theme="dark" />
          <Text style={[s.brandName, { color: c.text }]}>
            Rent<Text style={{ color: '#f59e0b' }}>OS</Text> Ghana
          </Text>
          <Text style={[s.tagline, { color: c.muted }]}>Calm before the storm</Text>
          <View style={[s.versionBadge, { backgroundColor: c.primary + '15' }]}>
            <Text style={[s.versionText, { color: c.primary }]}>Version 1.0.0</Text>
          </View>
        </View>

        {/* Description */}
        <View style={[s.card, neuCard(c)]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Our Mission</Text>
          <Text style={[s.bodyText, { color: c.muted }]}>
            RentOS is a digital platform for renting in Ghana. We're building a transparent, fair and efficient way to rent that helps tenants and landlords understand and follow Ghanaian rental law.
          </Text>
          <Text style={[s.bodyText, { color: c.muted, marginTop: 8 }]}>
            From digital agreements to mobile payments, savings automation to dispute resolution — RentOS covers the rental journey from search to move-out.
          </Text>
        </View>

        {/* Features */}
        <View style={[s.card, neuCard(c)]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Platform Features</Text>
          {features.map((f, i) => (
            <View key={f.title} style={[s.featureRow, i < features.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
              <View style={[s.featureIcon, { backgroundColor: c.primary + '12' }]}>
                <Ionicons name={f.icon} size={18} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.featureTitle, { color: c.text }]}>{f.title}</Text>
                <Text style={[s.featureDesc, { color: c.muted }]}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Links */}
        <View style={[s.card, neuCard(c)]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Legal</Text>
          {[
            { label: 'Terms of Service', url: LEGAL_URLS.terms },
            { label: 'Privacy Policy', url: LEGAL_URLS.privacy },
            { label: 'Data Protection', url: LEGAL_URLS.dataProtection },
          ].map((link, i, arr) => (
            <TouchableOpacity
              key={link.label}
              style={[s.linkRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
              onPress={() => { Linking.openURL(link.url).catch(() => {}) }}
            >
              <Text style={[s.linkText, { color: c.text }]}>{link.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={c.muted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={[s.footerText, { color: c.muted }]}>© {new Date().getFullYear()} {legalEntityName()}</Text>
          <Text style={[s.footerText, { color: c.muted }]}>All rights reserved</Text>
          <Text style={[s.footerTagline, { color: c.border }]}>Made with care for Ghana</Text>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md },

  // Brand
  brandSection: { alignItems: 'center', paddingVertical: spacing.xl },
  brandName: { fontSize: 28, fontFamily: 'Outfit_800ExtraBold', marginTop: spacing.md, letterSpacing: -0.5 },
  tagline: { fontSize: 14, fontFamily: 'Outfit_400Regular', marginTop: 4 },
  versionBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 10, marginTop: spacing.sm },
  versionText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },

  // Card
  card: { padding: spacing.md, marginBottom: spacing.sm },
  cardTitle: { fontSize: 15, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },
  bodyText: { fontSize: 13, fontFamily: 'Outfit_400Regular', lineHeight: 20 },

  // Features
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  featureIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  featureTitle: { fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  featureDesc: { fontSize: 11, fontFamily: 'Outfit_400Regular', marginTop: 2 },

  // Links
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  linkText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },

  // Footer
  footer: { alignItems: 'center', paddingTop: spacing.lg, gap: 4 },
  footerText: { fontSize: 12, fontFamily: 'Outfit_400Regular' },
  footerTagline: { fontSize: 11, fontFamily: 'Outfit_500Medium', marginTop: 8 },
})
