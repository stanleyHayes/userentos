import { create } from 'zustand'

export interface InAppToast {
  id: string
  title: string
  body: string
  type: 'message' | 'payment' | 'dispute' | 'agreement' | 'system'
  /** Route to navigate to when tapped */
  route?: string
  timestamp: number
  persistent?: boolean
}

interface NotificationState {
  unreadMessages: number
  toasts: InAppToast[]

  setUnreadMessages: (count: number) => void
  incrementUnread: () => void
  clearUnread: () => void
  reset: () => void
  pushToast: (toast: Omit<InAppToast, 'id' | 'timestamp'>) => void
  dismissToast: (id: string) => void
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  unreadMessages: 0,
  toasts: [],

  setUnreadMessages: (count) => set({ unreadMessages: count }),
  incrementUnread: () => set((s) => ({ unreadMessages: s.unreadMessages + 1 })),
  clearUnread: () => set({ unreadMessages: 0 }),
  reset: () => set({ unreadMessages: 0, toasts: [] }),

  pushToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id, timestamp: Date.now() }],
    }))
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
