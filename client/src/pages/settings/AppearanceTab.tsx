import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { useUpdateSettings } from '@/hooks/useApi'
import { useThemeStore } from '@/stores/themeStore'
import { Sun, Moon, Monitor, Palette, Globe, Check, Sparkles } from 'lucide-react'
import { useOnboardingStore } from '@/stores/onboardingStore'

const languages = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'tw', label: 'Twi', native: 'Twi' },
  { code: 'ga', label: 'Ga', native: 'Ga' },
  { code: 'ee', label: 'Ewe', native: 'Ewe' },
]

export function AppearanceTab() {
  const { i18n } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const updateSettings = useUpdateSettings()
  const { user } = useAuthStore()
  const resetTour = useOnboardingStore((s) => s.resetTour)
  const startTour = useOnboardingStore((s) => s.startTour)

  function handleReplayTour() {
    if (!user?.activeRole) return
    resetTour(user.activeRole)
    startTour(user.activeRole)
  }

  const themeOptions = [
    { value: 'light' as const, label: 'Light', desc: 'Clean & bright', icon: <Sun size={20} /> },
    { value: 'dark' as const, label: 'Dark', desc: 'Easy on the eyes', icon: <Moon size={20} /> },
    { value: 'system' as const, label: 'System', desc: 'Match your OS', icon: <Monitor size={20} /> },
  ]

  return (
    <div className="space-y-5">
      {/* Theme */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-2 mb-5">
            <Palette size={16} className="text-primary dark:text-blue-400" />
            <h3 className="text-sm font-bold text-primary-dark dark:text-white">Theme</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setTheme(opt.value); updateSettings.mutate({ theme: opt.value }) }}
                className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  theme === opt.value
                    ? 'border-primary dark:border-blue-500 bg-primary/5 dark:bg-blue-500/10 shadow-sm'
                    : 'border-border/60 dark:border-[#252a3a]/60 hover:border-primary/40 dark:hover:border-blue-500/40'
                }`}
              >
                {theme === opt.value && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary dark:bg-blue-500 flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  theme === opt.value ? 'bg-primary/15 dark:bg-blue-500/20 text-primary dark:text-blue-400' : 'bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-500'
                }`}>
                  {opt.icon}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">{opt.label}</p>
                  <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Onboarding tour replay */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-primary-dark dark:text-white">Onboarding tour</h3>
                <p className="text-xs text-muted dark:text-gray-500 mt-0.5">
                  Replay Ama&apos;s walkthrough for your current role.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReplayTour}
              disabled={!user?.activeRole}
            >
              Replay tour
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-2 mb-5">
            <Globe size={16} className="text-primary dark:text-blue-400" />
            <h3 className="text-sm font-bold text-primary-dark dark:text-white">Language</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { i18n.changeLanguage(lang.code); updateSettings.mutate({ language: lang.code }) }}
                className={`relative flex items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all ${
                  i18n.language === lang.code
                    ? 'border-primary dark:border-blue-500 bg-primary/5 dark:bg-blue-500/10'
                    : 'border-border/60 dark:border-[#252a3a]/60 hover:border-primary/40 dark:hover:border-blue-500/40'
                }`}
              >
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">{lang.label}</p>
                  <p className="text-[10px] text-muted dark:text-gray-500">{lang.native}</p>
                </div>
                {i18n.language === lang.code && (
                  <Check size={16} className="text-primary dark:text-blue-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
