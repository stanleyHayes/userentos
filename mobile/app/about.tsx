import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { Logo } from '../components/Logo'

const features = [
  { icon: 'document-text-outline' as const, title: 'Digital Agreements', desc: 'Legally compliant rental contracts with e-signatures' },
  { icon: 'card-outline' as const, title: 'Mobile Payments', desc: 'Pay rent via MTN MoMo, Telecel, AirtelTigo, or bank transfer' },
  { icon: 'wallet-outline' as const, title: 'RentGuard Savings', desc: 'Save towards rent with automated plans and investments' },
  { icon: 'shield-checkmark-outline' as const, title: 'Legal Compliance', desc: 'Built-in compliance with Ghana Rent Control Act (Act 220)' },
  { icon: 'chatbubbles-outline' as const, title: 'Dispute Resolution', desc: 'File and track rental disputes with mediation support' },
  { icon: 'analytics-outline' as const, title: 'Credit Scoring', desc: 'Build your rental credit score with every on-time payment' },
  { icon: 'scale-outline' as const, title: 'Know Your Rights', desc: 'Full legal repository in English, Twi, Ga, and Ewe' },
  { icon: 'trending-up-outline' as const, title: 'Investments', desc: 'Invest in Treasury Bills and Government Bonds' },
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
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Our Mission</Text>
          <Text style={[s.bodyText, { color: c.muted }]}>
            RentOS is Ghana's national digital infrastructure for rental housing. We're building a transparent, fair, and efficient ecosystem that protects both tenants and landlords while ensuring compliance with Ghanaian rental laws.
          </Text>
          <Text style={[s.bodyText, { color: c.muted, marginTop: 8 }]}>
            From digital agreements to mobile payments, savings automation to dispute resolution — RentOS covers the entire rental lifecycle across all 16 regions.
          </Text>
        </View>

        {/* Features */}
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
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

        {/* Stats */}
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Platform Coverage</Text>
          <View style={s.statsRow}>
            <View style={[s.statItem, { backgroundColor: c.surface }]}>
              <Text style={[s.statValue, { color: c.primary }]}>16</Text>
              <Text style={[s.statLabel, { color: c.muted }]}>Regions</Text>
            </View>
            <View style={[s.statItem, { backgroundColor: c.surface }]}>
              <Text style={[s.statValue, { color: c.accent }]}>34K+</Text>
              <Text style={[s.statLabel, { color: c.muted }]}>Users</Text>
            </View>
            <View style={[s.statItem, { backgroundColor: c.surface }]}>
              <Text style={[s.statValue, { color: c.secondary }]}>12K+</Text>
              <Text style={[s.statLabel, { color: c.muted }]}>Properties</Text>
            </View>
          </View>
        </View>

        {/* Links */}
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Legal</Text>
          {[
            { label: 'Terms of Service', url: 'https://rentos.gh/terms' },
            { label: 'Privacy Policy', url: 'https://rentos.gh/privacy' },
            { label: 'Data Protection', url: 'https://rentos.gh/data-protection' },
          ].map((link, i, arr) => (
            <TouchableOpacity
              key={link.label}
              style={[s.linkRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
              onPress={() => Linking.openURL(link.url)}
            >
              <Text style={[s.linkText, { color: c.text }]}>{link.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={c.muted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={[s.footerText, { color: c.muted }]}>© 2026 RentOS Ghana</Text>
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
  brandName: { fontSize: 28, fontFamily: 'Manrope_800ExtraBold', marginTop: spacing.md, letterSpacing: -0.5 },
  tagline: { fontSize: 14, fontFamily: 'Manrope_400Regular', marginTop: 4 },
  versionBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 10, marginTop: spacing.sm },
  versionText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },

  // Card
  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  cardTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold', marginBottom: spacing.sm },
  bodyText: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 20 },

  // Features
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  featureIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  featureTitle: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  featureDesc: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8 },
  statItem: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 20, fontFamily: 'Manrope_800ExtraBold' },
  statLabel: { fontSize: 10, fontFamily: 'Manrope_400Regular', marginTop: 2 },

  // Links
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  linkText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },

  // Footer
  footer: { alignItems: 'center', paddingTop: spacing.lg, gap: 4 },
  footerText: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  footerTagline: { fontSize: 11, fontFamily: 'Manrope_500Medium', marginTop: 8 },
})
