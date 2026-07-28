import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export interface WorkerAvailability {
  monday: string[]
  tuesday: string[]
  wednesday: string[]
  thursday: string[]
  friday: string[]
  saturday: string[]
  sunday: string[]
}

export interface MyWorkerProfile {
  _id: string
  userId?: string
  name: string
  trades: string[]
  location: string
  status: string
  rating: number
  reviewCount?: number
  completedJobs: number
  hourlyRate?: number
  verificationLevel?: string
  availability?: WorkerAvailability
}

export interface WorkerEarnings {
  totalEarned: number
  totalPaid: number
  pendingPayout: number
  completedJobs: number
  activeJobs: number
  rating: number
  reviewCount: number
  byType: { type: string; jobs: number; total: number }[]
  byMonth: { month: string; jobs: number; total: number }[]
}

/** The logged-in user's own worker profile (null when they haven't created one). */
export function useMyWorker() {
  return useQuery({
    queryKey: ['workers', 'me'],
    queryFn: async () => {
      const data = await api.get<{ worker: MyWorkerProfile | null }>('/workers/me')
      return data.worker
    },
  })
}

/** Earnings dashboard numbers for the logged-in worker. */
export function useMyEarnings(enabled = true) {
  return useQuery({
    queryKey: ['workers', 'me', 'earnings'],
    queryFn: () => api.get<WorkerEarnings>('/workers/me/earnings'),
    enabled,
  })
}

/** PATCH /workers/:id — own profile updates (availability, rates, status, ...). */
export function useUpdateWorker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<MyWorkerProfile>(`/workers/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers', 'me'] })
      toast.success('Profile updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
