import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/* ================================================================
   Landlord operations — expenses + vacancy (server/src/routes/landlord.ts)
   ================================================================ */

export type ExpenseType = 'repair' | 'levy' | 'utility' | 'tax' | 'insurance' | 'other'

export interface LandlordExpense {
  id: string
  propertyId: string
  propertyTitle: string | null
  type: ExpenseType
  amount: number
  date: string
  note?: string
}

export interface ExpensesSummary {
  total: number
  months: number
  byType: { type: ExpenseType; total: number }[]
  byProperty: { propertyId: string; propertyTitle: string | null; total: number }[]
  byMonth: { month: string; total: number }[]
}

export interface ExpensesResponse {
  items: LandlordExpense[]
  summary: ExpensesSummary
}

export interface CreateExpenseBody {
  propertyId: string
  type: ExpenseType
  amount: number
  date: string
  note?: string
}

export function useLandlordExpenses(params?: { propertyId?: string; months?: number }) {
  const query = new URLSearchParams()
  if (params?.propertyId) query.set('propertyId', params.propertyId)
  if (params?.months) query.set('months', String(params.months))
  const qs = query.toString()
  return useQuery({
    queryKey: ['landlord-expenses', params],
    queryFn: () => api.get<ExpensesResponse>(`/landlord/expenses${qs ? `?${qs}` : ''}`),
  })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateExpenseBody) => api.post<LandlordExpense>('/landlord/expenses', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landlord-expenses'] }),
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/landlord/expenses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landlord-expenses'] }),
  })
}

/* ─── Vacancy ─── */

export interface VacancyItem {
  id: string
  title: string
  city: string | null
  status: 'occupied' | 'vacant'
  daysListed: number
  rentAmount: number
}

export interface VacancySummary {
  total: number
  occupied: number
  vacant: number
  occupancyRate: number
  avgDaysVacant: number
  vacantRentValue: number
}

export interface VacancyResponse {
  items: VacancyItem[]
  summary: VacancySummary
}

export function useVacancy() {
  return useQuery({
    queryKey: ['landlord-vacancy'],
    queryFn: () => api.get<VacancyResponse>('/landlord/vacancy'),
  })
}
