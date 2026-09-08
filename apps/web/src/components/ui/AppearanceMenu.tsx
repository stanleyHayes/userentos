import { useEffect, useId, useRef, useState } from 'react'
import { Palette, Check, X, Sun, Moon, Monitor, Layers, Blocks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore, SKINS, type Skin } from '@/stores/themeStore'

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
] as const

const SKIN_ICON: Record<Skin, typeof Layers> = { neu: Layers, clay: Blocks }

/**
 * A hint of the finish, drawn rather than photographed.
 *
 * The preview tile below shows the real thing — this sits behind it at low
 * opacity so the two cards are still distinguishable at a glance when the
 * shadows themselves are subtle (which they are, in light mode).
 */
function SkinWatermark({ skin }: { skin: Skin }) {
  return (
    <svg
      viewBox="0 0 120 120" aria-hidden="true" focusable="false"
      className="pointer-events-none absolute -right-5 -top-3 h-24 w-24 fill-none stroke-current opacity-10"
      strokeWidth={2}
    >
      {skin === 'neu' && (
        <>
          <rect x="26" y="26" width="64" height="64" rx="18" transform="rotate(-20 58 58)" />
          <rect x="37" y="37" width="42" height="42" rx="12" transform="rotate(-20 58 58)" />
          <path d="M20 87c13 19 53 23 75-3" />
        </>
      )}
      {skin === 'clay' && (
        <>
          <rect x="20" y="27" width="66" height="66" rx="25" transform="rotate(-15 53 60)" fill="currentColor" fillOpacity=".25" />
          <circle cx="88" cy="28" r="17" />
          <circle cx="87" cy="93" r="10" />
          <path d="M33 47q5-13 21-13" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

/**
 * Appearance: light/dark and the surface finish, which are independent choices.
 *
 * The finish is a set of CSS variable overrides on <html>, so every surface in
 * the app follows without knowing a skin exists. Each card carries a live
 * preview rendered with data-skin-preview, which means the swatch is the actual
 * shadow stack rather than a picture of it — if a skin regresses, the picker
 * shows the regression.
 */
export function AppearanceMenu({ className = '' }: { className?: string }) {
  const { theme, setTheme, skin, setSkin } = useThemeStore()
  const [open, setOpen] = useState(false)
  const id = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Escape closes and returns focus to the trigger, so keyboard users are not
  // dropped at the top of the document.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'focus-ring neumorphic-icon flex items-center rounded-xl p-2 text-muted transition-colors hover:text-primary-dark dark:text-gray-400 dark:hover:text-white',
          className,
        )}
        aria-label="Appearance"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="Appearance"
      >
        <Palette size={18} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-labelledby={`${id}-title`}
            /*
             * Pinned to the viewport on mobile, to the trigger from sm up.
             *
             * `absolute right-0` anchors to the TRIGGER's right edge, and the
             * trigger sits mid-header on a phone with several buttons to its
             * right — so a panel this wide ran off the left of the screen.
             * Below sm it is fixed between two gutters instead, clearing the
             * h-16 header — the same treatment the notification and user menus
             * in Header.tsx already use, so all three behave alike.
             */
            className="fixed left-2 right-2 top-16 z-50 rounded-2xl border border-border/60 bg-white p-4 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] dark:border-[#252a3a]/60 dark:bg-[#161927] dark:shadow-black/40"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 id={`${id}-title`} className="text-sm font-extrabold text-primary-dark dark:text-white">Appearance</h2>
                <p className="mt-0.5 text-xs text-muted dark:text-gray-500">Saved as you choose.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-primary-dark dark:hover:text-white"
                aria-label="Close appearance settings"
              >
                <X size={15} />
              </button>
            </div>

            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted dark:text-gray-500">Theme</p>
            <div role="group" aria-label="Theme" className="mb-4 grid grid-cols-3 gap-1.5">
              {THEMES.map(({ id: value, label, icon: Icon }) => {
                const selected = theme === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    aria-pressed={selected}
                    className={cn(
                      'focus-ring flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-bold transition-colors',
                      selected
                        ? 'border-primary/50 bg-primary/10 text-primary dark:border-sky-300/50 dark:bg-blue-500/15 dark:text-blue-300'
                        : 'border-border/70 text-muted hover:border-primary/30 hover:text-primary-dark dark:border-[#252a3a] dark:text-gray-400 dark:hover:text-white',
                    )}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                )
              })}
            </div>

            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted dark:text-gray-500">Surface style</p>
            <div role="group" aria-label="Surface style" className="grid gap-2 sm:grid-cols-2">
              {SKINS.map((option) => {
                const selected = skin === option.id
                const Icon = SKIN_ICON[option.id]
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSkin(option.id)}
                    aria-pressed={selected}
                    className={cn(
                      'focus-ring relative overflow-hidden rounded-xl border p-3 text-left transition-colors',
                      selected
                        ? 'border-primary/50 bg-primary/[0.06] dark:border-sky-300/50 dark:bg-blue-500/10'
                        : 'border-border/70 hover:border-primary/30 dark:border-[#252a3a] dark:hover:border-sky-300/30',
                    )}
                  >
                    <span className="text-primary dark:text-sky-300"><SkinWatermark skin={option.id} /></span>

                    {/* The swatch is the skin itself, not a drawing of it. */}
                    <span
                      data-skin-preview={option.id}
                      className="relative mb-2.5 flex h-12 items-center gap-2 rounded-xl px-2.5"
                      style={{
                        background: 'var(--rentos-card)',
                        boxShadow: 'var(--rentos-shadow-soft)',
                      }}
                    >
                      <span className="neumorphic-icon grid h-7 w-7 shrink-0 place-items-center rounded-xl text-primary dark:text-sky-300">
                        <Icon size={14} />
                      </span>
                      <span className="flex-1 space-y-1">
                        <span className="block h-1.5 w-4/5 rounded-full bg-primary-dark/35 dark:bg-white/35" />
                        <span className="block h-1 w-3/5 rounded-full bg-muted/35 dark:bg-white/20" />
                      </span>
                    </span>

                    <span className="relative flex items-center gap-1.5">
                      <span className="flex-1 text-xs font-extrabold text-primary-dark dark:text-white">{option.label}</span>
                      {selected && <Check size={14} className="text-primary dark:text-sky-300" />}
                    </span>
                    <span className="relative mt-0.5 block text-[11px] leading-snug text-muted dark:text-gray-500">{option.blurb}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
