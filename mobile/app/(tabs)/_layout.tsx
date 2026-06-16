import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../lib/theme'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'

export default function TabLayout() {
  const user = useAuthStore((s) => s.user)
  const role = user?.activeRole ?? 'tenant'
  const isLandlord = role === 'landlord' || role === 'property_manager'
  const c = useThemeColors()
  const unreadMessages = useNotificationStore((s) => s.unreadMessages)

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.border,
          height: 88,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: 'Manrope_700Bold' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="properties"
        options={{
          title: 'Properties',
          tabBarIcon: ({ color, size }) => <Ionicons name="business" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
          tabBarBadge: unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : unreadMessages) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444', fontSize: 10, fontFamily: 'Manrope_700Bold', minWidth: 18, height: 18, lineHeight: 18, borderRadius: 9 },
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'RentGuard',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} />,
          href: isLandlord ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}
