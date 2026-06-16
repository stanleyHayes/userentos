import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatDate } from '../lib/format'
import { api } from '../lib/api'

interface Notification {
  id: string; title: string; message: string; type: string
  isRead: boolean; createdAt: string
}

const typeIcons: Record<string, string> = {
  payment: 'card-outline',
  agreement: 'document-text-outline',
  dispute: 'alert-circle-outline',
  property: 'business-outline',
  system: 'information-circle-outline',
  maintenance: 'build-outline',
}

export default function NotificationsScreen() {
  const c = useThemeColors()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const data = await api.get<{ items: Notification[] }>('/notifications')
      setNotifications(data.items)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function markAsRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`, {})
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n))
    } catch { /* no-op */ }
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all', {})
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } catch { /* no-op */ }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length

  function renderNotification({ item }: { item: Notification }) {
    const icon = typeIcons[item.type] ?? 'notifications-outline'
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: c.white }, !item.isRead && { backgroundColor: c.primary + '05', borderLeftWidth: 3, borderLeftColor: c.primary }]}
        onPress={() => { if (!item.isRead) markAsRead(item.id) }}
        activeOpacity={item.isRead ? 1 : 0.7}
      >
        <View style={s.cardLeft}>
          <View style={[s.iconWrap, { backgroundColor: c.primary + '10' }]}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={c.primary} />
            {!item.isRead && <View style={[s.unreadDot, { backgroundColor: c.danger, borderColor: c.white }]} />}
          </View>
        </View>
        <View style={s.cardBody}>
          <Text style={[s.cardTitle, { color: c.primaryDark }, !item.isRead && s.cardTitleUnread]} numberOfLines={1}>{item.title}</Text>
          <Text style={[s.cardMessage, { color: c.textLight }]} numberOfLines={2}>{item.message}</Text>
          <Text style={[s.cardDate, { color: c.muted }]}>{formatDate(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>

      {unreadCount > 0 && (
        <View style={[s.topBar, { backgroundColor: c.white, borderBottomColor: c.border }]}>
          <Text style={[s.unreadLabel, { color: c.primaryDark }]}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={markAllRead}>
            <Text style={[s.markAllText, { color: c.primary }]}>Mark all as read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          loading ? (
            <View style={s.empty}>
              <ActivityIndicator size="large" color={c.primary} />
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="notifications-off-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No notifications</Text>
            </View>
          )
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  unreadLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  markAllText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  list: { padding: spacing.md, gap: spacing.sm },
  card: { flexDirection: 'row', borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  cardLeft: { marginRight: spacing.md },
  iconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  unreadDot: { position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  cardTitleUnread: { fontFamily: 'Manrope_700Bold' },
  cardMessage: { fontSize: 13, marginTop: 2, lineHeight: 18, fontFamily: 'Manrope_400Regular' },
  cardDate: { fontSize: 11, marginTop: 4, fontFamily: 'Manrope_400Regular' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
})
