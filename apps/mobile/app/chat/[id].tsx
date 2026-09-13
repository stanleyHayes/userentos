import { createMessageSnapshots } from '../../lib/messageSnapshots'
import { joinSocketRoom } from '../../../../packages/shared/socketRoom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Vibration, Alert } from 'react-native'
import { useAudioPlayer, AudioSource } from 'expo-audio'
import { Stack, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { neuCard, neuInset, neuChip } from '../../lib/neu'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { getSocket, connectSocket } from '../../lib/socket'

interface Message { id: string; senderId: string; senderName: string; text: string; read: boolean; createdAt: string; conversationId?: string; removed?: boolean }
interface ConversationDetail { id: string; otherUser: { id: string; firstName: string; lastName: string }; propertyTitle?: string; contactBlocked?: boolean; blockedByMe?: boolean }

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr); const now = new Date()
  const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
  const time = date.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear()
  if (isYesterday) return `Yesterday ${time}`
  return `${date.toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })} ${time}`
}

export default function ChatScreen() {
  const c = useThemeColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user, token } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const messageSnapshots = useRef(createMessageSnapshots<Message>())
  const pendingMessages = useRef(new Map<string, Message>())
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [isOtherTyping, setIsOtherTyping] = useState(false)
  const [isOtherOnline, setIsOtherOnline] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)
  const otherTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notificationSound: AudioSource = { uri: 'https://cdn.pixabay.com/audio/2024/11/27/audio_1f2d4c87de.mp3' }
  const player = useAudioPlayer(notificationSound)

  // Play notification sound + vibrate on incoming message
  const playMessageSound = useCallback(() => {
    try {
      Vibration.vibrate([0, 100, 50, 100])
      player.seekTo(0)
      player.play()
    } catch { /* no-op */ }
  }, [player])

  const loadMessages = useCallback(async () => {
    const snapshot = messageSnapshots.current.begin(id)
    try {
      const data = await api.get<{ items: Message[] }>(`/chat/conversations/${id}/messages`)
      // Inverted FlatList expects newest first
      const merged = snapshot.commit(data.items ?? [])
      if (!merged) return
      const rows = new Map(merged.map(message => [message.id, message]))
      for (const message of pendingMessages.current.values()) {
        if (message.conversationId === id) rows.set(message.id, message)
      }
      setMessages([...rows.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    } catch { snapshot.cancel() }
  }, [id])
  const loadConversation = useCallback(async () => { try { const convos = await api.get<ConversationDetail[]>('/chat/conversations'); const list = Array.isArray(convos) ? convos : (convos as { items?: ConversationDetail[] }).items ?? []; const found = list.find((cv: ConversationDetail) => cv.id === id); if (found) setConversation(found) } catch { /* no-op */ } }, [id])
  const markAsRead = useCallback(async () => { try { await api.patch(`/chat/conversations/${id}/read`, {}) } catch { /* no-op */ } }, [id])
  function reportMessage(messageId: string, targetType: 'message' | 'user' = 'message') {
    const submit = async (reason: string) => {
      try { await api.post('/reports', { targetType, targetId: messageId, reason }); Alert.alert('Report received', 'The moderation team can review the reported message. You can also block this contact.') }
      catch (error) { Alert.alert('Could not submit report', (error as Error).message) }
    }
    Alert.alert(targetType === 'user' ? 'Report user' : 'Report message', 'Choose the reason for reporting this message.', [
      { text: 'Abuse or offensive content', onPress: () => { void submit('offensive_content') } },
      { text: 'Scam or spam', onPress: () => { void submit('scam_or_fraud') } },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function toggleBlock() {
    if (!conversation?.otherUser?.id || blocking) return
    setBlocking(true)
    try {
      const path = `/chat/blocks/${conversation.otherUser.id}`
      if (conversation.blockedByMe) await api.delete(path)
      else await api.put(path, {})
      await loadConversation()
      setIsOtherOnline(false); setIsOtherTyping(false)
    } catch (error) { Alert.alert('Could not update block', (error as Error).message) }
    finally { setBlocking(false) }
  }

  useEffect(() => {
    const socket = getSocket() ?? (token ? connectSocket(token) : null)
    if (!socket) return
    const changed = () => { void loadConversation(); setIsOtherOnline(false); setIsOtherTyping(false); socket.emit('join:conversation', id); socket.emit('get:online') }
    socket.on('contact:changed', changed)
    return () => { socket.off('contact:changed', changed) }
  }, [loadConversation, id, token])

  // Initial data load (no polling -- socket handles real-time updates)
  useEffect(() => {
    async function init() { await Promise.all([loadMessages(), loadConversation()]); setLoading(false); markAsRead() }
    init()
  }, [loadMessages, loadConversation, markAsRead])

  // Socket.IO: join room, listen for messages, typing, online status
  useEffect(() => {
    if (!token || !id) return

    let socket = getSocket()
    if (!socket) socket = connectSocket(token)

    const leaveRoom = joinSocketRoom(socket, id)
    const resetTyping = () => {
      isTypingRef.current = false
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
      setIsOtherTyping(false)
    }
    socket.on('connect', resetTyping)
    socket.on('disconnect', resetTyping)
    const catchUp = () => {
      void loadMessages()
      void loadConversation()
      socket!.emit('get:online')
    }
    socket.on('connect', catchUp)

    // Request online status
    socket.emit('get:online')

    const handleNewMessage = (message: Message) => {
      if (message.conversationId !== id) return
      if (message.senderId === user?.id) return
      messageSnapshots.current.record(id, message)
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === message.id)
        if (exists) return prev
        return [message, ...prev]
      })
      markAsRead()
      playMessageSound()
    }

    const handleOnlineList = (userIds: string[]) => {
      if (conversation?.otherUser) {
        setIsOtherOnline(userIds.includes(conversation.otherUser.id))
      }
    }

    const handleUserOnline = ({ userId }: { userId: string }) => {
      if (conversation?.otherUser?.id === userId) setIsOtherOnline(true)
    }

    const handleUserOffline = ({ userId }: { userId: string }) => {
      if (conversation?.otherUser?.id === userId) setIsOtherOnline(false)
    }

    const handleTypingStart = ({ userId: uid, conversationId }: { userId: string; conversationId: string }) => {
      if (uid === user?.id || conversationId !== id) return
      setIsOtherTyping(true)
      // Auto-clear after 3 seconds
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
      otherTypingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000)
    }

    const handleTypingStop = ({ userId: uid }: { userId: string }) => {
      if (uid === user?.id) return
      setIsOtherTyping(false)
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
    }

    socket.on('message:new', handleNewMessage)
    const removed = () => { void loadMessages(); void loadConversation() }
    socket.on('message:removed', removed)
    socket.on('online:list', handleOnlineList)
    socket.on('user:online', handleUserOnline)
    socket.on('user:offline', handleUserOffline)
    socket.on('typing:start', handleTypingStart)
    socket.on('typing:stop', handleTypingStop)

    return () => {
      leaveRoom()
      socket!.off('connect', resetTyping)
      socket!.off('disconnect', resetTyping)
      socket!.off('connect', catchUp)
      socket!.off('message:new', handleNewMessage)
      socket!.off('message:removed', removed)
      socket!.off('online:list', handleOnlineList)
      socket!.off('user:online', handleUserOnline)
      socket!.off('user:offline', handleUserOffline)
      socket!.off('typing:start', handleTypingStart)
      socket!.off('typing:stop', handleTypingStop)
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
    }
  }, [token, id, conversation?.otherUser?.id, user?.id, markAsRead, loadMessages, loadConversation])

  // Re-check online status when conversation details load
  useEffect(() => {
    if (!conversation?.otherUser?.id) return
    const socket = getSocket()
    if (socket) socket.emit('get:online')
  }, [conversation?.otherUser?.id])

  // Emit typing events
  const emitTypingStart = useCallback(() => {
    const socket = getSocket()
    if (!socket || !id) return

    if (!isTypingRef.current) {
      isTypingRef.current = true
      socket.emit('typing:start', { conversationId: id })
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false
      socket.emit('typing:stop', { conversationId: id })
    }, 2000)
  }, [id])

  function handleInputChange(text: string) {
    setInputText(text)
    if (text.length > 0) emitTypingStart()
  }

  async function sendMessage() {
    const text = inputText.trim(); if (!text || sending || conversation?.contactBlocked) return
    setSending(true); setInputText('')

    // Stop typing indicator on send
    const socket = getSocket()
    if (socket && isTypingRef.current) {
      isTypingRef.current = false
      socket.emit('typing:stop', { conversationId: id })
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }

    const optimistic: Message = { id: `temp-${Date.now()}`, senderId: user?.id ?? '', senderName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`, conversationId: id, text, read: false, createdAt: new Date().toISOString() }
    pendingMessages.current.set(optimistic.id, optimistic)
    setMessages((prev) => [optimistic, ...prev])
    try {
      const msg = await api.post<Message>(`/chat/conversations/${id}/messages`, { text })
      pendingMessages.current.delete(optimistic.id)
      messageSnapshots.current.remove(id, optimistic.id)
      messageSnapshots.current.record(id, msg)
      setMessages((prev) => prev.some(m => m.id === optimistic.id) ? [msg, ...prev.filter(m => m.id !== optimistic.id && m.id !== msg.id)] : prev)
    }
    catch { pendingMessages.current.delete(optimistic.id); messageSnapshots.current.remove(id, optimistic.id); setMessages((prev) => prev.filter((m) => m.id !== optimistic.id)); setInputText(text) }
    finally { setSending(false) }
  }

  const otherName = conversation?.otherUser ? `${conversation.otherUser.firstName} ${conversation.otherUser.lastName}` : 'Chat'

  function renderMessage({ item, index }: { item: Message; index: number }) {
    const isMine = item.senderId === user?.id
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null
    const showDateSeparator = !nextMsg || new Date(item.createdAt).toDateString() !== new Date(nextMsg.createdAt).toDateString()
    return (
      <View>
        {showDateSeparator && (
          <View style={s.dateSeparator}>
            <View style={[s.dateLine, { backgroundColor: c.border }]} />
            <Text style={[s.dateText, { color: c.muted }]}>{new Date(item.createdAt).toLocaleDateString('en-GH', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
            <View style={[s.dateLine, { backgroundColor: c.border }]} />
          </View>
        )}
        <View style={[s.msgRow, isMine ? s.msgRowRight : s.msgRowLeft]}>
          {!isMine && (
            <View style={[s.msgAvatar, { backgroundColor: c.primary + '20' }]}>
              <Text style={[s.msgAvatarText, { color: c.primary }]}>{conversation?.otherUser.firstName?.[0] ?? '?'}</Text>
            </View>
          )}
          <View style={[s.bubble, isMine ? { backgroundColor: c.primary, borderBottomRightRadius: 4 } : { ...neuCard(c), borderBottomLeftRadius: 4 }]}>
            <Text style={[s.msgText, isMine ? { color: '#ffffff' } : { color: c.text }]}>{item.text}</Text>
            {!isMine && !item.removed && <TouchableOpacity accessibilityRole="button" onPress={() => reportMessage(item.id)}><Text style={{ color: c.primary, paddingTop: 6, textDecorationLine: 'underline' }}>Report message</Text></TouchableOpacity>}
            <View style={s.msgMeta}>
              <Text style={[s.msgTime, isMine ? { color: 'rgba(255,255,255,0.6)' } : { color: c.muted }]}>{formatMessageTime(item.createdAt)}</Text>
              {isMine && <Ionicons name={item.read ? 'checkmark-done' : 'checkmark'} size={14} color={isMine ? 'rgba(255,255,255,0.7)' : c.muted} style={{ marginLeft: 4 }} />}
            </View>
          </View>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.surface }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <Stack.Screen options={{ headerShown: true, headerBackTitle: '', title: otherName, headerTintColor: c.primary, headerStyle: { backgroundColor: c.white }, headerTitleStyle: { fontFamily: 'Outfit_600SemiBold', fontSize: 17 },
        headerRight: () => (
          <View style={s.headerRight}>
            {conversation?.otherUser?.id && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Report user" onPress={() => reportMessage(conversation.otherUser.id, 'user')}><Text style={{ color: c.primary }}>Report</Text></TouchableOpacity>}
            {isOtherOnline && <View style={s.headerOnlineDot} />}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={conversation?.blockedByMe ? 'Unblock user' : 'Block user'} disabled={blocking} onPress={toggleBlock} style={{ marginRight: 4 }}><Text style={{ color: c.primary }}>{conversation?.blockedByMe ? 'Unblock' : 'Block'}</Text></TouchableOpacity>
          </View>
        ) }} />
      {conversation?.propertyTitle && (
        <View style={[s.propertyBanner, { backgroundColor: c.primary + '08', borderBottomColor: c.border }]}>
          <Ionicons name="business-outline" size={14} color={c.primary} />
          <Text style={[s.propertyBannerText, { color: c.primary }]} numberOfLines={1}>{conversation.propertyTitle}</Text>
        </View>
      )}
      {isOtherOnline && (
        <View style={[s.onlineBanner, { backgroundColor: c.surface }]}>
          <View style={s.onlineBannerDot} />
          <Text style={[s.onlineBannerText, { color: '#22c55e' }]}>Online</Text>
        </View>
      )}
      {loading ? <View style={s.loadingWrap}><ActivityIndicator size="large" color={c.primary} /></View> : (
        <FlatList ref={flatListRef} data={messages} keyExtractor={(item) => item.id} renderItem={renderMessage} inverted contentContainerStyle={s.messageList}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={c.muted} />
              <Text style={[s.emptyChatText, { color: c.primaryDark }]}>No messages yet</Text>
              <Text style={[s.emptyChatSub, { color: c.muted }]}>Send a message to start the conversation</Text>
            </View>
          } />
      )}
      {isOtherTyping && (
        <View style={[s.typingBar, { backgroundColor: c.white, borderTopColor: c.border }]}>
          <Text style={[s.typingText, { color: c.muted }]}>{conversation?.otherUser.firstName ?? 'User'} is typing...</Text>
        </View>
      )}
      {conversation?.contactBlocked && <Text style={{ padding: 12, color: c.muted }}>Messaging is unavailable for this contact. Your existing history remains accessible.</Text>}
      <View style={[s.inputBar, { backgroundColor: c.white, borderTopColor: c.border }]}>
        <TextInput editable={!conversation?.contactBlocked} style={[s.textInput, neuInset(c), { color: c.text }]} placeholder="Type a message..." placeholderTextColor={c.muted} value={inputText} onChangeText={handleInputChange} multiline maxLength={2000} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message" style={[s.sendBtn, neuChip(c), { backgroundColor: c.primary }, (!inputText.trim() || sending || conversation?.contactBlocked) && s.sendBtnDisabled]} onPress={sendMessage} disabled={conversation?.contactBlocked || !inputText.trim() || sending}>
          {sending ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="send" size={18} color="#ffffff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerOnlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  propertyBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderBottomWidth: 1 },
  propertyBannerText: { fontSize: 13, fontFamily: 'Outfit_500Medium' },
  onlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 4 },
  onlineBannerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  onlineBannerText: { fontSize: 11, fontFamily: 'Outfit_500Medium' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  msgRow: { flexDirection: 'row', marginBottom: spacing.sm, alignItems: 'flex-end' },
  msgRowRight: { justifyContent: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  msgAvatarText: { fontSize: 12, fontFamily: 'Outfit_700Bold' },
  bubble: { maxWidth: '75%', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  msgText: { fontSize: 15, lineHeight: 21, fontFamily: 'Outfit_400Regular' },
  msgMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, justifyContent: 'flex-end' },
  msgTime: { fontSize: 11, fontFamily: 'Outfit_400Regular' },
  dateSeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md, gap: spacing.sm },
  dateLine: { flex: 1, height: 1 },
  dateText: { fontSize: 12, fontFamily: 'Outfit_500Medium' },
  emptyChat: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm, transform: [{ scaleY: -1 }] },
  emptyChatText: { fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  emptyChatSub: { fontSize: 13, fontFamily: 'Outfit_400Regular' },
  typingBar: { paddingHorizontal: spacing.md, paddingVertical: 6, borderTopWidth: 1 },
  typingText: { fontSize: 12, fontFamily: 'Outfit_400Regular', fontStyle: 'italic' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: Platform.OS === 'ios' ? 28 : spacing.md, borderTopWidth: 1, gap: spacing.sm },
  textInput: { flex: 1, paddingHorizontal: spacing.md, paddingTop: Platform.OS === 'ios' ? 10 : 8, paddingBottom: Platform.OS === 'ios' ? 10 : 8, fontSize: 15, fontFamily: 'Outfit_400Regular', maxHeight: 100 },
  sendBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
})
