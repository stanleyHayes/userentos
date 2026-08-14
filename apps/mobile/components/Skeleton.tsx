import { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { useThemeColors, spacing } from '../lib/theme'

/** A single animated skeleton bar/box */
export function SkeletonBox({ width, height, radius = 8, style }: { width: number | string; height: number; radius?: number; style?: Record<string, unknown> }) {
  const c = useThemeColors()
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return (
    <Animated.View
      style={[
        { width: width as number | `${number}%`, height, borderRadius: radius, backgroundColor: c.border, opacity },
        style,
      ]}
    />
  )
}

/** Dashboard skeleton — KPI cards + content blocks */
export function DashboardSkeleton() {
  const c = useThemeColors()
  return (
    <View style={[sk.container, { backgroundColor: c.surface }]}>
      {/* Header */}
      <View style={sk.headerRow}>
        <View>
          <SkeletonBox width={180} height={22} radius={6} />
          <SkeletonBox width={120} height={14} radius={4} style={{ marginTop: 8 }} />
        </View>
        <SkeletonBox width={40} height={40} radius={20} />
      </View>

      {/* KPI row */}
      <View style={sk.kpiRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[sk.kpiCard, { backgroundColor: c.card }]}>
            <SkeletonBox width={28} height={28} radius={8} />
            <SkeletonBox width={50} height={20} radius={4} style={{ marginTop: 8 }} />
            <SkeletonBox width={40} height={10} radius={3} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>

      {/* Content cards */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={[sk.card, { backgroundColor: c.card }]}>
          <SkeletonBox width={120} height={14} radius={4} />
          <View style={sk.cardRow}>
            <SkeletonBox width={40} height={40} radius={10} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBox width="80%" height={12} radius={4} />
              <SkeletonBox width="50%" height={10} radius={3} />
            </View>
          </View>
          <View style={sk.cardRow}>
            <SkeletonBox width={40} height={40} radius={10} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBox width="70%" height={12} radius={4} />
              <SkeletonBox width="40%" height={10} radius={3} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

/** List skeleton — for properties, payments, agreements, etc. */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  const c = useThemeColors()
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[sk.listItem, { backgroundColor: c.card }]}>
          <SkeletonBox width={48} height={48} radius={12} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBox width="75%" height={14} radius={4} />
            <SkeletonBox width="50%" height={10} radius={3} />
            <SkeletonBox width="30%" height={10} radius={3} />
          </View>
        </View>
      ))}
    </View>
  )
}

/** Detail skeleton — for property detail, profile pages */
export function DetailSkeleton() {
  const c = useThemeColors()
  return (
    <View style={[sk.container, { backgroundColor: c.surface }]}>
      {/* Image placeholder */}
      <SkeletonBox width="100%" height={220} radius={0} />

      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <SkeletonBox width="80%" height={22} radius={6} />
        <SkeletonBox width="50%" height={14} radius={4} />
        <SkeletonBox width={100} height={28} radius={6} />

        {/* Detail row */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <SkeletonBox width={24} height={24} radius={12} />
              <SkeletonBox width={30} height={14} radius={4} />
              <SkeletonBox width={40} height={10} radius={3} />
            </View>
          ))}
        </View>

        {/* Description */}
        <View style={{ gap: 6 }}>
          <SkeletonBox width="100%" height={12} radius={4} />
          <SkeletonBox width="100%" height={12} radius={4} />
          <SkeletonBox width="60%" height={12} radius={4} />
        </View>

        {/* Action buttons */}
        <SkeletonBox width="100%" height={48} radius={12} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SkeletonBox width="75%" height={48} radius={12} />
          <SkeletonBox width={52} height={48} radius={14} />
        </View>
      </View>
    </View>
  )
}

/** Property grid skeleton */
export function PropertyGridSkeleton({ count = 4 }: { count?: number }) {
  const c = useThemeColors()
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[sk.propertyCard, { backgroundColor: c.card }]}>
          <SkeletonBox width="100%" height={140} radius={12} />
          <View style={{ padding: 12, gap: 6 }}>
            <SkeletonBox width="70%" height={14} radius={4} />
            <SkeletonBox width="50%" height={10} radius={3} />
            <SkeletonBox width={80} height={18} radius={4} style={{ marginTop: 4 }} />
          </View>
        </View>
      ))}
    </View>
  )
}

const sk = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  kpiRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  kpiCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: 12, padding: spacing.md, gap: spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, borderRadius: 12 },
  propertyCard: { borderRadius: 12, overflow: 'hidden' },
})
