import type { ReactNode } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { useThemeColors, spacing } from '../lib/theme'
import { useRegulatedFeatures } from '../hooks/useRegulatedFeatures'
import { isPathAvailable, regulatedFeaturesForPath } from '../../../packages/shared/regulatedFeatures'

/**
 * Regulated financial screens (reachable from menus, deep links and push taps)
 * render only when the API reports the feature is enabled. Unknown status is
 * treated as unavailable so an outage can't expose an unlicensed service.
 */
export function RegulatedScreenGate({ routeName, children }: { routeName: string; children: ReactNode }) {
  const c = useThemeColors()
  const features = useRegulatedFeatures()
  const path = `/${routeName}`
  if (!regulatedFeaturesForPath(path)) return <>{children}</>
  if (features.isPending) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: c.surface }}><ActivityIndicator accessibilityLabel="Checking availability" color={c.primary} /></View>
  if (isPathAvailable(path, features.data ?? null)) return <>{children}</>
  return (
    <View style={{ flex: 1, padding: spacing.lg, backgroundColor: c.surface }}>
      <Text accessibilityRole="header" style={{ color: c.primaryDark, fontSize: 18, fontFamily: 'Outfit_700Bold' }}>This service isn’t available</Text>
      {features.isError ? (
        <View accessibilityRole="alert">
          <Text style={{ color: c.text, marginTop: spacing.sm }}>We couldn’t confirm whether this service is available.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => void features.refetch()}>
            <Text style={{ color: c.primary, fontFamily: 'Outfit_600SemiBold', paddingVertical: spacing.md }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={{ color: c.text, marginTop: spacing.sm }}>
          RentOS offers payments, stored balances, lending, investments, insurance and credit scoring only where a licensed provider operates them. This service isn’t offered yet.
        </Text>
      )}
    </View>
  )
}
