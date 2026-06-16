import { create } from 'zustand'
import type { UserRole } from '@/types'

const STORAGE_KEY = 'rentos-onboarding'

type CompletedTours = Partial<Record<UserRole, boolean>>

interface PersistedState {
  completedTours: CompletedTours
}

interface OnboardingState {
  /** Map of role -> whether the tour for that role has been completed/skipped. */
  completedTours: CompletedTours
  /** Currently visible step index (0-based). */
  currentStep: number
  /** Whether the tour overlay is currently visible. */
  isActive: boolean
  /** Role whose script is currently being shown (null when inactive). */
  activeRole: UserRole | null

  startTour: (role: UserRole) => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => void
  completeTour: (role: UserRole) => void
  resetTour: (role: UserRole) => void
}

function loadPersisted(): PersistedState {
  if (typeof window === 'undefined') return { completedTours: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { completedTours: {} }
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return { completedTours: parsed.completedTours ?? {} }
  } catch {
    return { completedTours: {} }
  }
}

function savePersisted(state: PersistedState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable (private mode quota etc.) — silently ignore.
  }
}

const initial = loadPersisted()

export const useOnboardingStore = create<OnboardingState>()((set, get) => ({
  completedTours: initial.completedTours,
  currentStep: 0,
  isActive: false,
  activeRole: null,

  startTour: (role) => {
    // Don't restart if it's already running for the same role.
    const { isActive, activeRole } = get()
    if (isActive && activeRole === role) return
    set({ isActive: true, activeRole: role, currentStep: 0 })
  },

  nextStep: () =>
    set((state) => ({ currentStep: state.currentStep + 1 })),

  prevStep: () =>
    set((state) => ({ currentStep: Math.max(0, state.currentStep - 1) })),

  skipTour: () => {
    const { activeRole } = get()
    if (activeRole) {
      // Mark as completed so we don't nag again on next login.
      const completedTours = { ...get().completedTours, [activeRole]: true }
      savePersisted({ completedTours })
      set({ completedTours, isActive: false, activeRole: null, currentStep: 0 })
    } else {
      set({ isActive: false, currentStep: 0 })
    }
  },

  completeTour: (role) => {
    const completedTours = { ...get().completedTours, [role]: true }
    savePersisted({ completedTours })
    set({ completedTours, isActive: false, activeRole: null, currentStep: 0 })
  },

  resetTour: (role) => {
    const completedTours = { ...get().completedTours }
    delete completedTours[role]
    savePersisted({ completedTours })
    set({ completedTours })
  },
}))
