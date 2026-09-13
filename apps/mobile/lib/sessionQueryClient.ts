import { QueryClient } from '@tanstack/react-query'

type SessionState = {
  sessionVersion: number
  isAuthenticated: boolean
  user: { id: string; activeRole?: string } | null
}
export const querySessionKey = (state: SessionState) =>
  JSON.stringify([state.sessionVersion, state.user?.id ?? null, state.isAuthenticated, state.user?.activeRole ?? null])

export function createSessionQueryClient(subscribe: (listener: (state: SessionState, previous: SessionState) => void) => () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } },
  })
  const unsubscribe = subscribe((state, previous) => {
    if (querySessionKey(state) !== querySessionKey(previous)) queryClient.clear()
  })
  return { queryClient, unsubscribe }
}
