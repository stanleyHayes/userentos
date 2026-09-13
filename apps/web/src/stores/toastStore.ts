import { create } from 'zustand'
import toast from 'react-hot-toast'

// Preserve existing callers while sending every notification to the same renderer.
interface ToastState {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>()(() => ({
  addToast: (message, type = 'info') => {
    if (type === 'error') toast.error(message)
    else if (type === 'success') toast.success(message)
    else toast(message)
  },
  removeToast: (id) => toast.dismiss(id),
}))
