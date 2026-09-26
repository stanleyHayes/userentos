import AppleBillingSession from '../components/AppleBillingSession'
import GoogleBillingSession from '../components/GoogleBillingSession'
import { useEffect, useState, useCallback } from 'react'
import { TouchableOpacity, View, Text, Linking } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore, type User } from '../stores/authStore'
import { api } from '../lib/api'
import { createSessionQueryClient, querySessionKey } from '../lib/sessionQueryClient'
import { useFonts } from 'expo-font'
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit'
// Only the splash wordmark weight; the package index would bundle all 18 files.
import { Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces/800ExtraBold'
import * as ExpoSplashScreen from 'expo-splash-screen'
import { AnimatedSplashScreen } from '../components/SplashScreen'
import { useThemeColors } from '../lib/theme'
import { useAppSocket } from '../hooks/useAppSocket'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { InAppNotificationProvider } from '../components/InAppNotification'
import { RegulatedScreenGate } from '../components/RegulatedScreenGate'
import { authRedirect } from '../lib/publicRoutes'
import { ConsentBanner } from '../components/ConsentBanner'

ExpoSplashScreen.preventAutoHideAsync()

const { queryClient } = createSessionQueryClient(useAuthStore.subscribe)

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated, hydrate, user } = useAuthStore()
  const segments = useSegments()
  const router = useRouter()

  // Connect socket at root level for in-app notifications & unread badge
  useAppSocket()
  // Register for push notifications and handle tap → deep-link routing
  usePushNotifications()

  useEffect(() => {
    // The keychain keeps only the credentials; the profile comes from the API.
    void hydrate(() => api.get<User>('/users/me'))
  }, [])

  useEffect(() => {
    if (!hydrated) return
    // Signed-out users may stay on the auth group and the few public screens
    // (e.g. the rights check linked from login); everything else needs a session.
    const redirect = authRedirect(segments, isAuthenticated)
    if (redirect) router.replace(redirect)
  }, [isAuthenticated, hydrated, segments])

  if (!hydrated) return null

  return (
    <>
      <GoogleBillingSession />
      <AppleBillingSession />
      {children}
      {user?.suspendedAt && <View style={{ padding: 12, backgroundColor: '#fff2c6' }}>
        <Text style={{ color: '#332600' }}>Account suspended. Contact info@userentos.com to appeal or get help with existing obligations.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/agreements')}><Text style={{ color: '#18345a', paddingVertical: 8 }}>View your agreements</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/(tabs)/payments')}><Text style={{ color: '#18345a', paddingVertical: 8 }}>View payments or pay active rent</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/privacy')}><Text style={{ color: '#18345a', paddingVertical: 8 }}>Export data or delete account</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="link" onPress={() => { void Linking.openURL('mailto:info@userentos.com?subject=Account%20suspension%20appeal') }}><Text style={{ color: '#18345a' }}>Contact support</Text></TouchableOpacity>
      </View>}
      {isAuthenticated && <ConsentBanner />}
      <InAppNotificationProvider />
    </>
  )
}

