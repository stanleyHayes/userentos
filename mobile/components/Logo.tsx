import { View, Text, StyleSheet } from 'react-native'
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg'
import { useThemeColors } from '../lib/theme'

interface LogoProps {
  size?: number
  variant?: 'full' | 'mark'
  theme?: 'light' | 'dark'
}

export function Logo({ size = 32, variant = 'full', theme = 'dark' }: LogoProps) {
  const c = useThemeColors()

  const mark = (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Defs>
        <LinearGradient id="lgMobile" x1="0" y1="0" x2="48" y2="48">
          <Stop stopColor="#1e3a5f" />
          <Stop offset="1" stopColor="#2d5a8e" />
        </LinearGradient>
        <LinearGradient id="rgMobile" x1="10" y1="8" x2="38" y2="20">
          <Stop stopColor="#f59e0b" />
          <Stop offset="1" stopColor="#f97316" />
        </LinearGradient>
      </Defs>
      <Rect width="48" height="48" rx="12" fill={theme === 'dark' ? 'url(#lgMobile)' : 'rgba(255,255,255,0.12)'} />
      <Path d="M10 22L24 8L38 22" stroke="url(#rgMobile)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x="14" y="22" width="20" height="16" rx="2" fill="white" fillOpacity={theme === 'dark' ? '0.9' : '0.85'} />
      <Rect x="20" y="28" width="8" height="10" rx="1.5" fill="#f59e0b" />
      <Circle cx="26" cy="33.5" r="1" fill="#92400e" />
      <Rect x="15.5" y="24" width="4" height="4" rx="1" fill="#1e3a5f" fillOpacity="0.3" />
      <Rect x="28.5" y="24" width="4" height="4" rx="1" fill="#1e3a5f" fillOpacity="0.3" />
      <Path d="M33 14C35 12 37 12 39 14" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <Path d="M35 12C36.5 10.5 38.5 10.5 40 12" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
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
  brand: { fontFamily: 'Manrope_800ExtraBold', letterSpacing: -0.5 },
  sub: { fontFamily: 'Manrope_700Bold', letterSpacing: 2, marginTop: -1 },
})
