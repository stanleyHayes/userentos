import { useEffect, useState, useCallback } from 'react'
import { TouchableOpacity } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope'
import * as ExpoSplashScreen from 'expo-splash-screen'
import { AnimatedSplashScreen } from '../components/SplashScreen'
import { useThemeColors } from '../lib/theme'
import { useAppSocket } from '../hooks/useAppSocket'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { InAppNotificationProvider } from '../components/InAppNotification'

ExpoSplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } },
})

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated, hydrate } = useAuthStore()
  const segments = useSegments()
  const router = useRouter()

  // Connect socket at root level for in-app notifications & unread badge
  useAppSocket()
  // Register for push notifications and handle tap → deep-link routing
  usePushNotifications()

  useEffect(() => {
    hydrate()
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const inAuthGroup = segments[0] === 'auth'
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/auth/login')
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [isAuthenticated, hydrated, segments])

  if (!hydrated) return null

  return (
    <>
      {children}
      <InAppNotificationProvider />
    </>
  )
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true)
  const c = useThemeColors()
  const router = useRouter()

  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
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
        <Stack screenOptions={{
          headerShown: true,
          headerTintColor: c.text,
          headerStyle: { backgroundColor: c.card },
          headerTitleStyle: { fontFamily: 'Manrope_700Bold', fontSize: 17 },
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
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="biometric-devices" options={{ title: 'Biometric Devices' }} />
          <Stack.Screen name="blog" options={{ title: 'Blog' }} />
          <Stack.Screen name="blog-detail" options={{ title: 'Article' }} />
          <Stack.Screen name="analytics" options={{ title: 'Analytics' }} />
          <Stack.Screen name="legal" options={{ title: 'Rental Laws' }} />
          <Stack.Screen name="legal-assistant" options={{ title: 'AI Legal Assistant' }} />
          <Stack.Screen name="documents" options={{ title: 'Documents' }} />
          <Stack.Screen name="tenant-profile" options={{ title: 'My Profile' }} />
          <Stack.Screen name="profile-access" options={{ title: 'Profile Access' }} />
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
