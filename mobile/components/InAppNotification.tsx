import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useNotificationStore, type InAppToast } from '../stores/notificationStore'
import { useThemeColors } from '../lib/theme'

const TOAST_DURATION = 4000
const SLIDE_DURATION = 300

const iconMap: Record<InAppToast['type'], keyof typeof Ionicons.glyphMap> = {
  message: 'chatbubble',
  payment: 'card',
  dispute: 'shield',
  agreement: 'document-text',
  system: 'notifications',
}

const colorMap: Record<InAppToast['type'], string> = {
  message: '#3b82f6',
  payment: '#22c55e',
  dispute: '#f59e0b',
  agreement: '#8b5cf6',
  system: '#6b7280',
}

function Toast({ toast }: { toast: InAppToast }) {
  const c = useThemeColors()
  const router = useRouter()
  const dismiss = useNotificationStore((s) => s.dismissToast)
  const translateY = useRef(new Animated.Value(-100)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
      Animated.timing(opacity, { toValue: 1, duration: SLIDE_DURATION, useNativeDriver: true }),
    ]).start()

    // Auto-dismiss
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -100, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => dismiss(toast.id))
    }, TOAST_DURATION)

    return () => clearTimeout(timer)
  }, [])

  const accent = colorMap[toast.type]
  const icon = iconMap[toast.type]

  function handlePress() {
    dismiss(toast.id)
    if (toast.route) {
      router.push(toast.route as string)
    }
  }

  return (
    <Animated.View style={[s.toast, { backgroundColor: c.card, borderColor: c.border, transform: [{ translateY }], opacity }]}>
      <TouchableOpacity style={s.toastContent} activeOpacity={0.8} onPress={handlePress}>
        <View style={[s.iconWrap, { backgroundColor: accent + '15' }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
        <View style={s.textWrap}>
          <Text style={[s.toastTitle, { color: c.text }]} numberOfLines={1}>{toast.title}</Text>
          <Text style={[s.toastBody, { color: c.muted }]} numberOfLines={2}>{toast.body}</Text>
        </View>
        <TouchableOpacity onPress={() => dismiss(toast.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color={c.muted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  )
}

export function InAppNotificationProvider() {
  const toasts = useNotificationStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <View style={s.container} pointerEvents="box-none">
      {toasts.slice(-3).map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  toast: {
    width: '92%',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: { flex: 1 },
  toastTitle: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  toastBody: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginTop: 1 },
})
