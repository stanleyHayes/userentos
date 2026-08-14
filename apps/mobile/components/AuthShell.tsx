import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Logo } from './Logo'
import { MotionReveal } from './Motion'
import { neuCard } from '../lib/neu'
import { spacing, useIsDark, useThemeColors, type ThemeColors } from '../lib/theme'

type IconName = keyof typeof Ionicons.glyphMap

interface AuthShellProps {
  children: ReactNode
  eyebrow: string
  title: string
  subtitle: string
  formEyebrow: string
  formTitle: string
  formSubtitle: string
  icon?: IconName
}

const TRUST_POINTS: { icon: IconName; label: string }[] = [
  { icon: 'shield-checkmark-outline', label: 'Verified identities' },
  { icon: 'key-outline', label: 'Secure access' },
  { icon: 'home-outline', label: 'One housing workspace' },
]

export function AuthShell({
  children,
  eyebrow,
  title,
  subtitle,
  formEyebrow,
  formTitle,
  formSubtitle,
  icon = 'sparkles-outline',
}: AuthShellProps) {
  const c = useThemeColors()
  const dark = useIsDark()
  const { width } = useWindowDimensions()
  const wide = Platform.OS === 'web' && width >= 860

  return (
    <KeyboardAvoidingView
      testID="auth-shell"
      accessibilityLabel="RentOS authentication"
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={dark ? ['#07111f', '#0f172a', '#111827'] : ['#e8eef5', '#f8fafc', '#edf3f8']}
        style={styles.fill}
      >
        <WatermarkLayer dark={dark} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
        >
          <MotionReveal style={[styles.frame, wide && styles.frameWide]} distance={16}>
            <LinearGradient
              testID="auth-hero"
              accessibilityLabel="RentOS Ghana housing workspace"
              colors={dark ? ['#0b1c30', '#102943', '#163754'] : ['#0f1f33', '#1e3a5f', '#2d5a8e']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, wide ? styles.heroWide : styles.heroCompact]}
            >
              <View style={styles.heroGlow} />
              <View style={styles.heroHome}>
                <Ionicons name="home-outline" size={wide ? 240 : 138} color="rgba(255,255,255,0.055)" />
              </View>
              <Logo size={wide ? 48 : 42} theme="light" />
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>{eyebrow}</Text>
                <Text style={[styles.heroTitle, wide && styles.heroTitleWide]}>{title}</Text>
                <Text style={styles.heroSubtitle}>{subtitle}</Text>
              </View>
              <View style={[styles.trustRow, !wide && styles.trustRowCompact]}>
                {TRUST_POINTS.map((point) => (
                  <View key={point.label} style={styles.trustItem}>
                    <View style={styles.trustIcon}>
                      <Ionicons name={point.icon} size={15} color="#fbbf24" />
                    </View>
                    <Text style={styles.trustLabel}>{point.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.heroFoot}>RENTOS GHANA · HOUSING, CONNECTED</Text>
            </LinearGradient>

            <View
              testID="auth-form-card"
              accessibilityLabel={formTitle}
              style={[
                styles.formCard,
                neuCard(c, 24),
                { backgroundColor: dark ? 'rgba(30,41,59,0.97)' : 'rgba(255,255,255,0.96)' },
                wide ? styles.formCardWide : styles.formCardCompact,
              ]}
            >
              <View style={[styles.formIcon, { backgroundColor: c.secondary + '18' }]}>
                <Ionicons name={icon} size={21} color={c.secondary} />
              </View>
              <Text style={[styles.formEyebrow, { color: dark ? '#7dd3fc' : c.primary }]}>{formEyebrow}</Text>
              <Text style={[styles.formTitle, { color: c.text }]}>{formTitle}</Text>
              <Text style={[styles.formSubtitle, { color: c.muted }]}>{formSubtitle}</Text>
              <View style={styles.formBody}>{children}</View>
            </View>
          </MotionReveal>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  )
}

export function authInset(c: ThemeColors) {
  const dark = c.card !== '#ffffff'
  return {
    backgroundColor: dark ? 'rgba(2,6,23,0.44)' : '#eaf0f6',
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,31,51,0.11)',
    shadowColor: '#0f1f33',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: dark ? 0.28 : 0.055,
    shadowRadius: 3,
  } as const
}

function WatermarkLayer({ dark }: { dark: boolean }) {
  const color = dark ? 'rgba(125,211,252,0.045)' : 'rgba(30,58,95,0.055)'
  return (
    <View
      testID="auth-watermarks"
      accessibilityLabel="RentOS housing security watermarks"
      pointerEvents="none"
      style={styles.watermarkLayer}
    >
      <View style={styles.watermarkTop}><Ionicons name="key-outline" size={180} color={color} /></View>
      <View style={styles.watermarkBottom}><Ionicons name="business-outline" size={220} color={color} /></View>
      <View style={styles.watermarkMiddle}><Ionicons name="shield-checkmark-outline" size={110} color={color} /></View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.md, paddingTop: 18, paddingBottom: 36 },
  scrollWide: { justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: 36 },
  frame: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  frameWide: { flexDirection: 'row', alignItems: 'stretch', gap: 24 },
  hero: { position: 'relative', overflow: 'hidden', borderRadius: 28, padding: spacing.lg },
  heroWide: { flex: 1.1, minHeight: 680, padding: 42, justifyContent: 'space-between' },
  heroCompact: { minHeight: 284, paddingTop: 26, paddingBottom: 48 },
  heroGlow: {
    position: 'absolute',
    top: -100,
    right: -110,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  heroHome: { position: 'absolute', right: -30, bottom: -32 },
  heroCopy: { marginTop: 34, maxWidth: 520 },
  eyebrow: {
    color: '#fbbf24',
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    letterSpacing: 2.1,
    marginBottom: 10,
  },
  heroTitle: {
    color: '#ffffff',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1,
    maxWidth: 420,
  },
  heroTitleWide: { fontSize: 48, lineHeight: 51, letterSpacing: -1.8 },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
    maxWidth: 430,
  },
  trustRow: { gap: 10, marginTop: 30 },
  trustRowCompact: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 22 },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 150 },
  trustIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  trustLabel: { color: 'rgba(255,255,255,0.78)', fontFamily: 'Outfit_600SemiBold', fontSize: 11 },
  heroFoot: {
    color: 'rgba(255,255,255,0.33)',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 8,
    letterSpacing: 1.7,
    marginTop: 24,
  },
  formCard: {
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#07111f',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 9,
  },
  formCardWide: { flex: 0.9, maxWidth: 520, alignSelf: 'center', padding: 36 },
  formCardCompact: { marginTop: -30, marginHorizontal: 10 },
  formIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  formEyebrow: { fontFamily: 'Outfit_700Bold', fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase' },
  formTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: 28, lineHeight: 32, letterSpacing: -0.8, marginTop: 6 },
  formSubtitle: { fontFamily: 'Outfit_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 },
  formBody: { marginTop: 22 },
  watermarkTop: { position: 'absolute', top: 34, right: -52, transform: [{ rotate: '-18deg' }] },
  watermarkBottom: { position: 'absolute', bottom: -62, left: -45, transform: [{ rotate: '8deg' }] },
  watermarkMiddle: { position: 'absolute', top: '46%', left: '42%', transform: [{ rotate: '12deg' }] },
  watermarkLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
})
