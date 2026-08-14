import type { PropsWithChildren } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type TouchableOpacityProps,
  type ViewStyle,
} from 'react-native'

export function useReducedMotion() {
  const [reduced, setReduced] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduced(enabled) })
      .catch(() => { if (mounted) setReduced(false) })

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return reduced
}

interface MotionRevealProps extends PropsWithChildren {
  distance?: number
  delay?: number
  style?: StyleProp<ViewStyle>
}

export function MotionReveal({ children, distance = 12, delay = 0, style }: MotionRevealProps) {
  const reduced = useReducedMotion()
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduced === null) return
    progress.stopAnimation()
    if (reduced) {
      progress.setValue(1)
      return
    }
    progress.setValue(0)
    Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      delay,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start()
  }, [delay, progress, reduced])

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }),
          }],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity)

export function PressScale({
  children,
  style,
  onPressIn,
  onPressOut,
  ...props
}: TouchableOpacityProps) {
  const reduced = useReducedMotion()
  const scale = useRef(new Animated.Value(1)).current

  function move(toValue: number) {
    scale.stopAnimation()
    if (reduced !== false) {
      scale.setValue(1)
      return
    }
    Animated.spring(scale, {
      toValue,
      stiffness: 360,
      damping: 24,
      mass: 0.65,
      useNativeDriver: Platform.OS !== 'web',
    }).start()
  }

  return (
    <AnimatedTouchable
      {...props}
      activeOpacity={0.82}
      onPressIn={(event) => {
        move(0.97)
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        move(1)
        onPressOut?.(event)
      }}
      style={[style, styles.pressTarget, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedTouchable>
  )
}

const styles = StyleSheet.create({
  pressTarget: { backfaceVisibility: 'hidden' },
})
