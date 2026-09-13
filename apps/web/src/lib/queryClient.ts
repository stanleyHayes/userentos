import { QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } },
})

export const querySessionKey = (state: ReturnType<typeof useAuthStore.getState>) =>
  JSON.stringify([state.sessionId ?? null, state.user?.id ?? null, state.isAuthenticated, state.user?.activeRole ?? null])

// Clear synchronously before subscribers render the new account/role. The keyed
// provider also remounts observers and local form state against the empty cache.
const unsubscribe = useAuthStore.subscribe((state, previous) => {
  if (querySessionKey(state) !== querySessionKey(previous)) queryClient.clear()
})
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); queryClient.clear() })
