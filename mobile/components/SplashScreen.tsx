import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { Logo } from './Logo'
import { useThemeColors } from '../lib/theme'

interface SplashScreenProps {
  onFinished: () => void
}

export function AnimatedSplashScreen({ onFinished }: SplashScreenProps) {
  const c = useThemeColors()
  const logoScale = useRef(new Animated.Value(0.3)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const textOpacity = useRef(new Animated.Value(0)).current
  const textTranslate = useRef(new Animated.Value(20)).current
  const dotOpacity = useRef(new Animated.Value(0)).current
  const containerOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    // Phase 1: Logo pops in (0-600ms)
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1, friction: 4, tension: 100, useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }),
    ]).start()

    // Phase 2: Text fades in (600-1200ms)
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(textTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 400, delay: 200, useNativeDriver: true }),
      ]).start()
    }, 600)

    // Phase 3: Fade out (2000-2500ms)
    setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0, duration: 400, useNativeDriver: true,
      }).start(() => { onFinished() })
    }, 2000)
  }, [])

  return (
    <Animated.View style={[styles.container, { backgroundColor: c.white, opacity: containerOpacity }]}>
      {/* Glow effect */}
      <View style={[styles.glow, { backgroundColor: c.primary + '08' }]} />

      {/* Logo */}
      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Logo size={64} variant="mark" theme="dark" />
      </Animated.View>

      {/* Text */}
      <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textTranslate }] }}>
        <Text style={[styles.brand, { color: c.primaryDark }]}>
          Rent<Text style={[styles.brandAccent, { color: c.secondary }]}>OS</Text> Ghana
        </Text>
        <Text style={[styles.tagline, { color: c.muted }]}>Calm before the storm</Text>
      </Animated.View>

      {/* Loading dots */}
      <Animated.View style={[styles.dots, { opacity: dotOpacity }]}>
        {[0, 1, 2].map((i) => (
          <PulsingDot key={i} delay={i * 200} color={c.primary} />
        ))}
      </Animated.View>
    </Animated.View>
  )
}

function PulsingDot({ delay, color }: { delay: number; color: string }) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return <Animated.View style={[styles.dot, { opacity, backgroundColor: color }]} />
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  logoWrap: {
    marginBottom: 24,
  },
  brand: {
    fontSize: 26,
    fontFamily: 'Manrope_800ExtraBold',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  brandAccent: {},
  tagline: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
