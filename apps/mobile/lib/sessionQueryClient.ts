import { QueryClient } from '@tanstack/react-query'

type SessionState = {
  sessionVersion: number
  isAuthenticated: boolean
  /** Bumped on a real role change (lib/authState.ts). */
  roleVersion: number
  /** A restored session is still waiting for its profile. */
  profilePending?: boolean
  user: { id: string } | null
}
/**
 * Keys the root screen stack and the query cache: a new key remounts every
 * screen and drops cached private data. The role counts through
 * roleVersion, not the role itself, so a profile arriving for a session that
 * opened without one (placeholder role '') changes nothing: the screen a
 * cold-start notification tap opened stays.
 */
export const querySessionKey = (state: SessionState) =>
  JSON.stringify([state.sessionVersion, state.user?.id ?? null, state.isAuthenticated, state.roleVersion])

export function createSessionQueryClient(subscribe: (listener: (state: SessionState, previous: SessionState) => void) => () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } },
  })
  const unsubscribe = subscribe((state, previous) => {
    if (querySessionKey(state) !== querySessionKey(previous)) queryClient.clear()
    // Answers fetched before the profile arrived may have been for no role:
    // refetch what is on screen, without remounting it.
    else if (previous.profilePending && !state.profilePending) void queryClient.invalidateQueries()
  })
  return { queryClient, unsubscribe }
}
