import { useThemeStore } from '../stores/themeStore'

const lightColors = {
  primary: '#1e3a5f',
  primaryLight: '#2d5a8e',
  primaryDark: '#0f1f33',
  secondary: '#f59e0b',
  accent: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  muted: '#6b7280',
  surface: '#f8fafc',
  border: '#e2e8f0',
  white: '#ffffff',
  text: '#1e293b',
  textLight: '#64748b',
  card: '#ffffff',
  background: '#f8fafc',
}

const darkColors: typeof lightColors = {
  primary: '#60a5fa',
  primaryLight: '#93c5fd',
  primaryDark: '#e2e8f0',
  secondary: '#f59e0b',
  accent: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  muted: '#94a3b8',
  surface: '#0f172a',
  border: '#334155',
  white: '#1e293b',
  text: '#e2e8f0',
  textLight: '#94a3b8',
  card: '#1e293b',
  background: '#0f172a',
}

// Static export for backward compatibility
export const colors = lightColors

export type ThemeColors = typeof lightColors

export function useThemeColors(): ThemeColors {
  const resolved = useThemeStore((s) => s.resolved())
  return resolved === 'dark' ? darkColors : lightColors
}

export function useIsDark(): boolean {
  return useThemeStore((s) => s.resolved()) === 'dark'
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
}
