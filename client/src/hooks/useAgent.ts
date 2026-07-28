import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export type LeadStatus = 'new' | 'contacted' | 'viewing' | 'applied' | 'closed' | 'lost'
export type ViewingStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled'
export type CommissionStatus = 'pending' | 'paid'

export interface AgentLead {
  id: string
  propertyId: string
  contactName: string
  contactPhone: string
  contactEmail?: string
  message?: string
  status: LeadStatus
  propertyTitle: string | null
  createdAt: string
}

export interface AgentViewing {
  id: string
  propertyId: string
  viewerName: string
  viewerPhone: string
  date: string
  time: string
  status: ViewingStatus
  propertyTitle: string | null
  notes?: string
  createdAt?: string
}

export interface AgentCommission {
  id: string
  description: string
  amount: number
  status: CommissionStatus
  propertyId?: string
  leadId?: string
  agreementId?: string
  createdAt: string
  paidAt?: string
}

export interface AgentCommissionsResponse {
  items: AgentCommission[]
  summary: { pending: number; paid: number; count: number }
}

/* ============================ LEADS ============================ */

/** The agent's lead inbox, newest first. Optional status/property filter. */
export function useAgentLeads(filter: { status?: LeadStatus | ''; propertyId?: string } = {}) {
  const params = new URLSearchParams()
  if (filter.status) params.set('status', filter.status)
  if (filter.propertyId) params.set('propertyId', filter.propertyId)
  const qs = params.toString()
  return useQuery({
    queryKey: ['agent', 'leads', filter.status ?? '', filter.propertyId ?? ''],
    queryFn: () => api.get<{ items: AgentLead[] }>(`/agent/leads${qs ? `?${qs}` : ''}`),
  })
}

/** POST /agent/leads/property/:propertyId — express interest in a listing. */
export function useCreateLead() {
  return useMutation({
    mutationFn: ({ propertyId, message }: { propertyId: string; message?: string }) =>
      api.post<AgentLead>(`/agent/leads/property/${propertyId}`, { ...(message ? { message } : {}) }),
    onError: (e: Error) => toast.error(e.message),
  })
}

/** PATCH /agent/leads/:id — advance a lead through the pipeline. */
export function useUpdateLeadStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      api.patch<AgentLead>(`/agent/leads/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'leads'] })
      toast.success('Lead updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ============================ VIEWINGS ============================ */

/** Viewings as the agent (default) or as the requester (?asRequester=true). */
export function useAgentViewings(filter: { status?: ViewingStatus | ''; asRequester?: boolean } = {}) {
  const params = new URLSearchParams()
  if (filter.status) params.set('status', filter.status)
  if (filter.asRequester) params.set('asRequester', 'true')
  const qs = params.toString()
  return useQuery({
    queryKey: ['agent', 'viewings', filter.status ?? '', filter.asRequester ? 'requester' : 'agent'],
    queryFn: () => api.get<{ items: AgentViewing[] }>(`/agent/viewings${qs ? `?${qs}` : ''}`),
  })
}

/** POST /agent/viewings/property/:propertyId — request a viewing slot. */
export function useRequestViewing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ propertyId, ...body }: { propertyId: string; leadId?: string; date: string; time: string; notes?: string }) =>
      api.post<AgentViewing>(`/agent/viewings/property/${propertyId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'viewings'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** PATCH /agent/viewings/:id — confirm/complete/cancel (requester may only cancel). */
export function useUpdateViewingStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Exclude<ViewingStatus, 'requested'> }) =>
      api.patch<AgentViewing>(`/agent/viewings/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'viewings'] })
      toast.success('Viewing updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ============================ COMMISSIONS ============================ */

/** The agent's commissions plus the pending/paid summary. */
export function useAgentCommissions() {
  return useQuery({
    queryKey: ['agent', 'commissions'],
    queryFn: () => api.get<AgentCommissionsResponse>('/agent/commissions'),
  })
}

/** POST /agent/commissions — record earnings on a closed deal. */
export function useCreateCommission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { description: string; amount: number; propertyId?: string; leadId?: string; agreementId?: string }) =>
      api.post<AgentCommission>('/agent/commissions', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'commissions'] })
      toast.success('Commission recorded')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** PATCH /agent/commissions/:id/paid — mark a commission paid. */
export function useMarkCommissionPaid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch<AgentCommission>(`/agent/commissions/${id}/paid`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'commissions'] })
      toast.success('Commission marked paid')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
