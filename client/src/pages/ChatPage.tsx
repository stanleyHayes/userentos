import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkConversationRead,
  useCreateConversation,
  useChatUsers,
} from '@/hooks/useApi'
import { useSocket } from '@/hooks/useSocket'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import {
  Send, ArrowLeft, Plus, Search, Building2, MessageCircle,
} from 'lucide-react'
import type { Conversation, ChatMessage } from '@/types'
import { DoodleSpiral } from '@/components/ui/Doodles'
import { IconWatermark } from '@/components/ui/Watermark'

function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    return d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })
  } else if (days === 1) {
    return 'Yesterday'
  } else if (days < 7) {
    return d.toLocaleDateString('en-GH', { weekday: 'short' })
  }
  return d.toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })
}

function formatFullTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GH', { weekday: 'long', month: 'long', day: 'numeric' })
}

function getInitials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?'
}

export function ChatPage() {
  const user = useAuthStore((s) => s.user)
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()
  const socket = useSocket()
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    searchParams.get('conversationId')
  )
  const [messageText, setMessageText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [showMobileThread, setShowMobileThread] = useState(false)

  // Clear conversationId from URL once applied (effect updates URL — external system)
  useEffect(() => {
    const urlConvoId = searchParams.get('conversationId')
    if (urlConvoId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs URL → state, then clears query param
      setActiveConversationId(urlConvoId)
      setShowMobileThread(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Online / typing state
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [typingUsers, setTypingUsers] = useState<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevConversationRef = useRef<string | null>(null)

  const { data: conversations, isLoading: convosLoading } = useConversations()
  const { data: messagesData } = useMessages(activeConversationId)
  const sendMessage = useSendMessage()
  const markRead = useMarkConversationRead()

  const messages = messagesData?.items ?? []

  const activeConversation = conversations?.find(
    (c: Conversation) => c.id === activeConversationId
  )

  // Filter conversations by search
  const filteredConversations = (conversations ?? []).filter((c: Conversation) => {
    if (!searchQuery) return true
    const name = `${c.otherUser?.firstName ?? ''} ${c.otherUser?.lastName ?? ''}`.toLowerCase()
    const prop = (c.propertyTitle ?? '').toLowerCase()
    const q = searchQuery.toLowerCase()
    return name.includes(q) || prop.includes(q)
  })

  // ─── Socket.IO: online status ───
  useEffect(() => {
    if (!socket) return

    socket.emit('get:online')

    const handleOnlineList = (userIds: string[]) => {
      setOnlineUsers(new Set(userIds))
    }
    const handleUserOnline = ({ userId: uid }: { userId: string }) => {
      setOnlineUsers((prev) => new Set(prev).add(uid))
    }
    const handleUserOffline = ({ userId: uid }: { userId: string }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev)
        next.delete(uid)
        return next
      })
    }

    socket.on('online:list', handleOnlineList)
    socket.on('user:online', handleUserOnline)
    socket.on('user:offline', handleUserOffline)

    return () => {
      socket.off('online:list', handleOnlineList)
      socket.off('user:online', handleUserOnline)
      socket.off('user:offline', handleUserOffline)
    }
  }, [socket])

  // ─── Socket.IO: real-time messages & unread updates ───
  useEffect(() => {
    if (!socket) return

    const handleNewMessage = (message: ChatMessage) => {
      // Skip messages sent by the current user — the mutation's onSuccess already
      // appended it to the cache. Processing it again from the socket causes duplicates.
      if (message.senderId === userId) return

      // If this message belongs to the active conversation, append it to the cache
      if (message.conversationId === activeConversationId) {
        queryClient.setQueryData(
          ['messages', activeConversationId],
          (old: { items: ChatMessage[] } | undefined) => {
            if (!old) return { items: [message] }
            const exists = old.items.some((m) => m.id === message.id)
            if (exists) return old
            return { ...old, items: [...old.items, message] }
          }
        )
      }
      // Always refresh conversation list for updated lastMessage / unread counts
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }

    const handleUnreadUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['unread-count'] })
    }

    socket.on('message:new', handleNewMessage)
    socket.on('unread:update', handleUnreadUpdate)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('unread:update', handleUnreadUpdate)
    }
  }, [socket, activeConversationId, queryClient, userId])

  // ─── Socket.IO: typing indicators ───
  useEffect(() => {
    if (!socket) return

    const handleTypingStart = ({ userId: uid, conversationId }: { userId: string; conversationId: string }) => {
      if (uid === userId) return // Ignore own typing
      if (conversationId !== activeConversationId) return

      setTypingUsers((prev) => {
        const next = new Map(prev)
        // Clear any existing timeout for this user
        const existing = next.get(uid)
        if (existing) clearTimeout(existing)
        // Auto-clear after 3 seconds
        const timeout = setTimeout(() => {
          setTypingUsers((p) => {
            const n = new Map(p)
            n.delete(uid)
            return n
          })
        }, 3000)
        next.set(uid, timeout)
        return next
      })
    }

    const handleTypingStop = ({ userId: uid }: { userId: string }) => {
      setTypingUsers((prev) => {
        const next = new Map(prev)
        const existing = next.get(uid)
        if (existing) clearTimeout(existing)
        next.delete(uid)
        return next
      })
    }

    socket.on('typing:start', handleTypingStart)
    socket.on('typing:stop', handleTypingStop)

    return () => {
      socket.off('typing:start', handleTypingStart)
      socket.off('typing:stop', handleTypingStop)
    }
  }, [socket, activeConversationId, userId])

  // ─── Socket.IO: join / leave conversation rooms ───
  useEffect(() => {
    if (!socket) return

    // Leave previous room
    if (prevConversationRef.current) {
      socket.emit('leave:conversation', prevConversationRef.current)
    }
    // Join new room
    if (activeConversationId) {
      socket.emit('join:conversation', activeConversationId)
    }
    prevConversationRef.current = activeConversationId

    // Clear typing state when switching conversations (synced with socket room change)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- side-effect of socket join/leave
    setTypingUsers(new Map())

    return () => {
      if (activeConversationId) {
        socket.emit('leave:conversation', activeConversationId)
      }
    }
  }, [socket, activeConversationId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Mark conversation as read when opened
  useEffect(() => {
    if (activeConversationId && activeConversation?.unreadCount && activeConversation.unreadCount > 0) {
      markRead.mutate(activeConversationId)
    }
  }, [activeConversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus input when conversation opens
  useEffect(() => {
    if (activeConversationId) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [activeConversationId])

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id)
    setShowMobileThread(true)
  }, [])

  const handleBackToList = useCallback(() => {
    setShowMobileThread(false)
  }, [])

  // ─── Emit typing events (debounced) ───
  const emitTypingStart = useCallback(() => {
    if (!socket || !activeConversationId) return

    if (!isTypingRef.current) {
      isTypingRef.current = true
      socket.emit('typing:start', { conversationId: activeConversationId })
    }

    // Reset the stop timer
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false
      socket.emit('typing:stop', { conversationId: activeConversationId })
    }, 2000)
  }, [socket, activeConversationId])

  const handleSend = useCallback(() => {
    if (!messageText.trim() || !activeConversationId) return

    // Stop typing indicator on send
    if (socket && isTypingRef.current) {
      isTypingRef.current = false
      socket.emit('typing:stop', { conversationId: activeConversationId })
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }

    sendMessage.mutate(
      { conversationId: activeConversationId, text: messageText.trim() },
      { onSuccess: () => setMessageText('') }
    )
  }, [messageText, activeConversationId, sendMessage, socket])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMessageText(e.target.value)
      emitTypingStart()
    },
    [emitTypingStart]
  )

  // Group messages by date
  const groupedMessages: { date: string; messages: typeof messages }[] = []
  let lastDate = ''
  for (const msg of messages) {
    const date = new Date(msg.createdAt).toDateString()
    if (date !== lastDate) {
      groupedMessages.push({ date: msg.createdAt, messages: [msg] })
      lastDate = date
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg)
    }
  }

  // Check if the other user in active conversation is typing
  const isOtherUserTyping = activeConversation?.otherUser
    ? typingUsers.has(activeConversation.otherUser.id)
    : false

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="relative">
          <DoodleSpiral className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
          <h1 className="text-2xl font-extrabold text-primary-dark dark:text-white tracking-tight font-display">
            Messages
          </h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-0.5">
            Chat with landlords, tenants, and property managers
          </p>
        </div>
        <Button onClick={() => setShowNewConversation(true)} className="gap-1.5">
          <Plus size={16} />
          <span className="hidden sm:inline">New Message</span>
        </Button>
      </div>

      {/* Main chat container */}
      <Card className="flex-1 flex overflow-hidden !p-0">
        {/* Left panel -- conversation list */}
        <div
          className={cn(
            'w-full md:w-80 lg:w-96 border-r border-border/60 dark:border-[#252a3a]/60 flex flex-col',
            showMobileThread ? 'hidden md:flex' : 'flex'
          )}
        >
          {/* Search */}
          <div className="p-3 border-b border-border/60 dark:border-[#252a3a]/60">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted dark:text-gray-500"
              />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-surface dark:bg-[#0c0e1a] border border-border/60 dark:border-[#252a3a]/60 text-primary-dark dark:text-white placeholder:text-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 dark:focus:ring-blue-500/30"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {convosLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-[#252a3a]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 dark:bg-[#252a3a] rounded w-3/4" />
                      <div className="h-2.5 bg-gray-200 dark:bg-[#252a3a] rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <EmptyState preset="general" title="No conversations yet" description="Start a chat and your conversations will appear here." compact />
            ) : (
              filteredConversations.map((convo: Conversation) => {
                const isActive = convo.id === activeConversationId
                const isOwnMessage = convo.lastMessage?.senderId === userId
                const otherUserId = convo.otherUser?.id
                const isOnline = otherUserId ? onlineUsers.has(otherUserId) : false

                return (
                  <button
                    key={convo.id}
                    onClick={() => handleSelectConversation(convo.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface dark:hover:bg-[#0c0e1a]/60',
                      isActive && 'bg-primary/5 dark:bg-blue-500/10'
                    )}
                  >
                    {/* Avatar with online dot */}
                    <div className="relative flex-shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light dark:from-blue-600 dark:to-blue-400 text-white text-xs font-bold">
                        {getInitials(convo.otherUser?.firstName, convo.otherUser?.lastName)}
                      </div>
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-[#161927]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-primary-dark dark:text-white truncate">
                          {convo.otherUser
                            ? `${convo.otherUser.firstName} ${convo.otherUser.lastName}`
                            : 'Unknown User'}
                        </span>
                        {convo.lastMessage && (
                          <span className="text-[10px] text-muted dark:text-gray-500 flex-shrink-0 ml-2">
                            {formatMessageTime(convo.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      {convo.propertyTitle && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Building2 size={10} className="text-muted dark:text-gray-500 flex-shrink-0" />
                          <span className="text-[10px] text-muted dark:text-gray-500 truncate">
                            {convo.propertyTitle}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-muted dark:text-gray-400 truncate">
                          {convo.lastMessage
                            ? `${isOwnMessage ? 'You: ' : ''}${convo.lastMessage.text}`
                            : 'No messages yet'}
                        </p>
                        {convo.unreadCount > 0 && (
                          <span className="ml-2 flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary dark:bg-blue-600 text-white text-[10px] font-bold">
                            {convo.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right panel -- message thread */}
        <div
          className={cn(
            'flex-1 flex flex-col',
            !showMobileThread ? 'hidden md:flex' : 'flex'
          )}
        >
          {activeConversation ? (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 dark:border-[#252a3a]/60 flex-shrink-0">
                <button
                  onClick={handleBackToList}
                  className="md:hidden text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="relative flex-shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light dark:from-blue-600 dark:to-blue-400 text-white text-xs font-bold">
                    {getInitials(
                      activeConversation.otherUser?.firstName,
                      activeConversation.otherUser?.lastName
                    )}
                  </div>
                  {activeConversation.otherUser && onlineUsers.has(activeConversation.otherUser.id) && (
                    <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-green-500 ring-2 ring-white dark:ring-[#161927]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white truncate">
                    {activeConversation.otherUser
                      ? `${activeConversation.otherUser.firstName} ${activeConversation.otherUser.lastName}`
                      : 'Unknown User'}
                  </p>
                  {activeConversation.otherUser && onlineUsers.has(activeConversation.otherUser.id) ? (
                    <p className="text-[11px] text-green-500 truncate">Online</p>
                  ) : activeConversation.propertyTitle ? (
                    <p className="text-[11px] text-muted dark:text-gray-500 truncate flex items-center gap-1">
                      <Building2 size={10} />
                      {activeConversation.propertyTitle}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted dark:text-gray-500 truncate">Offline</p>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    {/* Date separator */}
                    <div className="flex items-center justify-center my-4">
                      <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-500">
                        {formatDateHeader(group.date)}
                      </span>
                    </div>

                    {group.messages.map((msg) => {
                      const isMine = msg.senderId === userId

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            'flex mb-1.5',
                            isMine ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <div
                            className={cn(
                              'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
                              isMine
                                ? 'bg-primary dark:bg-blue-600 text-white rounded-br-md'
                                : 'bg-surface dark:bg-[#0c0e1a] text-primary-dark dark:text-gray-200 rounded-bl-md'
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                            <p
                              className={cn(
                                'text-[10px] mt-1',
                                isMine
                                  ? 'text-white/60'
                                  : 'text-muted dark:text-gray-500'
                              )}
                            >
                              {formatFullTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Typing indicator */}
              {isOtherUserTyping && (
                <div className="px-4 pb-1 flex-shrink-0">
                  <p className="text-xs text-muted dark:text-gray-400 italic animate-pulse">
                    {activeConversation.otherUser?.firstName ?? 'User'} is typing...
                  </p>
                </div>
              )}

              {/* Message input */}
              <div className="border-t border-border/60 dark:border-[#252a3a]/60 p-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-surface dark:bg-[#0c0e1a] border border-border/60 dark:border-[#252a3a]/60 text-primary-dark dark:text-white placeholder:text-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 dark:focus:ring-blue-500/30"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!messageText.trim() || sendMessage.isPending}
                    className="h-10 w-10 !p-0 rounded-xl"
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* Empty state -- no conversation selected */
            <div className="relative flex-1 flex flex-col items-center justify-center overflow-hidden px-6">
              <IconWatermark icon={MessageCircle} className="left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rotate-[-8deg]" />
              <EmptyState
                preset="general"
                title="Select a conversation"
                description="Choose a chat from the list or start a new message."
                action={{ label: 'New Message', onClick: () => setShowNewConversation(true) }}
                compact
              />
            </div>
          )}
        </div>
      </Card>

      {/* New conversation modal */}
      <NewConversationModal
        open={showNewConversation}
        onClose={() => setShowNewConversation(false)}
        onCreated={(id) => {
          setShowNewConversation(false)
          setActiveConversationId(id)
          setShowMobileThread(true)
        }}
        currentUserId={userId}
      />
    </div>
  )
}

// --- New Conversation Modal ---

function NewConversationModal({
  open,
  onClose,
  onCreated,
  currentUserId,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
  currentUserId: string
}) {
  const [search, setSearch] = useState('')
  const { data: usersData } = useChatUsers()
  const createConversation = useCreateConversation()

  const allUsers = usersData?.items ?? []
  const filteredUsers = allUsers.filter((u) => {
    if (u.id === currentUserId) return false
    if (!search) return true
    const name = `${u.firstName} ${u.lastName}`.toLowerCase()
    const email = u.email.toLowerCase()
    return name.includes(search.toLowerCase()) || email.includes(search.toLowerCase())
  })

  const handleSelectUser = (participantId: string) => {
    createConversation.mutate(
      { participantId },
      {
        onSuccess: (convo) => {
          onCreated(convo.id)
        },
      }
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="New Conversation">
      <div className="space-y-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted dark:text-gray-500"
          />
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-surface dark:bg-[#0c0e1a] border border-border/60 dark:border-[#252a3a]/60 text-primary-dark dark:text-white placeholder:text-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 dark:focus:ring-blue-500/30"
          />
        </div>

        <div className="max-h-72 overflow-y-auto space-y-1">
          {filteredUsers.length === 0 ? (
            <EmptyState preset="search" compact />
          ) : (
            filteredUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => handleSelectUser(u.id)}
                disabled={createConversation.isPending}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface dark:hover:bg-[#0c0e1a] transition-colors text-left"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light dark:from-blue-600 dark:to-blue-400 text-white text-xs font-bold flex-shrink-0">
                  {getInitials(u.firstName, u.lastName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white truncate">
                    {u.firstName} {u.lastName}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted dark:text-gray-500 truncate">
                      {u.email}
                    </span>
                    <Badge variant="muted" className="text-[10px]">
                      {u.activeRole.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
