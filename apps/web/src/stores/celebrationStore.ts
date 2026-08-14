import { create } from 'zustand'

export type CelebrationType = 'payment' | 'badge' | 'milestone'

export interface CelebrationState {
  /** Active burst id (changes each time `celebrate` is called, used as React key) */
  burstId: number
  type: CelebrationType | null
  message: string | null
  celebrate: (type: CelebrationType, message?: string) => void
  dismiss: () => void
}

export const useCelebrationStore = create<CelebrationState>()((set) => ({
  burstId: 0,
  type: null,
  message: null,

  celebrate: (type, message) =>
    set((state) => ({
      burstId: state.burstId + 1,
      type,
      message: message ?? null,
    })),

  dismiss: () =>
    set({ type: null, message: null }),
}))
