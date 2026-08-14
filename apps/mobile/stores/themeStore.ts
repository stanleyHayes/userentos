import { create } from 'zustand'
import { Appearance } from 'react-native'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  resolved: () => 'light' | 'dark'
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  setMode: (mode) => set({ mode }),
  resolved: () => {
    const { mode } = get()
    if (mode === 'system') {
      return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
    }
    return mode
  },
}))
