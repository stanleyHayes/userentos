import { View, Text, StyleSheet } from 'react-native'
import { useId } from 'react'
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle, G, Line } from 'react-native-svg'
import { useThemeColors } from '../lib/theme'

interface LogoProps {
  size?: number
  variant?: 'full' | 'mark'
  theme?: 'light' | 'dark'
}

export function Logo({ size = 32, variant = 'full', theme = 'dark' }: LogoProps) {
  const c = useThemeColors()

  // Same mark as apps/web/src/components/ui/Logo.tsx (minus its blur glow, which
  // react-native-svg does not render consistently). Ids are per instance so two
  // logos on one screen don't share gradient definitions on web.
  const id = `logo-${theme}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const dark = theme === 'dark'
  const mark = (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Defs>
        <LinearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#0f1f33" />
          <Stop offset="0.5" stopColor="#1e3a5f" />
          <Stop offset="1" stopColor="#2d5a8e" />
        </LinearGradient>
        <LinearGradient id={`${id}-gold`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#fbbf24" />
          <Stop offset="1" stopColor="#f59e0b" />
        </LinearGradient>
        <LinearGradient id={`${id}-green`} x1="20" y1="40" x2="44" y2="56" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#10b981" />
          <Stop offset="1" stopColor="#059669" />
        </LinearGradient>
      </Defs>
      <Rect width="64" height="64" rx="16" fill={dark ? `url(#${id}-bg)` : 'rgba(255,255,255,0.12)'} />
      <G opacity={0.08} stroke="white" strokeWidth={0.5}>
        <Line x1="16" y1="0" x2="16" y2="64" /><Line x1="32" y1="0" x2="32" y2="64" /><Line x1="48" y1="0" x2="48" y2="64" />
        <Line x1="0" y1="16" x2="64" y2="16" /><Line x1="0" y1="32" x2="64" y2="32" /><Line x1="0" y1="48" x2="64" y2="48" />
      </G>
      <G opacity={0.15} fill="white">
        <Circle cx="16" cy="16" r="1.2" /><Circle cx="48" cy="16" r="1.2" /><Circle cx="16" cy="48" r="1.2" /><Circle cx="48" cy="48" r="1.2" />
      </G>
      <Path d="M8 30L32 8L56 30" stroke="black" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.15} />
      <Path d="M8 30L32 8L56 30" stroke={`url(#${id}-gold)`} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M16 28L32 14L48 28" stroke="white" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.2} />
      <Rect x="14" y="30" width="36" height="24" rx="2" fill="white" fillOpacity={dark ? 0.92 : 0.85} />
      <Line x1="14" y1="36" x2="50" y2="36" stroke="#1e3a5f" strokeWidth={0.5} opacity={0.1} />
      <Line x1="14" y1="42" x2="50" y2="42" stroke="#1e3a5f" strokeWidth={0.5} opacity={0.1} />
      <Rect x="17" y="32" width="5" height="5" rx="1" fill="#1e3a5f" fillOpacity={0.25} />
      <Rect x="17" y="38.5" width="5" height="5" rx="1" fill="#1e3a5f" fillOpacity={0.2} />
      <Line x1="19.5" y1="32" x2="19.5" y2="37" stroke="white" strokeWidth={0.5} opacity={0.5} />
      <Line x1="17" y1="34.5" x2="22" y2="34.5" stroke="white" strokeWidth={0.5} opacity={0.5} />
      <Rect x="42" y="32" width="5" height="5" rx="1" fill="#1e3a5f" fillOpacity={0.25} />
      <Rect x="42" y="38.5" width="5" height="5" rx="1" fill="#1e3a5f" fillOpacity={0.2} />
      <Line x1="44.5" y1="32" x2="44.5" y2="37" stroke="white" strokeWidth={0.5} opacity={0.5} />
      <Line x1="42" y1="34.5" x2="47" y2="34.5" stroke="white" strokeWidth={0.5} opacity={0.5} />
      <Rect x="26" y="37" width="12" height="17" rx="2" fill={`url(#${id}-gold)`} />
      <Path d="M26 39C26 37.343 27.343 36 29 36H35C36.657 36 38 37.343 38 39V37H26V39Z" fill="#fbbf24" opacity={0.5} />
      <Circle cx="35" cy="46" r="1.2" fill="#92400e" />
      <Rect x="28" y="39" width="3.5" height="5" rx="0.5" fill="#f59e0b" opacity={0.5} />
      <Rect x="32.5" y="39" width="3.5" height="5" rx="0.5" fill="#f59e0b" opacity={0.5} />
      <Rect x="42" y="12" width="6" height="18" rx="1.5" fill={dark ? '#1a2d47' : '#e2e8f0'} />
      <Rect x="41" y="11" width="8" height="3" rx="1" fill={dark ? '#1a2d47' : '#e2e8f0'} />
      <Circle cx="45" cy="8" r="2" fill="white" opacity={0.12} />
      <Circle cx="47" cy="5" r="1.5" fill="white" opacity={0.08} />
      <Circle cx="44" cy="3" r="1" fill="white" opacity={0.05} />
      <Path d="M32 22L33.2 25.2L36.6 25.2L33.9 27.2L34.8 30.4L32 28.4L29.2 30.4L30.1 27.2L27.4 25.2L30.8 25.2Z" fill={`url(#${id}-gold)`} opacity={0.85} />
      <G stroke={`url(#${id}-green)`} strokeWidth={1} opacity={0.6}>
        <Path d="M14 44H8" strokeLinecap="round" />
        <Circle cx="7" cy="44" r="1.5" fill="#10b981" opacity={0.8} />
        <Path d="M50 44H56" strokeLinecap="round" />
        <Circle cx="57" cy="44" r="1.5" fill="#10b981" opacity={0.8} />
        <Path d="M50 38H54" strokeLinecap="round" />
        <Circle cx="55" cy="38" r="1" fill="#10b981" opacity={0.6} />
        <Path d="M14 38H10" strokeLinecap="round" />
        <Circle cx="9" cy="38" r="1" fill="#10b981" opacity={0.6} />
      </G>
      <Rect x="12" y="54" width="40" height="3" rx="1.5" fill={`url(#${id}-green)`} opacity={0.7} />
      <Rect x="18" y="57" width="28" height="1.5" rx="0.75" fill={`url(#${id}-green)`} opacity={0.3} />
    </Svg>
  )

  if (variant === 'mark') return mark

  return (
    <View style={styles.container}>
      {mark}
      <View style={styles.textWrap}>
        <Text style={[styles.brand, { fontSize: size * 0.56, color: theme === 'dark' ? c.primaryDark : '#fff' }]}>
          Rent<Text style={{ color: c.secondary }}>OS</Text>
        </Text>
        <Text style={[styles.sub, { fontSize: size * 0.25, color: theme === 'dark' ? c.muted : 'rgba(255,255,255,0.45)' }]}>
          GHANA
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textWrap: { justifyContent: 'center' },
  brand: { fontFamily: 'Outfit_800ExtraBold', letterSpacing: -0.5 },
  sub: { fontFamily: 'Outfit_700Bold', letterSpacing: 2, marginTop: -1 },
})