export default function RootLayout() {
  const querySession = useAuthStore(querySessionKey)
  const [showSplash, setShowSplash] = useState(true)
  const c = useThemeColors()
  const router = useRouter()

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Fraunces_800ExtraBold,
  })

  useEffect(() => {
    if (fontsLoaded) {
      ExpoSplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  const handleSplashFinished = useCallback(() => {
    setShowSplash(false)
  }, [])

  if (!fontsLoaded) return null

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard>
        <Stack key={querySession} screenLayout={({ route, children }) => <RegulatedScreenGate routeName={route.name}>{children}</RegulatedScreenGate>} screenOptions={{
          headerShown: true,
          headerTintColor: c.text,
          headerStyle: { backgroundColor: c.card },
          headerTitleStyle: { fontFamily: 'Outfit_700Bold', fontSize: 17 },
          headerShadowVisible: false,
          headerBackVisible: false,
          headerLeft: ({ canGoBack }) => canGoBack ? (
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, marginLeft: -4 }}>
              <Ionicons name="chevron-back" size={24} color={c.text} />
            </TouchableOpacity>
          ) : null,
        }}>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="property/[id]" options={{ title: 'Property Details' }} />
          <Stack.Screen name="saved-properties" options={{ title: 'Saved Properties' }} />
          <Stack.Screen name="tenants" options={{ title: 'My Tenants' }} />
          <Stack.Screen name="applications" options={{ title: 'Applications' }} />
          <Stack.Screen name="agreements" options={{ title: 'My Agreements' }} />
          <Stack.Screen name="disputes" options={{ title: 'Disputes' }} />
          <Stack.Screen name="investments" options={{ title: 'Investments' }} />
          <Stack.Screen name="loans" options={{ title: 'Micro-Loans' }} />
          <Stack.Screen name="credit-score" options={{ title: 'Credit Score' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="payout-account" options={{ title: 'Payout account' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy and personal data' }} />
          <Stack.Screen name="biometric-devices" options={{ title: 'Biometric Devices' }} />
          <Stack.Screen name="blog" options={{ title: 'Blog' }} />
          <Stack.Screen name="blog-detail" options={{ title: 'Article' }} />
          <Stack.Screen name="analytics" options={{ title: 'Analytics' }} />
          <Stack.Screen name="legal" options={{ title: 'Rental Laws' }} />
          <Stack.Screen name="rights-check" options={{ title: 'Is this legal?' }} />
          <Stack.Screen name="legal-assistant" options={{ title: 'AI Legal Assistant' }} />
          <Stack.Screen name="documents" options={{ title: 'Documents' }} />
          <Stack.Screen name="tenant-profile" options={{ title: 'My Profile' }} />
          <Stack.Screen name="tenant-passport" options={{ title: 'Tenant Passport' }} />
          <Stack.Screen name="profile-access" options={{ title: 'Profile Access' }} />
          <Stack.Screen name="local-services" options={{ title: 'Local Services' }} />
          <Stack.Screen name="my-business" options={{ title: 'Business Portal' }} />
          <Stack.Screen name="workers" options={{ title: 'Service Providers' }} />
          <Stack.Screen name="worker/[id]" options={{ title: 'Provider Profile' }} />
          <Stack.Screen name="bookings" options={{ title: 'Service Bookings' }} />
          <Stack.Screen name="become-worker" options={{ title: 'Provider Profile' }} />
          <Stack.Screen name="earnings" options={{ title: 'Provider Earnings' }} />
          <Stack.Screen name="employer" options={{ title: 'Employer Portal' }} />
          <Stack.Screen name="financier" options={{ title: 'Financier Portal' }} />
          <Stack.Screen name="agent-leads" options={{ title: 'Lead Pipeline' }} />
          <Stack.Screen name="agent-viewings" options={{ title: 'Viewing Schedule' }} />
          <Stack.Screen name="agent-commissions" options={{ title: 'Commissions' }} />
          <Stack.Screen name="landlord-expenses" options={{ title: 'Property Expenses' }} />
          <Stack.Screen name="landlord-vacancy" options={{ title: 'Vacancy Overview' }} />
          <Stack.Screen name="help" options={{ title: 'Help & Support' }} />
          <Stack.Screen name="about" options={{ title: 'About RentOS' }} />
          <Stack.Screen name="gov-reviews" options={{ title: 'Property Reviews' }} />
          <Stack.Screen name="gov-panel" options={{ title: 'Government Panel' }} />
          <Stack.Screen name="users-admin" options={{ title: 'User Management' }} />
          <Stack.Screen name="subscription" options={{ title: 'Subscription Plans' }} />
          <Stack.Screen name="add-property" options={{ title: 'Add Property' }} />
          <Stack.Screen name="financing" options={{ title: 'Financing' }} />
          <Stack.Screen name="financing-mandates" options={{ title: 'My Mandates' }} />
          <Stack.Screen name="maintenance" options={{ title: 'Maintenance' }} />
          <Stack.Screen name="insurance" options={{ title: 'Insurance' }} />
          <Stack.Screen name="achievements" options={{ title: 'Achievements' }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not Found' }} />
        </Stack>
        <StatusBar style="auto" />
      </AuthGuard>
      {showSplash && <AnimatedSplashScreen onFinished={handleSplashFinished} />}
    </QueryClientProvider>
  )
}
