import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import { Logo } from './Logo'

interface SplashScreenProps {
  onFinished: () => void
}

// Mirrors the web splash (apps/web/src/components/ui/SplashScreen.tsx): same
// palette, circuit grid, ring bursts, letter reveal and timeline, so the app
// opens the same way on every platform.
const NAVY = '#0a1628'
const BLUE = '#1e3a5f'
const AMBER = '#f59e0b'
const EMERALD = '#10b981'
const LOGO_AT = 300
const TEXT_AT = 900
const RING_AT = 1400
const FADE_AT = 2400
const FINISH_AT = 2900

const NODES = [
  { x: '24%', y: '24%', d: 200 }, { x: '76%', y: '24%', d: 350 },
  { x: '18%', y: '50%', d: 500 }, { x: '82%', y: '50%', d: 450 },
  { x: '24%', y: '76%', d: 600 }, { x: '76%', y: '76%', d: 550 },
  { x: '50%', y: '16%', d: 300 }, { x: '50%', y: '84%', d: 700 },
] as const
const LETTERS = [
  { ch: 'R', d: 0 }, { ch: 'e', d: 40 }, { ch: 'n', d: 80 }, { ch: 't', d: 120 },
  { ch: 'O', d: 200, accent: true }, { ch: 'S', d: 260, accent: true },
]
const native = true

const value = (start: number) => new Animated.Value(start)
const timing = (v: Animated.Value, toValue: number, duration: number, delay = 0, easing = Easing.out(Easing.ease)) =>
  Animated.timing(v, { toValue, duration, delay, easing, useNativeDriver: native })

