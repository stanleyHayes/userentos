import { test, expect } from '@playwright/test'
import { createSessionQueryClient, querySessionKey } from '../../apps/mobile/lib/sessionQueryClient'

type State = { sessionVersion: number; roleVersion: number; profilePending?: boolean; isAuthenticated: boolean; token: string; user: { id: string; activeRole: string; firstName: string } | null }
function fixture(initial: Partial<State> = {}) {
  let state: State = { sessionVersion: 1, roleVersion: 0, isAuthenticated: true, token: 'original', user: { id: 'owner', activeRole: 'tenant', firstName: 'Original' }, ...initial }
  let listener!: (next: State, previous: State) => void
  const { queryClient } = createSessionQueryClient(callback => { listener = callback; return () => {} })
  return { queryClient, update: (change: Partial<State>) => { const previous = state; state = { ...state, ...change }; listener(state, previous) } }
}

for (const change of ['login', 'logout', 'role']) test(`mobile ${change} removes cached private data and fetches the replacement`, async () => {
  const { queryClient, update } = fixture()
  await queryClient.fetchQuery({ queryKey: ['wallet'], queryFn: async () => 'previous private balance' })
  if (change === 'login') update({ sessionVersion: 2 })
  if (change === 'logout') update({ sessionVersion: 2, isAuthenticated: false, user: null })
  // authStore bumps roleVersion on a role switch (lib/authState.ts).
  if (change === 'role') update({ roleVersion: 1, user: { id: 'owner', activeRole: 'landlord', firstName: 'Original' } })
  expect(queryClient.getQueryData(['wallet'])).toBeUndefined()
  expect(await queryClient.fetchQuery({ queryKey: ['wallet'], queryFn: async () => 'replacement balance' })).toBe('replacement balance')
  queryClient.clear()
})

test('mobile session change cancels an old query and its late response cannot repopulate cache', async () => {
  const { queryClient, update } = fixture()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const old = queryClient.fetchQuery({ queryKey: ['private-profile'], queryFn: async () => { await gate; return 'old private profile' } })
  const rejected = expect(old).rejects.toBeDefined()
  update({ sessionVersion: 2 })
  release()
  await rejected
  expect(queryClient.getQueryData(['private-profile'])).toBeUndefined()
  expect(await queryClient.fetchQuery({ queryKey: ['private-profile'], queryFn: async () => 'new profile' })).toBe('new profile')
  queryClient.clear()
})

test('mobile token rotation and ordinary profile updates retain current-session cache', async () => {
  const { queryClient, update } = fixture()
  queryClient.setQueryData(['wallet'], 'current balance')
  update({ token: 'rotated' })
  update({ user: { id: 'owner', activeRole: 'tenant', firstName: 'Updated' } })
  expect(queryClient.getQueryData(['wallet'])).toBe('current balance')
  queryClient.clear()
})

test('the profile arriving for a cold start that opened without it keeps the screens and refetches them', async () => {
  const pending = { sessionVersion: 1, roleVersion: 0, isAuthenticated: true, token: 'original', profilePending: true, user: { id: 'owner', activeRole: '', firstName: '' } }
  const loaded = { ...pending, profilePending: false, user: { id: 'owner', activeRole: 'landlord', firstName: 'Ama' } }
  const { queryClient, update } = fixture(pending)
  queryClient.setQueryData(['agreements'], 'fetched before the role was known')
  update(loaded)
  // Same key: the root stack (keyed by it) does not remount, so the screen a
  // notification tap opened stays; its data is marked for refetch instead.
  expect(querySessionKey(loaded)).toBe(querySessionKey(pending))
  expect(queryClient.getQueryData(['agreements'])).toBe('fetched before the role was known')
  expect(queryClient.getQueryState(['agreements'])?.isInvalidated).toBe(true)
  queryClient.clear()
})
