import { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { api } from '../../lib/api'
import { ListSkeleton } from '../../components/Skeleton'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { connectSocket } from '../../lib/socket'

interface Conversation { id: string; otherUser: { id: string; firstName: string; lastName: string }; lastMessage: { text: string; senderId: string; createdAt: string }; unreadCount: number; propertyTitle?: string }

function timeAgo(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'; if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24); if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export default function MessagesScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { user, token } = useAuthStore()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [allUsers, setAllUsers] = useState<{ id: string; firstName: string; lastName: string; email: string; activeRole: string }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try { const data = await api.get<Conversation[]>('/chat/conversations'); setConversations(Array.isArray(data) ? data : (data as { items?: Conversation[] }).items ?? []) } catch { /* no-op */ } finally { setLoading(false) }
  }, [])

  // Connect socket and set up listeners
  useEffect(() => {
    if (!token) return

    const socket = connectSocket(token)

    // Request current online users
    socket.emit('get:online')

    const handleOnlineList = (userIds: string[]) => {
      setOnlineUsers(new Set(userIds))
    }
    const handleUserOnline = ({ userId }: { userId: string }) => {
      setOnlineUsers((prev) => new Set(prev).add(userId))
    }
    const handleUserOffline = ({ userId }: { userId: string }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }
    const handleNewMessage = () => {
      // Refresh conversation list to show updated lastMessage / unread counts
      load()
    }
    const handleUnreadUpdate = () => {
      load()
    }

    socket.on('online:list', handleOnlineList)
    socket.on('user:online', handleUserOnline)
    socket.on('user:offline', handleUserOffline)
    socket.on('message:new', handleNewMessage)
    socket.on('unread:update', handleUnreadUpdate)

    return () => {
      socket.off('online:list', handleOnlineList)
      socket.off('user:online', handleUserOnline)
      socket.off('user:offline', handleUserOffline)
      socket.off('message:new', handleNewMessage)
      socket.off('unread:update', handleUnreadUpdate)
    }
  }, [token, load])

  // Clear the unread badge only when this screen is focused — not on every
  // conversation-list refresh (which previously zeroed the badge even while the
  // user was on another tab, so a new message's badge never persisted).
  const clearUnread = useNotificationStore((s) => s.clearUnread)
  useFocusEffect(
    useCallback(() => { clearUnread() }, [clearUnread]),
  )

  // Initial load + 30s fallback polling
  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function loadUsers() {
    setLoadingUsers(true)
    try {
      const data = await api.get<{ items: { id: string; firstName: string; lastName: string; email: string; activeRole: string }[] }>('/chat/users')
      setAllUsers((data.items ?? []).filter((u) => u.id !== user?.id))
    } catch { /* no-op */ } finally { setLoadingUsers(false) }
  }

  async function startConversation(participantId: string) {
    setCreating(true)
    try {
      const conv = await api.post<Conversation>('/chat/conversations', { participantId })
      setShowNewModal(false)
      setUserSearch('')
      router.push(`/chat/${conv.id}`)
    } catch { /* no-op */ } finally { setCreating(false) }
  }

  const filteredUsers = allUsers.filter((u) => {
    if (!userSearch.trim()) return true
    const q = userSearch.toLowerCase()
    return `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  const filtered = conversations.filter((cv) => {
    if (!search.trim()) return true
    if (!cv.otherUser) return false
    const name = `${cv.otherUser.firstName ?? ''} ${cv.otherUser.lastName ?? ''}`.toLowerCase()
    return name.includes(search.toLowerCase()) || (cv.propertyTitle?.toLowerCase().includes(search.toLowerCase()) ?? false)
  })

  function renderConversation({ item }: { item: Conversation }) {
    if (!item.otherUser) return null
    const isUnread = item.unreadCount > 0
    const isMine = item.lastMessage?.senderId === user?.id
    const preview = item.lastMessage ? (isMine ? 'You: ' : '') + item.lastMessage.text : 'No messages yet'
    const isOnline = onlineUsers.has(item.otherUser?.id)
    return (
      <TouchableOpacity style={[s.convItem, { backgroundColor: c.white }]} activeOpacity={0.7} onPress={() => router.push(`/chat/${item.id}`)}>
        <View style={s.avatarWrap}>
          <View style={[s.avatar, { backgroundColor: c.primary }]}>
            <Text style={s.avatarText}>{`${item.otherUser.firstName?.[0] ?? ''}${item.otherUser.lastName?.[0] ?? ''}`.toUpperCase()}</Text>
          </View>
          {isOnline && <View style={s.onlineDot} />}
        </View>
        <View style={s.convBody}>
          <View style={s.convTop}>
            <Text style={[s.convName, { color: c.text }, isUnread && { fontFamily: 'Manrope_700Bold', color: c.primaryDark }]} numberOfLines={1}>{item.otherUser.firstName} {item.otherUser.lastName}</Text>
            {item.lastMessage && <Text style={[s.convTime, { color: c.muted }, isUnread && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{timeAgo(item.lastMessage.createdAt)}</Text>}
          </View>
          {item.propertyTitle && <Text style={[s.propertyLabel, { color: c.primary }]} numberOfLines={1}>{item.propertyTitle}</Text>}
          <View style={s.convBottom}>
            <Text style={[s.convPreview, { color: c.muted }, isUnread && { color: c.text, fontFamily: 'Manrope_500Medium' }]} numberOfLines={1}>{preview}</Text>
            {isUnread && (
              <View style={[s.badge, { backgroundColor: c.primary }]}>
                <Text style={s.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      <View style={[s.searchWrap, { backgroundColor: c.white, borderColor: c.border }]}>
        <Ionicons name="search-outline" size={18} color={c.muted} />
        <TextInput style={[s.searchInput, { color: c.text }]} placeholder="Search conversations..." placeholderTextColor={c.muted} value={search} onChangeText={setSearch} />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={c.muted} /></TouchableOpacity>}
      </View>
      <FlatList data={filtered} keyExtractor={(item) => item.id} renderItem={renderConversation} contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ItemSeparatorComponent={() => <View style={[s.separator, { backgroundColor: c.border }]} />}
        ListEmptyComponent={loading ? (
          <View style={s.empty}><ListSkeleton /></View>
        ) : (
          <View style={s.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={c.muted} />
            <Text style={[s.emptyTitle, { color: c.primaryDark }]}>No conversations yet</Text>
            <Text style={[s.emptySubtitle, { color: c.muted }]}>Start a new conversation by tapping the button below</Text>
          </View>
        )} />
      <TouchableOpacity style={[s.fab, { backgroundColor: c.primary }]} onPress={() => { setShowNewModal(true); if (allUsers.length === 0) loadUsers() }} activeOpacity={0.8}>
        <Ionicons name="create-outline" size={24} color="#ffffff" />
      </TouchableOpacity>
      <Modal visible={showNewModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>New Conversation</Text>
              <TouchableOpacity onPress={() => { setShowNewModal(false); setUserSearch('') }}><Ionicons name="close" size={24} color={c.text} /></TouchableOpacity>
            </View>

            {/* Search bar */}
            <View style={[s.userSearchWrap, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="search-outline" size={16} color={c.muted} />
              <TextInput
                style={[s.userSearchInput, { color: c.text }]}
                placeholder="Search by name or email..."
                placeholderTextColor={c.muted}
                value={userSearch}
                onChangeText={setUserSearch}
                autoCapitalize="none"
              />
              {userSearch.length > 0 && (
                <TouchableOpacity onPress={() => setUserSearch('')}>
                  <Ionicons name="close-circle" size={16} color={c.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* User list */}
            {loadingUsers ? (
              <View style={s.userListLoading}>
                <ActivityIndicator size="small" color={c.primary} />
                <Text style={[s.userListLoadingText, { color: c.muted }]}>Loading users...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredUsers.slice(0, 20)}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 350 }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={[s.userListEmpty, { color: c.muted }]}>No users found</Text>
                }
                renderItem={({ item: u }) => (
                  <TouchableOpacity
                    style={[s.userItem, { borderColor: c.border + '40' }]}
                    activeOpacity={0.7}
                    onPress={() => startConversation(u.id)}
                    disabled={creating}
                  >
                    <View style={[s.userAvatar, { backgroundColor: c.primary }]}>
                      <Text style={s.userAvatarText}>
                        {`${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.userName, { color: c.primaryDark }]}>{u.firstName} {u.lastName}</Text>
                      <Text style={[s.userEmail, { color: c.muted }]} numberOfLines={1}>{u.email}</Text>
                    </View>
                    <View style={[s.userRole, { backgroundColor: c.primary + '12' }]}>
                      <Text style={[s.userRoleText, { color: c.primary }]}>{u.activeRole.replace('_', ' ')}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? 12 : 8, borderWidth: 1, gap: spacing.sm },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Manrope_400Regular', paddingVertical: 0 },
  list: { paddingBottom: 100 },
  convItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 14 },
  avatarWrap: { position: 'relative', marginRight: spacing.md },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#ffffff', fontSize: 16, fontFamily: 'Manrope_700Bold' },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#ffffff' },
  convBody: { flex: 1 },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { fontSize: 15, fontFamily: 'Manrope_500Medium', flex: 1, marginRight: spacing.sm },
  convTime: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  propertyLabel: { fontSize: 12, fontFamily: 'Manrope_500Medium', marginTop: 2, opacity: 0.8 },
  convBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  convPreview: { flex: 1, fontSize: 13, fontFamily: 'Manrope_400Regular' },
  badge: { borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginLeft: spacing.sm },
  badgeText: { color: '#ffffff', fontSize: 11, fontFamily: 'Manrope_700Bold' },
  separator: { height: 1, marginLeft: 78 },
  empty: { alignItems: 'center', paddingVertical: 80, gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  inputLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: 6, marginTop: spacing.md },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, fontFamily: 'Manrope_400Regular' },
  userSearchWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 6, gap: 8, marginBottom: spacing.md },
  userSearchInput: { flex: 1, fontSize: 14, fontFamily: 'Manrope_400Regular', paddingVertical: 0 },
  userListLoading: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  userListLoadingText: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
  userListEmpty: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingVertical: 40 },
  userItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { color: '#ffffff', fontSize: 13, fontFamily: 'Manrope_700Bold' },
  userName: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  userEmail: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 1 },
  userRole: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  userRoleText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
})