export function AnimatedSplashScreen({ onFinished }: SplashScreenProps) {
  const a = useRef({
    container: value(1), grid: value(0), glow: value(0), logo: value(0), ring1: value(0), ring2: value(0),
    text: value(0), underline: value(0), country: value(0), tagline: value(0), bar: value(0),
    spinRing: value(0), spin: value(0), halo: value(0), slide: value(0),
    letters: LETTERS.map(() => value(0)), nodes: NODES.map(() => value(0)),
  }).current

  useEffect(() => {
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const loops: Animated.CompositeAnimation[] = []
    const at = (ms: number, run: () => void) => { timers.push(setTimeout(() => { if (!cancelled) run() }, ms)) }
    const loop = (animation: Animated.CompositeAnimation) => { loops.push(animation); animation.start() }

    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduceMotion) => {
      if (cancelled) return
      if (reduceMotion) {
        // Same content without movement: show the final state, then fade.
        for (const v of [a.grid, a.glow, a.logo, a.text, a.underline, a.country, a.tagline, a.bar, a.spinRing, ...a.letters]) v.setValue(1)
        for (const v of a.nodes) v.setValue(0.4)
      } else {
        timing(a.grid, 1, 800).start()
        NODES.forEach((node, i) => at(node.d, () => {
          Animated.sequence([timing(a.nodes[i], 0.8, 360), timing(a.nodes[i], 0.4, 240)]).start(() => {
            if (!cancelled) loop(Animated.loop(Animated.sequence([timing(a.nodes[i], 0.6, 1000, 0, Easing.inOut(Easing.ease)), timing(a.nodes[i], 0.2, 1000, 0, Easing.inOut(Easing.ease))])))
          })
        }))
        at(LOGO_AT, () => {
          timing(a.glow, 1, 1000).start()
          timing(a.logo, 1, 600, 0, Easing.bezier(0.34, 1.56, 0.64, 1)).start()
          timing(a.ring1, 1, 1000).start()
        })
        at(TEXT_AT, () => {
          timing(a.text, 1, 700).start()
          timing(a.ring2, 1, 1200).start()
          LETTERS.forEach((letter, i) => timing(a.letters[i], 1, 400, letter.d).start())
          timing(a.underline, 1, 600, 500).start()
          timing(a.country, 0.6, 500, 200).start()
          timing(a.bar, 1, 500).start()
          loop(Animated.loop(timing(a.slide, 1, 1500, 0, Easing.inOut(Easing.ease))))
        })
        at(RING_AT, () => {
          timing(a.spinRing, 1, 500).start()
          timing(a.tagline, 0.4, 500, 300).start()
          loop(Animated.loop(timing(a.spin, 1, 20000, 0, Easing.linear)))
          loop(Animated.loop(Animated.sequence([timing(a.halo, 1, 1000, 0, Easing.inOut(Easing.ease)), timing(a.halo, 0, 1000, 0, Easing.inOut(Easing.ease))])))
        })
      }
      at(FADE_AT, () => timing(a.container, 0, 500).start())
      at(FINISH_AT, onFinished)
    })
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      loops.forEach((animation) => animation.stop())
    }
  }, [a, onFinished])

  const ringBurst = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 0.8, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 4] }) }],
  })

  return (
    <Animated.View style={[styles.container, { opacity: a.container }]} accessibilityLabel="RentOS Ghana, loading">
      {/* Circuit grid */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: a.grid }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <SvgLinearGradient id="splashLineH" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={BLUE} stopOpacity="0" />
              <Stop offset="0.3" stopColor={BLUE} stopOpacity="0.15" />
              <Stop offset="0.7" stopColor={BLUE} stopOpacity="0.15" />
              <Stop offset="1" stopColor={BLUE} stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="splashLineV" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={BLUE} stopOpacity="0" />
              <Stop offset="0.3" stopColor={BLUE} stopOpacity="0.15" />
              <Stop offset="0.7" stopColor={BLUE} stopOpacity="0.15" />
              <Stop offset="1" stopColor={BLUE} stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          {Array.from({ length: 12 }, (_, i) => (
            <Line key={`h${i}`} x1="0%" y1={`${(i + 1) * 8}%`} x2="100%" y2={`${(i + 1) * 8}%`} stroke="url(#splashLineH)" strokeWidth={0.5} />
          ))}
          {Array.from({ length: 16 }, (_, i) => (
            <Line key={`v${i}`} x1={`${(i + 1) * 6}%`} y1="0%" x2={`${(i + 1) * 6}%`} y2="100%" stroke="url(#splashLineV)" strokeWidth={0.5} />
          ))}
        </Svg>
      </Animated.View>

      {/* Glowing circuit nodes */}
      {NODES.map((node, i) => (
        <Animated.View key={`node${i}`} pointerEvents="none" style={[styles.node, { left: node.x, top: node.y, opacity: a.nodes[i] }]} />
      ))}

      {/* Radial glow */}
      <Animated.View pointerEvents="none" style={[styles.glow, { opacity: a.glow, transform: [{ scale: a.glow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
        <Svg width="100%" height="100%" viewBox="0 0 500 500">
          <Defs>
            <RadialGradient id="splashGlowBlue" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={BLUE} stopOpacity="0.35" />
              <Stop offset="1" stopColor={BLUE} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="splashGlowAmber" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={AMBER} stopOpacity="0.12" />
              <Stop offset="1" stopColor={AMBER} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="250" cy="250" r="250" fill="url(#splashGlowBlue)" />
          <Circle cx="250" cy="250" r="120" fill="url(#splashGlowAmber)" />
        </Svg>
      </Animated.View>

      {/* Kente-inspired corner accents */}
      <KenteCorner style={styles.cornerTopLeft} />
      <KenteCorner style={[styles.cornerBottomRight, { transform: [{ rotate: '180deg' }] }]} />

      {/* Ring bursts on logo and text arrival */}
      <View style={styles.center} pointerEvents="none">
        <Animated.View style={[styles.ring, { borderWidth: 2, borderColor: 'rgba(245,158,11,0.3)' }, ringBurst(a.ring1)]} />
        <Animated.View style={[styles.ring, { borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' }, ringBurst(a.ring2)]} />
      </View>

      {/* Logo entrance, spinning ring and pulsing halo */}
      <Animated.View style={{
        opacity: a.logo.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
        transform: [
          { scale: a.logo },
          { rotate: a.logo.interpolate({ inputRange: [0, 0.6, 1], outputRange: ['-10deg', '2deg', '0deg'] }) },
        ],
      }}>
        <Animated.View pointerEvents="none" style={[styles.halo, {
          opacity: a.halo,
          transform: [{ scale: a.halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
        }]} />
        <Animated.View pointerEvents="none" style={[styles.spinRing, {
          opacity: a.spinRing,
          transform: [{ rotate: a.spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }]}>
          <Svg width="100%" height="100%" viewBox="0 0 120 120">
            <Circle cx="60" cy="60" r="56" fill="none" stroke={AMBER} strokeWidth={0.5} strokeDasharray="8 12" opacity={0.3} />
            <Circle cx="60" cy="60" r="52" fill="none" stroke={EMERALD} strokeWidth={0.3} strokeDasharray="4 16" opacity={0.2} />
          </Svg>
        </Animated.View>
        <Logo size={80} variant="mark" theme="dark" />
      </Animated.View>

      {/* Wordmark, underline, country and tagline */}
      <Animated.View style={[styles.textBlock, {
        opacity: a.text,
        transform: [{ translateY: a.text.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }]}>
        <View style={styles.wordmark}>
          {LETTERS.map((letter, i) => (
            <Animated.Text key={letter.ch + i} style={[styles.letter, letter.accent && { color: AMBER }, {
              opacity: a.letters[i],
              transform: [
                { translateY: a.letters[i].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                { scale: a.letters[i].interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
              ],
            }]}>{letter.ch}</Animated.Text>
          ))}
        </View>
        <Animated.View style={[styles.underline, { transform: [{ scaleX: a.underline }] }]}>
          <LinearGradient colors={['transparent', AMBER, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.Text style={[styles.country, { opacity: a.country }]}>GHANA</Animated.Text>
        <Animated.Text style={[styles.tagline, { opacity: a.tagline }]}>The Operating System of Rent</Animated.Text>
      </Animated.View>

      {/* Loading bar */}
      <Animated.View style={[styles.barTrack, { opacity: a.bar }]}>
        <Animated.View style={[styles.bar, { transform: [{ translateX: a.slide.interpolate({ inputRange: [0, 1], outputRange: [-128, 128] }) }] }]}>
          <LinearGradient colors={[BLUE, AMBER, EMERALD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  )
}

function KenteCorner({ style }: { style: object }) {
  return (
    <View pointerEvents="none" style={[styles.corner, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Rect x="0" y="0" width="12" height="100" fill={AMBER} />
        <Rect x="16" y="0" width="6" height="100" fill={EMERALD} />
        <Rect x="0" y="0" width="100" height="12" fill={AMBER} />
        <Rect x="0" y="16" width="100" height="6" fill={EMERALD} />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: NAVY, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  node: { position: 'absolute', width: 4, height: 4, marginLeft: -2, marginTop: -2, borderRadius: 2, backgroundColor: AMBER },
  glow: { position: 'absolute', width: 500, height: 500 },
  corner: { position: 'absolute', width: 128, height: 128, opacity: 0.06 },
  cornerTopLeft: { top: 0, left: 0 },
  cornerBottomRight: { bottom: 0, right: 0 },
  center: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  ring: { position: 'absolute', width: 96, height: 96, borderRadius: 48 },
  halo: { position: 'absolute', top: -16, left: -16, right: -16, bottom: -16, borderRadius: 16, backgroundColor: 'rgba(245,158,11,0.05)' },
  spinRing: { position: 'absolute', top: -24, left: -24, right: -24, bottom: -24 },
  textBlock: { marginTop: 32, alignItems: 'center' },
  wordmark: { flexDirection: 'row' },
  // Fraunces, like the web splash heading (h1.font-display).
  letter: { fontSize: 36, fontFamily: 'Fraunces_800ExtraBold', letterSpacing: -0.5, color: '#ffffff' },
  underline: { width: 120, height: 2, marginTop: 8, overflow: 'hidden' },
  country: { marginTop: 12, fontSize: 14, fontFamily: 'Outfit_600SemiBold', letterSpacing: 4.2, color: '#94a3b8' },
  tagline: { marginTop: 8, fontSize: 12, fontFamily: 'Outfit_400Regular', letterSpacing: 0.4, color: '#64748b' },
  barTrack: { marginTop: 40, width: 128, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  bar: { width: 128, height: 2, borderRadius: 1, overflow: 'hidden' },
})
