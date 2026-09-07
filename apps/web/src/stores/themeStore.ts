import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

/**
 * The surface finish, independent of light/dark.
 *
 * Both are variable overrides on <html>, so all four combinations are real
 * states the app has to look right in — a skin is not a second dark mode.
 */
export type Skin = 'neu' | 'clay'

export const SKINS: { id: Skin; label: string; blurb: string }[] = [
  { id: 'neu', label: 'Neumorphism', blurb: 'Soft, embossed surfaces lit from the top left. The RentOS default.' },
  { id: 'clay', label: 'Claymorphism', blurb: 'Rounder, thicker surfaces with a sculpted, pressed-clay edge.' },
]

const VALID_SKINS: Skin[] = ['neu', 'clay']

interface ThemeState {
  theme: Theme
  skin: Skin
  setTheme: (theme: Theme) => void
  setSkin: (skin: Skin) => void
  resolvedTheme: () => 'light' | 'dark'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      skin: 'neu',
      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },
      setSkin: (skin) => {
        set({ skin })
        applySkin(skin)
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

/**
 * The default skin writes no attribute at all, so the base :root tokens apply
 * untouched — a user who never opens the picker pays nothing for the feature.
 */
export function applySkin(skin: Skin) {
  if (skin === 'neu') document.documentElement.removeAttribute('data-skin')
  else document.documentElement.setAttribute('data-skin', skin)
}

export function applyTheme(theme: Theme) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme

  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

// Initialize on load
if (typeof window !== 'undefined') {
  // Corrupted storage must never white-screen the app at import time.
  let storedTheme: unknown
  try {
    storedTheme = JSON.parse(localStorage.getItem('rentos-theme') || '{}')?.state?.theme
  } catch {
    localStorage.removeItem('rentos-theme')
  }
  const validThemes: Theme[] = ['light', 'dark', 'system']
  applyTheme(validThemes.includes(storedTheme as Theme) ? (storedTheme as Theme) : 'system')

  let storedSkin: unknown
  try {
    storedSkin = JSON.parse(localStorage.getItem('rentos-theme') || '{}')?.state?.skin
  } catch {
    // applyTheme already cleared the key if it was unparseable.
  }
  applySkin(VALID_SKINS.includes(storedSkin as Skin) ? (storedSkin as Skin) : 'neu')

  // Listen for system changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = useThemeStore.getState().theme
    if (current === 'system') applyTheme('system')
  })
}
