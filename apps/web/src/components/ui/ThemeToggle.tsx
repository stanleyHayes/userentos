import { useRef } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { setTheme, resolvedTheme } = useThemeStore()
  const isDark = resolvedTheme() === 'dark'
  const btnRef = useRef<HTMLButtonElement>(null)

  function toggle(_e: React.MouseEvent) {
    const newTheme = isDark ? 'light' : 'dark'

    // Fallback for browsers without View Transitions API
    if (
      !document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setTheme(newTheme)
      return
    }

    // Get click coordinates (center of button)
    const rect = btnRef.current!.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2

    // Calculate the max radius needed to cover the entire viewport
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )

    // Set CSS custom properties for the animation origin
    document.documentElement.style.setProperty('--theme-toggle-x', `${x}px`)
    document.documentElement.style.setProperty('--theme-toggle-y', `${y}px`)
    document.documentElement.style.setProperty('--theme-toggle-r', `${maxRadius}px`)

    const transition = document.startViewTransition(() => {
      setTheme(newTheme)
    })

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 500,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
      // `ready` rejects with AbortError when the transition is skipped (rapid re-toggle or hidden tab) — swallow it.
    }).catch(() => {})
  }

  return (
    <button
      ref={btnRef}
      onClick={toggle}
      className={`relative p-2 rounded-lg transition-all ${className}`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <div className="relative w-[18px] h-[18px]">
        <Sun
          size={18}
          className={`absolute inset-0 text-secondary transition-all duration-300 ${
            isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'
          }`}
        />
        <Moon
          size={18}
          className={`absolute inset-0 text-muted hover:text-primary-dark transition-all duration-300 ${
            isDark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
          }`}
        />
      </div>
    </button>
  )
}
