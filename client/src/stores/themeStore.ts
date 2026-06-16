import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: () => 'light' | 'dark'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },
      resolvedTheme: () => {
        const { theme } = get()
        if (theme === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
        return theme
      },
    }),
    { name: 'rentos-theme' }
  )
)

export function applyTheme(theme: Theme) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme

  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

// Initialize on load
if (typeof window !== 'undefined') {
  const stored = JSON.parse(localStorage.getItem('rentos-theme') || '{}')
  applyTheme(stored?.state?.theme || 'system')

  // Listen for system changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = useThemeStore.getState().theme
    if (current === 'system') applyTheme('system')
  })
}
