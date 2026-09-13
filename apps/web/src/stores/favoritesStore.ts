import { create } from 'zustand'
import { api } from '@/lib/api'
import { getSessionGeneration, useAuthStore } from '@/stores/authStore'

interface FavoritesState {
  ids: string[]
  loaded: boolean
  toggling: Set<string>
  load: () => Promise<void>
  toggle: (propertyId: string) => Promise<void>
  isFavorited: (propertyId: string) => boolean
  clear: () => void
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ids: [],
  loaded: false,
  toggling: new Set(),

  load: async () => {
    const generation = getSessionGeneration()
    try {
      const data = await api.get<{ propertyIds: string[] }>('/properties/favorites/me')
      if (generation === getSessionGeneration()) set({ ids: data.propertyIds ?? [], loaded: true })
    } catch {
      if (generation === getSessionGeneration()) set({ loaded: true })
    }
  },

  toggle: async (propertyId: string) => {
    const generation = getSessionGeneration()
    const { ids, toggling } = get()
    if (toggling.has(propertyId)) return

    const wasFavorited = ids.includes(propertyId)
    const optimisticIds = wasFavorited
      ? ids.filter((x) => x !== propertyId)
      : [...ids, propertyId]

    // Optimistic update + mark as toggling
    set({ ids: optimisticIds, toggling: new Set(toggling).add(propertyId) })

    try {
      const result = await api.post<{ favorited: boolean }>(`/properties/${propertyId}/favorite`, {})

      if (generation !== getSessionGeneration()) return
      // Only update if the server disagrees with our optimistic state
      const currentIds = get().ids
      const serverSaysFavorited = result.favorited
      const weThinkFavorited = currentIds.includes(propertyId)

      if (serverSaysFavorited !== weThinkFavorited) {
        set({
          ids: serverSaysFavorited
            ? [...currentIds, propertyId]
            : currentIds.filter((x) => x !== propertyId),
        })
      }
    } catch {
      if (generation !== getSessionGeneration()) return
      // Revert optimistic update on error
      set({
        ids: wasFavorited
          ? [...get().ids.filter((x) => x !== propertyId), propertyId]
          : get().ids.filter((x) => x !== propertyId),
      })
    } finally {
      if (generation === getSessionGeneration()) set((s) => {
        const next = new Set(s.toggling)
        next.delete(propertyId)
        return { toggling: next }
      })
    }
  },

  isFavorited: (propertyId: string) => get().ids.includes(propertyId),

  clear: () => set({ ids: [], loaded: false, toggling: new Set() }),
}))

let favoriteSession = getSessionGeneration()
const unsubscribeFavorites = useAuthStore.subscribe(() => {
  const next = getSessionGeneration()
  if (next !== favoriteSession) {
    favoriteSession = next
    useFavoritesStore.getState().clear()
  }
})
if (import.meta.hot) import.meta.hot.dispose(unsubscribeFavorites)
