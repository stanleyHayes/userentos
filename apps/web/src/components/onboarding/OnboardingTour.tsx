/**
 * Full-screen onboarding tour overlay narrated by Ama.
 *
 * Behaviour:
 *   - Renders only when the onboarding store is active.
 *   - Backdrop is dimmed but does NOT dismiss on click (intentional — too easy
 *     to lose progress accidentally).
 *   - Esc key and the explicit Skip / Close buttons dismiss the tour.
 *   - Each step may target a CSS selector. If found, a soft spotlight
 *     highlights it and the card anchors near it. If not found, the card
 *     centres on screen.
 *   - The selector is re-resolved on every step + on window resize, so
 *     navigation between steps still works even if the page reflows.
 *   - Mobile-first: at narrow widths the card sits at the bottom of the
 *     viewport with Ama beside it.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { tourScripts, type TourStep } from './tourScripts'
import { Ama } from './Ama'

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

const SPOTLIGHT_PADDING = 10
const CARD_WIDTH = 380
const CARD_GAP = 24

function resolveSpotlight(selector: string | undefined): SpotlightRect | null {
  if (!selector || typeof document === 'undefined') return null
  try {
    const el = document.querySelector(selector)
    if (!el) return null
    const rect = (el as Element).getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return null
    return {
      top: rect.top - SPOTLIGHT_PADDING,
      left: rect.left - SPOTLIGHT_PADDING,
      width: rect.width + SPOTLIGHT_PADDING * 2,
      height: rect.height + SPOTLIGHT_PADDING * 2,
    }
  } catch {
    // Invalid selector — degrade gracefully to centred card.
    return null
  }
}

export function OnboardingTour() {
  const isActive = useOnboardingStore((s) => s.isActive)
  const activeRole = useOnboardingStore((s) => s.activeRole)
  const currentStep = useOnboardingStore((s) => s.currentStep)
  const nextStep = useOnboardingStore((s) => s.nextStep)
  const prevStep = useOnboardingStore((s) => s.prevStep)
  const skipTour = useOnboardingStore((s) => s.skipTour)
  const completeTour = useOnboardingStore((s) => s.completeTour)

  const script = useMemo(() => {
    if (!activeRole) return [] as TourStep[]
    return tourScripts[activeRole] ?? []
  }, [activeRole])

  const totalSteps = script.length
  // Clamp index so navigating past the end never crashes.
  const stepIndex = Math.min(Math.max(0, currentStep), Math.max(0, totalSteps - 1))
  const step = script[stepIndex]

  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)
  // Track the card height in state via a callback ref + ResizeObserver so we
  // never read ref.current during render (react-hooks/refs).
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null)
  const [cardHeight, setCardHeight] = useState<number | null>(null)
  const cardRef = useCallback((node: HTMLDivElement | null) => {
    setCardEl(node)
    if (node) setCardHeight(node.offsetHeight)
  }, [])

  useLayoutEffect(() => {
    if (!cardEl || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setCardHeight(entry.contentRect.height)
    })
    ro.observe(cardEl)
    return () => ro.disconnect()
  }, [cardEl])

  // Recompute the spotlight rect whenever the step or viewport changes.
  useLayoutEffect(() => {
    if (!isActive || !step) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clearing derived DOM-rect state when the tour deactivates or has no step is the intended sync; there is no prop-compare pattern that fits a measurement of an external DOM target.
      setSpotlight(null)
      return
    }
    const update = () => setSpotlight(resolveSpotlight(step.target))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isActive, step])

  // Esc to dismiss.
  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        skipTour()
      } else if (e.key === 'ArrowRight') {
        if (stepIndex < totalSteps - 1) nextStep()
      } else if (e.key === 'ArrowLeft') {
        if (stepIndex > 0) prevStep()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, stepIndex, totalSteps, skipTour, nextStep, prevStep])

  // Lock body scroll while tour is active.
  useEffect(() => {
    if (!isActive) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isActive])

  if (!isActive || !activeRole || !step) return null

  const isLastStep = stepIndex === totalSteps - 1
  const isFirstStep = stepIndex === 0

  function handleNext() {
    if (isLastStep && activeRole) {
      completeTour(activeRole)
    } else {
      nextStep()
    }
  }

  // Compute a card position anchored to the spotlight when possible.
  // We pick the side with the most room. Falls back to centred when no target.
  const cardStyle = (() => {
    if (typeof window === 'undefined') return { centre: true } as const
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cardEstHeight = cardHeight ?? 260

    if (!spotlight) return { centre: true } as const

    // On narrow screens, always dock the card to the bottom for predictability.
    if (vw < 640) {
      return {
        centre: false,
        top: vh - cardEstHeight - 16,
        left: 12,
        width: vw - 24,
      } as const
    }

    const spaceRight = vw - (spotlight.left + spotlight.width)
    const spaceLeft = spotlight.left
    const spaceBelow = vh - (spotlight.top + spotlight.height)
    const spaceAbove = spotlight.top

    // Prefer right, then left, then below, then above.
    if (spaceRight >= CARD_WIDTH + CARD_GAP) {
      const top = Math.min(
        Math.max(spotlight.top, 16),
        vh - cardEstHeight - 16,
      )
      return {
        centre: false,
        top,
        left: spotlight.left + spotlight.width + CARD_GAP,
        width: CARD_WIDTH,
      } as const
    }
    if (spaceLeft >= CARD_WIDTH + CARD_GAP) {
      const top = Math.min(
        Math.max(spotlight.top, 16),
        vh - cardEstHeight - 16,
      )
      return {
        centre: false,
        top,
        left: spotlight.left - CARD_WIDTH - CARD_GAP,
        width: CARD_WIDTH,
      } as const
    }
    if (spaceBelow >= cardEstHeight + CARD_GAP) {
      const left = Math.min(
        Math.max(spotlight.left + spotlight.width / 2 - CARD_WIDTH / 2, 16),
        vw - CARD_WIDTH - 16,
      )
      return {
        centre: false,
        top: spotlight.top + spotlight.height + CARD_GAP,
        left,
        width: CARD_WIDTH,
      } as const
    }
    if (spaceAbove >= cardEstHeight + CARD_GAP) {
      const left = Math.min(
        Math.max(spotlight.left + spotlight.width / 2 - CARD_WIDTH / 2, 16),
        vw - CARD_WIDTH - 16,
      )
      return {
        centre: false,
        top: spotlight.top - cardEstHeight - CARD_GAP,
        left,
        width: CARD_WIDTH,
      } as const
    }
    // No room nearby — centre.
    return { centre: true } as const
  })()

  return (
    <div
      className="fixed inset-0 z-[1000] tour-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tour"
    >
      {/* Backdrop with optional cutout. Pointer events stay on this layer so
          clicks behind the overlay are blocked, but a click on the backdrop
          itself does NOT dismiss (per spec). */}
      {spotlight ? (
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <mask id="tourMask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="14"
                ry="14"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(8, 12, 25, 0.78)"
            mask="url(#tourMask)"
          />
          {/* Spotlight ring */}
          <rect
            x={spotlight.left}
            y={spotlight.top}
            width={spotlight.width}
            height={spotlight.height}
            rx="14"
            ry="14"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            className="tour-ring"
          />
        </svg>
      ) : (
        <div className="absolute inset-0 bg-[rgba(8,12,25,0.78)] backdrop-blur-[1px]" />
      )}

      {/* Card + Ama */}
      <div
        ref={cardRef}
        className={
          cardStyle.centre
            ? 'absolute inset-0 flex items-end sm:items-center justify-center p-4 pointer-events-none'
            : 'absolute pointer-events-none'
        }
        style={
          cardStyle.centre
            ? undefined
            : {
                top: cardStyle.top,
                left: cardStyle.left,
                width: cardStyle.width,
              }
        }
      >
        <div
          className={`pointer-events-auto w-full ${cardStyle.centre ? 'max-w-md' : ''} tour-card-in`}
        >
          <div className="relative flex flex-col sm:flex-row items-stretch gap-3">
            {/* Ama */}
            <div className="hidden sm:flex shrink-0 self-end">
              <Ama
                expression={step.expression ?? (step.target ? 'pointing' : 'happy')}
                size={140}
              />
            </div>

            {/* Speech card */}
            <div className="relative flex-1 rounded-2xl bg-white dark:bg-[#161927] border border-gray-200 dark:border-[#252a3a] shadow-2xl overflow-hidden">
              {/* Brand stripe */}
              <div className="h-1 bg-gradient-to-r from-[#1e3a5f] via-[#f59e0b] to-[#1e3a5f]" />

              <div className="p-5 sm:p-6">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#f59e0b]">
                      <Sparkles size={12} />
                      Step {stepIndex + 1} of {totalSteps}
                    </span>
                  </div>
                  <button
                    onClick={skipTour}
                    aria-label="Skip onboarding tour"
                    className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 transition-colors -mt-1 -mr-1 p-1 rounded-md"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Mobile Ama (compact) */}
                <div className="flex sm:hidden items-end justify-start mb-2 -mt-1">
                  <Ama
                    expression={step.expression ?? (step.target ? 'pointing' : 'happy')}
                    size={84}
                  />
                </div>

                {/* Title + body */}
                <h2 className="font-display font-extrabold text-lg sm:text-xl text-[#1e3a5f] dark:text-white tracking-tight">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {step.body}
                </p>

                {/* Progress dots */}
                <div className="flex items-center gap-1.5 mt-5">
                  {script.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === stepIndex
                          ? 'w-6 bg-[#f59e0b]'
                          : i < stepIndex
                          ? 'w-1.5 bg-[#1e3a5f] dark:bg-blue-400'
                          : 'w-1.5 bg-gray-200 dark:bg-[#252a3a]'
                      }`}
                    />
                  ))}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between gap-2 mt-5">
                  <button
                    onClick={skipTour}
                    className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    Skip tour
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={prevStep}
                      disabled={isFirstStep}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-[#1e3a5f] dark:text-gray-200 bg-gray-100 dark:bg-[#0c0e1a] border border-gray-200 dark:border-[#252a3a] hover:border-[#1e3a5f] dark:hover:border-gray-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={14} />
                      Back
                    </button>
                    <button
                      onClick={handleNext}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap text-white bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 dark:bg-[#f59e0b] dark:text-[#0c0e1a] dark:hover:bg-[#f59e0b]/90 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                      {isLastStep ? 'Got it' : 'Next'}
                      {!isLastStep && <ChevronRight size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes tourFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes tourCardIn {
          0% { transform: translateY(10px) scale(0.98); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes tourRingPulse {
          0%, 100% { stroke-opacity: 0.85; }
          50% { stroke-opacity: 0.35; }
        }
        .tour-fade-in {
          animation: tourFadeIn 0.25s ease-out both;
        }
        .tour-card-in {
          animation: tourCardIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .tour-ring {
          animation: tourRingPulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
