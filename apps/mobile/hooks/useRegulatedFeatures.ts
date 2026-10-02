import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { parseRegulatedFeatureStatus, type RegulatedFeatureKey } from '../../../packages/shared/regulatedFeatures'
import { DEFAULT_SIGNUP_ROLES, parseSignupRoles } from '../../../packages/shared/productScope'

// Regulated features the operator has enabled (see apps/api config/regulatedFeatures.ts).
export function useRegulatedFeatures() {
  return useQuery({
    queryKey: ['platform-features'],
    queryFn: async () => {
      const status = parseRegulatedFeatureStatus(await api.get<unknown>('/platform/features'))
      if (!status) throw new Error('Incomplete platform feature response')
      return status
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** true/false once known; undefined while loading or unavailable, which callers must treat as not enabled. */
export function useRegulatedFeatureEnabled(...anyOf: RegulatedFeatureKey[]): boolean | undefined {
  const { data } = useRegulatedFeatures()
  return data ? anyOf.some(key => data[key]) : undefined
}

/** Account types sign-up accepts, from the API; the phase defaults until it answers. */
export function useSignupRoles(): string[] {
  const { data } = useQuery({
    queryKey: ['platform-features', 'signup-roles'],
    queryFn: async () => parseSignupRoles(await api.get<unknown>('/platform/features')),
    staleTime: 5 * 60 * 1000,
  })
  return data ?? [...DEFAULT_SIGNUP_ROLES]
}
