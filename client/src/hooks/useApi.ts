import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToastStore } from '@/stores/toastStore'
import type {
  PaginatedResponse,
  Property,
  RentalAgreement,
  Payment,
  SavingsPlan,
  Wallet,
  Dispute,
  LegalArticle,
  Notification,
  User,
  AuthResponse,
  Conversation,
  ChatMessage,
  Investment,
  InvestmentOption,
  Loan,
  CreditScore,
  TenantProfile,
  ProfileAccess,
  Application,
  BlogPost,
  UserSettings,
  Invitation,
  Permission,
  UserRole,
  BadgeCounts,
  SubscriptionPackage,
  FinancingOffer,
  FinancingApplication,
  FinancingContract,
  Employer,
  Employment,
  DeductionMandate,
  PayrollRun,
  InsuranceProduct,
  InsurancePolicy,
  InsuranceCategory,
  Achievement,
  PaymentStreak,
  StreakLeaderboardEntry,
  MoveOut,
  MoveOutDamage,
} from '@/types'

// Auth
export function useLogin() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<AuthResponse>('/auth/login', body),
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: { email: string; phone: string; password: string; firstName: string; lastName: string; role: string }) =>
      api.post<AuthResponse>('/auth/register', body),
  })
}

// Users
export function useCurrentUser() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<User>('/users/me') })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<User>) => api.patch<User>('/users/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

// Properties
export function useProperties(params?: { status?: string; type?: string; city?: string; mine?: boolean }) {
  const query = new URLSearchParams()
  if (params?.mine) query.set('mine', 'true')
  if (params?.status) query.set('status', params.status)
  if (params?.type) query.set('type', params.type)
  if (params?.city) query.set('city', params.city)
  const qs = query.toString()
  return useQuery({
    queryKey: ['properties', params],
    queryFn: () => api.get<PaginatedResponse<Property>>(`/properties${qs ? `?${qs}` : ''}`),
  })
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: ['property', id],
    queryFn: () => api.get<Property>(`/properties/${id}`),
    enabled: !!id,
  })
}

export function useCreateProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Property>) => api.post<Property>('/properties', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  })
}

export function useUpdateProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Property> & { id: string }) =>
      api.patch<Property>(`/properties/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  })
}

export function useDeleteProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/properties/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  })
}

export function usePropertyRecommendations() {
  return useQuery({
    queryKey: ['property-recommendations'],
    queryFn: () => api.get<Property[]>('/properties/recommendations/for-me'),
  })
}

export function useUploadPropertyImages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) => {
      const formData = new FormData()
      files.forEach((file) => formData.append('images', file))
      return api.upload<{ images: string[] }>(`/properties/${id}/images`, formData)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] })
      qc.invalidateQueries({ queryKey: ['property'] })
    },
  })
}

export function useUploadProfilePhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('photo', file)
      return api.upload<{ profileImage: string }>('/users/me/photo', formData)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

// Agreements
export function useAgreements() {
  return useQuery({
    queryKey: ['agreements'],
    queryFn: () => api.get<PaginatedResponse<RentalAgreement>>('/agreements'),
  })
}

export function useAgreement(id: string) {
  return useQuery({
    queryKey: ['agreement', id],
    queryFn: () => api.get<RentalAgreement>(`/agreements/${id}`),
    enabled: !!id,
  })
}

export function useCreateAgreement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<RentalAgreement>) => api.post<RentalAgreement>('/agreements', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agreements'] }),
  })
}

export function useSignAgreement() {
  const qc = useQueryClient()
  return useMutation({
    // The typed legal name is recorded as the e-signature.
    mutationFn: ({ id, signatureName }: { id: string; signatureName: string }) =>
      api.post<RentalAgreement>(`/agreements/${id}/sign`, { signatureName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agreements'] }),
  })
}

export function useUpdateAgreement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<RentalAgreement> & { id: string }) =>
      api.patch<RentalAgreement>(`/agreements/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agreements'] }),
  })
}

// Payments
export interface PaymentsQuery {
  page?: number
  pageSize?: number
  status?: string
  method?: string
  search?: string
  sort?: 'date' | 'amount'
  order?: 'asc' | 'desc'
}

export function usePayments(params: PaymentsQuery = {}) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.pageSize) search.set('pageSize', String(params.pageSize))
  if (params.status) search.set('status', params.status)
  if (params.method) search.set('method', params.method)
  if (params.search) search.set('search', params.search)
  if (params.sort) search.set('sort', params.sort)
  if (params.order) search.set('order', params.order)
  const qs = search.toString()
  return useQuery({
    queryKey: ['payments', params],
    queryFn: () => api.get<PaginatedResponse<Payment>>(`/payments${qs ? `?${qs}` : ''}`),
    placeholderData: (prev) => prev, // keep previous page visible while fetching the next
  })
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: ['payment', id],
    queryFn: () => api.get<Payment>(`/payments/${id}`),
    enabled: !!id,
  })
}

export function useCreatePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { agreementId: string; amount: number; method: string; phone?: string }) =>
      api.post<{ payment: Payment; instructions?: string }>('/payments', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  })
}

// Savings / RentGuard
export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<Wallet>('/savings/wallet'),
  })
}

export function useDeposit() {
  const qc = useQueryClient()
  return useMutation({
    // Deposit now initiates a verified payment collection — returns
    // { payment, instructions }; the wallet is credited on confirmation.
    mutationFn: (body: { amount: number; method: string; phone?: string }) =>
      api.post<{ payment?: { reference: string }; instructions?: string }>('/savings/wallet/deposit', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet'] }),
  })
}

export function useWithdraw() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { amount: number; method: string }) =>
      api.post<{ wallet: Wallet }>('/savings/wallet/withdraw', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet'] }),
  })
}

export function useSavingsPlans() {
  return useQuery({
    queryKey: ['savings-plans'],
    queryFn: () => api.get<PaginatedResponse<SavingsPlan>>('/savings/plans'),
  })
}

export function useCreateSavingsPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<SavingsPlan>) => api.post<SavingsPlan>('/savings/plans', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings-plans'] }),
  })
}

export function useContributeToSavings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, amount }: { planId: string; amount: number }) =>
      api.post(`/savings/plans/${planId}/contribute`, { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savings-plans'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}

// Investments
export function useInvestmentOptions() {
  return useQuery({
    queryKey: ['investment-options'],
    queryFn: () => api.get<InvestmentOption[]>('/investments/options'),
  })
}

export function useInvestments() {
  return useQuery({
    queryKey: ['investments'],
    queryFn: () => api.get<Investment[]>('/investments'),
  })
}

export function useCreateInvestment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { type: string; amount: number; tenure: number; partnerId: string; riskDisclosureAccepted: boolean }) =>
      api.post<Investment>('/investments', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['investments'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}

export function useWithdrawInvestment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Investment>(`/investments/${id}/withdraw`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['investments'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}

// Loans
export function useLoans() {
  return useQuery({
    queryKey: ['loans'],
    queryFn: () => api.get<Loan[]>('/loans'),
  })
}

export function useApplyForLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { agreementId: string; amount: number; tenure: number; reason: string }) =>
      api.post<Loan>('/loans/apply', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans'] }),
  })
}

export function useDisburseLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Loan>(`/loans/${id}/disburse`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}

export function useRepayLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.post<Loan>(`/loans/${id}/repay`, { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}

// Disputes
// Server defaults to pageSize 20 — callers that render the full list plus stats
// must pass a larger pageSize or they'd silently see (and compute on) a subset.
export function useDisputes(params?: { pageSize?: number }) {
  const qs = params?.pageSize ? `?pageSize=${params.pageSize}` : ''
  return useQuery({
    queryKey: ['disputes', params?.pageSize],
    queryFn: () => api.get<PaginatedResponse<Dispute>>(`/disputes${qs}`),
  })
}

export function useDispute(id: string) {
  return useQuery({
    queryKey: ['disputes', id],
    queryFn: () => api.get<Dispute>(`/disputes/${id}`),
    enabled: !!id,
  })
}

export function useCreateDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Dispute>) => api.post<Dispute>('/disputes', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disputes'] }),
  })
}

export function useUpdateDisputeStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: string; mediationNotes?: string; resolution?: string }) =>
      api.patch<Dispute>(`/disputes/${id}/status`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disputes'] }),
  })
}

export function useUploadDisputeEvidence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) => {
      const formData = new FormData()
      files.forEach((file) => formData.append('files', file))
      return api.upload<Dispute>(`/disputes/${id}/evidence`, formData)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disputes'] }),
  })
}

// Legal
export function useLegalArticles(params?: { category?: string; search?: string }) {
  const query = new URLSearchParams()
  if (params?.category) query.set('category', params.category)
  if (params?.search) query.set('search', params.search)
  const qs = query.toString()
  return useQuery({
    queryKey: ['legal', params],
    queryFn: () => api.get<PaginatedResponse<LegalArticle>>(`/legal${qs ? `?${qs}` : ''}`),
  })
}

export function useLegalArticle(id: string) {
  return useQuery({
    queryKey: ['legal-article', id],
    queryFn: () => api.get<LegalArticle>(`/legal/${id}`),
    enabled: !!id,
  })
}

// Notifications
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<PaginatedResponse<Notification>>('/notifications'),
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.patch('/notifications/read-all', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// Analytics
export function useMyAnalytics() {
  return useQuery({
    queryKey: ['analytics', 'me'],
    queryFn: () => api.get<Record<string, unknown>>('/analytics/me'),
  })
}

export function usePlatformAnalytics() {
  return useQuery({
    queryKey: ['analytics', 'platform'],
    queryFn: () => api.get<Record<string, unknown>>('/analytics/platform'),
  })
}

export interface RegistryStats {
  totalViews: number
  uniqueViewers: number
  topProperties: { propertyId: string; title: string; views: number }[]
  dailyTrend: { date: string; views: number }[]
}

export function useRegistryStats(enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'registry-stats'],
    queryFn: () => api.get<RegistryStats>('/public/properties/stats'),
    enabled,
  })
}

// Users (admin)
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<PaginatedResponse<User>>('/users'),
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; phone: string; password: string; firstName: string; lastName: string; roles: UserRole[]; permissions?: Permission[] }) =>
      api.post<User>('/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUserPermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; permissions?: Permission[]; roles?: UserRole[] }) =>
      api.patch<User>(`/users/${id}/permissions`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

// Invitations
export function useInvitations() {
  return useQuery({
    queryKey: ['invitations'],
    queryFn: () => api.get<Invitation[]>('/invitations'),
  })
}

export function useSendInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; roles: UserRole[]; permissions?: Permission[] }) =>
      api.post<Invitation>('/invitations', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  })
}

export function useRevokeInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<void>(`/invitations/${id}/revoke`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  })
}

export function useResendInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Invitation>(`/invitations/${id}/resend`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  })
}

// Credit Score
export function useMyCreditScore() {
  return useQuery({
    queryKey: ['credit-score'],
    queryFn: () => api.get<CreditScore>('/credit/me'),
  })
}

export function useUserCreditScore(userId: string) {
  return useQuery({
    queryKey: ['credit-score', userId],
    queryFn: () => api.get<CreditScore>(`/credit/${userId}`),
    enabled: !!userId,
  })
}

// Tenant Profile
export function useMyTenantProfile() {
  return useQuery({
    queryKey: ['tenant-profile'],
    queryFn: () => api.get<TenantProfile>('/tenant-profile/me'),
  })
}

export function useUpdateTenantProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<TenantProfile>) => api.patch<TenantProfile>('/tenant-profile/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-profile'] }),
  })
}

export function useViewTenantProfile(userId: string) {
  return useQuery({
    queryKey: ['tenant-profile', userId],
    queryFn: () => api.get<TenantProfile>(`/tenant-profile/${userId}`),
    enabled: !!userId,
  })
}

// Profile Access
export function useProfileAccessRequests() {
  return useQuery({
    queryKey: ['profile-access'],
    queryFn: () => api.get<ProfileAccess[]>('/profile-access/requests'),
  })
}

export function useRequestProfileAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { tenantId: string; propertyId?: string; message?: string }) =>
      api.post<ProfileAccess>('/profile-access/request', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-access'] }),
  })
}

export function useRespondToProfileAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'deny' }) =>
      api.post<ProfileAccess>(`/profile-access/${id}/respond`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-access'] }),
  })
}

export function useRevokeProfileAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<ProfileAccess>(`/profile-access/${id}/revoke`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-access'] }),
  })
}

export function useCheckProfileAccess(tenantId: string) {
  return useQuery({
    queryKey: ['profile-access-check', tenantId],
    queryFn: () => api.get<{ hasAccess: boolean; status: string }>(`/profile-access/check/${tenantId}`),
    enabled: !!tenantId,
  })
}

// Applications
export function useApplications() {
  return useQuery({
    queryKey: ['applications'],
    queryFn: () => api.get<PaginatedResponse<Application>>('/applications'),
  })
}

export function useSubmitApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { propertyId: string; message: string; moveInDate: string; duration: number; offeredRent?: number }) =>
      api.post<Application>('/applications', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })
}

export function useRespondToApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action, landlordNotes }: { id: string; action: 'approve' | 'reject'; landlordNotes?: string }) =>
      api.post<Application>(`/applications/${id}/respond`, { action, landlordNotes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })
}

export function useWithdrawApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Application>(`/applications/${id}/withdraw`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })
}

// Blog
export function useBlogPosts(params?: { search?: string; tag?: string }) {
  const query = new URLSearchParams()
  if (params?.search) query.set('search', params.search)
  if (params?.tag) query.set('tag', params.tag)
  const qs = query.toString()
  return useQuery({
    queryKey: ['blog', params],
    queryFn: () => api.get<PaginatedResponse<BlogPost>>(`/blog${qs ? `?${qs}` : ''}`),
  })
}

export function useBlogPost(id: string) {
  return useQuery({
    queryKey: ['blog-post', id],
    queryFn: () => api.get<BlogPost>(`/blog/${id}`),
    enabled: !!id,
  })
}

export function useBlogPostBySlug(slug: string) {
  return useQuery({
    queryKey: ['blog-slug', slug],
    queryFn: () => api.get<BlogPost>(`/blog/slug/${slug}`),
    enabled: !!slug,
  })
}

export function useCreateBlogPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<BlogPost>) => api.post<BlogPost>('/blog', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog'] }),
  })
}

export function useUpdateBlogPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<BlogPost> & { id: string }) =>
      api.patch<BlogPost>(`/blog/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog'] }),
  })
}

export function useDeleteBlogPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/blog/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog'] }),
  })
}

// Documents
export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<{ items: Document[]; total: number }>('/documents'),
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) => api.upload<Document>('/documents', formData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useUploadDocumentVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) =>
      api.upload<Document>(`/documents/${id}/version`, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['document-versions'] })
    },
  })
}

export function useDocumentVersions(id: string) {
  return useQuery({
    queryKey: ['document-versions', id],
    queryFn: () => api.get<Document[]>(`/documents/${id}/versions`),
    enabled: !!id,
  })
}

export function useDocumentAudit(id: string) {
  return useQuery({
    queryKey: ['document-audit', id],
    queryFn: () => api.get<import('@/types').AuditLog[]>(`/documents/${id}/audit`),
    enabled: !!id,
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

// Chat / Messaging
export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/chat/conversations'),
    refetchInterval: 30000,
  })
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.get<PaginatedResponse<ChatMessage>>(`/chat/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, text }: { conversationId: string; text: string }) =>
      api.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, { text }),
    onSuccess: (message, variables) => {
      // Append the returned message to cache directly instead of refetching
      // (avoids race condition with socket event that also delivers this message)
      qc.setQueryData(
        ['messages', variables.conversationId],
        (old: { items: ChatMessage[] } | undefined) => {
          if (!old) return { items: [message] }
          const exists = old.items.some((m) => m.id === message.id)
          if (exists) return old
          return { ...old, items: [...old.items, message] }
        }
      )
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useMarkConversationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) =>
      api.patch(`/chat/conversations/${conversationId}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    },
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['unread-count'],
    queryFn: () => api.get<{ count: number }>('/chat/unread-count'),
    refetchInterval: 10000,
  })
}

// Chat-specific user search — server-side, requires a ≥2-char term, and never
// returns emails (directory-enumeration fix).
export function useChatUsers(search: string) {
  return useQuery({
    queryKey: ['chat-users', search],
    queryFn: () => api.get<{ items: { id: string; firstName: string; lastName: string; activeRole: string }[] }>(`/chat/users?search=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2,
    placeholderData: (prev) => prev,
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { participantId: string; propertyId?: string }) =>
      api.post<Conversation>('/chat/conversations', body),
    onSuccess: (newConvo) => {
      // Insert the new conversation into the cache immediately so the thread
      // header can display the user's name right away (avoids "Unknown User")
      qc.setQueryData<Conversation[]>(['conversations'], (old) => {
        if (!old) return [newConvo]
        const exists = old.some((c) => c.id === newConvo.id)
        if (exists) return old
        return [newConvo, ...old]
      })
    },
  })
}

// Badge Counts
export function useBadgeCounts() {
  return useQuery({
    queryKey: ['badge-counts'],
    queryFn: () => api.get<BadgeCounts>('/badges'),
    refetchInterval: 30000,
  })
}

// Push Notifications
export function useRegisterPushToken() {
  return useMutation({
    mutationFn: (body: { token: string; platform: string }) =>
      api.post('/push/register', body),
  })
}

export function useUnregisterPushToken() {
  return useMutation({
    mutationFn: (body: { token: string }) =>
      api.post('/push/unregister', body),
  })
}

// Settings
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<UserSettings>('/settings'),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<UserSettings>) => api.patch<UserSettings>('/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

// Policy Simulation
export function useSimulateRentCap() {
  return useMutation({
    mutationFn: (body: { maxRent: number; region: string }) =>
      api.post<Record<string, unknown>>('/simulation/rent-cap', body),
  })
}

export function useSimulateAdvanceLimit() {
  return useMutation({
    mutationFn: (body: { maxMonths: number }) =>
      api.post<Record<string, unknown>>('/simulation/advance-limit', body),
  })
}

export function useMarketHealth() {
  return useQuery({
    queryKey: ['market-health'],
    queryFn: () => api.get<Record<string, unknown>>('/simulation/market-health'),
  })
}

// Subscription Packages
export function useSubscriptionPackages() {
  return useQuery({
    queryKey: ['subscription-packages'],
    queryFn: () => api.get<{ items: SubscriptionPackage[]; total: number }>('/subscriptions/packages'),
  })
}

export function useAllSubscriptionPackages() {
  return useQuery({
    queryKey: ['subscription-packages-all'],
    queryFn: () => api.get<{ items: SubscriptionPackage[]; total: number }>('/subscriptions/packages/all'),
  })
}

export function useCreateSubscriptionPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<SubscriptionPackage>) => api.post<SubscriptionPackage>('/subscriptions/packages', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription-packages'] })
      qc.invalidateQueries({ queryKey: ['subscription-packages-all'] })
    },
  })
}

export function useUpdateSubscriptionPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<SubscriptionPackage> & { id: string }) =>
      api.patch<SubscriptionPackage>(`/subscriptions/packages/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription-packages'] })
      qc.invalidateQueries({ queryKey: ['subscription-packages-all'] })
    },
  })
}

export function useDeleteSubscriptionPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/subscriptions/packages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription-packages'] })
      qc.invalidateQueries({ queryKey: ['subscription-packages-all'] })
    },
  })
}

export function useMySubscription() {
  return useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => api.get<{
      package: SubscriptionPackage | null
      subscriptionStartDate: string | null
      subscriptionEndDate: string | null
      propertyCount: number
      maxProperties: number
      canAddProperty: boolean
    }>('/subscriptions/my-subscription'),
  })
}

export function useSubscribe() {
  const qc = useQueryClient()
  return useMutation({
    // Paid packages: returns { payment, instructions } — activation happens
    // server-side once the payment is verified (webhook/simulator finalize).
    mutationFn: (body: { packageId: string; method?: string; phone?: string }) =>
      api.post<{ payment?: { reference: string }; instructions?: string }>('/subscriptions/subscribe', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-subscription'] })
    },
  })
}

export function useAssignPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { userId: string; packageId: string }) => api.post('/subscriptions/assign', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['my-subscription'] })
    },
  })
}

// Insurance
export function useInsuranceProducts(params?: { category?: InsuranceCategory; all?: boolean }) {
  const query = new URLSearchParams()
  if (params?.category) query.set('category', params.category)
  if (params?.all) query.set('all', 'true')
  const qs = query.toString()
  return useQuery({
    queryKey: ['insurance-products', params],
    queryFn: () => api.get<{ items: InsuranceProduct[]; total: number }>(`/insurance/products${qs ? `?${qs}` : ''}`),
  })
}

export function useCreateInsuranceProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<InsuranceProduct>) =>
      api.post<InsuranceProduct>('/insurance/products', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insurance-products'] }),
  })
}

export function useUpdateInsuranceProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<InsuranceProduct> & { id: string }) =>
      api.patch<InsuranceProduct>(`/insurance/products/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insurance-products'] }),
  })
}

export function useMyPolicies() {
  return useQuery({
    queryKey: ['insurance-policies'],
    queryFn: () => api.get<{ items: InsurancePolicy[]; total: number }>('/insurance/policies'),
  })
}

export function useBuyPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { productId: string; agreementId?: string; propertyId?: string; termMonths?: number }) =>
      api.post<{ policy: InsurancePolicy; wallet: { balance: number } }>('/insurance/policies', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policies'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}

export function useFileClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; amount: number; description: string }) =>
      api.post<{ policy: InsurancePolicy; claim: unknown }>(`/insurance/policies/${id}/claim`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insurance-policies'] }),
  })
}

// Admin claims review

export interface InsuranceClaimReview {
  id: string
  filedAt: string
  amount: number
  status: 'pending' | 'approved' | 'rejected' | 'paid'
  description: string
  notes?: string
  payoutAmount?: number
  decidedBy?: string
  decidedAt?: string
  policyId: string
  policyNumber: string
  policyHolderId: string
  policyHolderName?: string
  policyHolderEmail?: string
  productId: string
  productName?: string
  providerName?: string
  category?: string
  coverageLimit?: number
}

export function useInsuranceClaims(params?: { status?: 'pending' | 'approved' | 'rejected' | 'paid' }) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  const qs = query.toString()
  return useQuery({
    queryKey: ['insurance-claims', params],
    queryFn: () => api.get<{ items: InsuranceClaimReview[]; total: number }>(`/insurance/claims${qs ? `?${qs}` : ''}`),
  })
}

export function useDecideInsuranceClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ policyId, claimId, ...body }: {
      policyId: string
      claimId: string
      decision: 'approved' | 'rejected'
      notes?: string
      payoutAmount?: number
    }) =>
      api.post<{ policy: InsurancePolicy; claim: InsuranceClaimReview }>(
        `/insurance/policies/${policyId}/claims/${claimId}/decide`,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-claims'] })
      qc.invalidateQueries({ queryKey: ['insurance-policies'] })
    },
  })
}

// Maintenance Requests
export interface MaintenanceRequest {
  id: string
  propertyId: string
  agreementId?: string
  tenantId: string
  landlordId: string
  title: string
  description: string
  category: 'plumbing' | 'electrical' | 'structural' | 'pest' | 'appliance' | 'security' | 'other'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'requested' | 'acknowledged' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  vendorId?: string
  vendorName?: string
  vendorPhone?: string
  scheduledDate?: string
  completedAt?: string
  cost?: number
  images: string[]
  notes: { text: string; by: string; at: string }[]
  propertyTitle?: string
  propertyAddress?: { street?: string; city?: string; region?: string }
  tenantName?: string
  tenantPhone?: string
  createdAt: string
  updatedAt: string
}

export function useMaintenanceRequests(params?: {
  status?: string
  propertyId?: string
  priority?: string
}, options?: { enabled?: boolean }) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.propertyId) query.set('propertyId', params.propertyId)
  if (params?.priority) query.set('priority', params.priority)
  const qs = query.toString()
  return useQuery({
    queryKey: ['maintenance', params],
    queryFn: () =>
      api.get<{ items: MaintenanceRequest[]; total: number }>(`/maintenance${qs ? `?${qs}` : ''}`),
    enabled: options?.enabled ?? true,
  })
}

export function useCreateMaintenanceRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      propertyId: string
      agreementId?: string
      title: string
      description: string
      category: MaintenanceRequest['category']
      priority: MaintenanceRequest['priority']
      images?: string[]
    }) => api.post<MaintenanceRequest>('/maintenance', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  })
}

export function useUpdateMaintenanceRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      status?: MaintenanceRequest['status']
      priority?: MaintenanceRequest['priority']
      vendorId?: string
      vendorName?: string
      vendorPhone?: string
      scheduledDate?: string
      cost?: number
    }) => api.patch<MaintenanceRequest>(`/maintenance/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  })
}

export function useCompleteMaintenance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; cost?: number; notes?: string }) =>
      api.post<MaintenanceRequest>(`/maintenance/${id}/complete`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  })
}

export function useAddMaintenanceNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.post<MaintenanceRequest>(`/maintenance/${id}/notes`, { text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  })
}

// Tenant Passport
export interface TenantPassportData {
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
    isVerified: boolean
    memberSince?: string
  } | null
  creditScore: {
    score: number
    factors: {
      paymentHistory: number
      savingsConsistency: number
      agreementCompliance: number
      disputeRecord: number
      accountAge: number
    } | null
    calculatedAt: string
  } | null
  payments: { total: number; completed: number; lifetimeTotalGhs: number; onTimePct: number }
  streak: { current: number; longest: number; lastPaymentDate?: string } | null
  agreements: {
    active: number
    past: number
    total: number
    noEvictionHistory: boolean
    onTimePaymentRatio: number
  }
  employment: { employer?: string; tenure?: string; salaryBand?: string } | null
  profile: { completionScore: number }
  references: { personal: number; professional: number }
  generatedAt: string
}

export function useMyPassportPreview(enabled = true) {
  return useQuery({
    queryKey: ['tenant-passport', 'me'],
    queryFn: () => api.get<TenantPassportData>('/tenant-passport/me/json'),
    // Non-tenants get a guaranteed 403 — let callers opt out instead of firing it.
    enabled,
  })
}

export function useGenerateShareLink() {
  return useMutation({
    mutationFn: () =>
      api.post<{ url: string; token: string; expiresAt: string }>('/tenant-passport/share', {}),
  })
}

export function useSharedPassport(token: string) {
  return useQuery({
    queryKey: ['tenant-passport', 'shared', token],
    queryFn: () => api.get<TenantPassportData>(`/tenant-passport/shared/${token}/json`),
    enabled: !!token,
    retry: false,
  })
}

// Achievements & Streaks
export function useMyAchievements() {
  return useQuery({
    queryKey: ['achievements', 'mine'],
    queryFn: () => api.get<{ items: Achievement[]; total: number }>('/achievements/mine'),
  })
}

export function useMyStreak() {
  return useQuery({
    queryKey: ['achievements', 'streak'],
    queryFn: () => api.get<PaymentStreak>('/achievements/streak'),
  })
}

export function useStreakLeaderboard() {
  return useQuery({
    queryKey: ['achievements', 'leaderboard'],
    queryFn: () => api.get<{ items: StreakLeaderboardEntry[]; total: number }>('/achievements/leaderboard'),
  })
}

// Feature Flags
export interface FeatureFlagAdmin {
  id: string
  key: string
  description: string
  enabled: boolean
  rolloutPct: number
  enabledForUserIds: string[]
  enabledForRoles: string[]
  disabledForUserIds: string[]
  createdAt?: string
  updatedAt?: string
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags', 'me'],
    queryFn: () => api.get<Record<string, boolean>>('/feature-flags/me'),
    staleTime: 60_000,
    gcTime: 60_000,
  })
}

export function useFeatureFlag(key: string): boolean {
  const { data } = useFeatureFlags()
  return !!data?.[key]
}

export function useAllFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags', 'all'],
    queryFn: () => api.get<{ items: FeatureFlagAdmin[]; total: number }>('/feature-flags'),
    staleTime: 30_000,
  })
}

export function useCreateFeatureFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<FeatureFlagAdmin> & { key: string }) =>
      api.post<FeatureFlagAdmin>('/feature-flags', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-flags'] }),
  })
}

export function useUpdateFeatureFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, ...body }: Partial<FeatureFlagAdmin> & { key: string }) =>
      api.patch<FeatureFlagAdmin>(`/feature-flags/${key}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-flags'] }),
  })
}

// Move-out lifecycle
export function useMoveOuts() {
  return useQuery({
    queryKey: ['move-outs'],
    queryFn: () => api.get<PaginatedResponse<MoveOut>>('/move-outs'),
  })
}

export function useMoveOut(id: string) {
  return useQuery({
    queryKey: ['move-out', id],
    queryFn: () => api.get<MoveOut>(`/move-outs/${id}`),
    enabled: Boolean(id),
  })
}

export function useInitiateMoveOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { agreementId: string; moveOutDate: string }) =>
      api.post<MoveOut>('/move-outs', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['move-outs'] })
      qc.invalidateQueries({ queryKey: ['agreements'] })
    },
  })
}

export function useScheduleInspection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, inspectionDate }: { id: string; inspectionDate: string }) =>
      api.post<MoveOut>(`/move-outs/${id}/schedule-inspection`, { inspectionDate }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['move-outs'] })
      qc.invalidateQueries({ queryKey: ['move-out', vars.id] })
    },
  })
}

export function useSubmitInspection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, inspectionNotes, damages }: { id: string; inspectionNotes?: string; damages: MoveOutDamage[] }) =>
      api.post<MoveOut>(`/move-outs/${id}/inspection`, { inspectionNotes, damages }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['move-outs'] })
      qc.invalidateQueries({ queryKey: ['move-out', vars.id] })
    },
  })
}

export function useDisputeMoveOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<MoveOut>(`/move-outs/${id}/dispute`, { reason }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['move-outs'] })
      qc.invalidateQueries({ queryKey: ['move-out', vars.id] })
    },
  })
}

export function useProcessRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<MoveOut>(`/move-outs/${id}/process-refund`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['move-outs'] })
      qc.invalidateQueries({ queryKey: ['move-out', id] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}

export function useAcknowledgeMoveOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<MoveOut>(`/move-outs/${id}/acknowledge`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['move-outs'] })
      qc.invalidateQueries({ queryKey: ['move-out', id] })
    },
  })
}

export function useAddMoveOutNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.post<MoveOut>(`/move-outs/${id}/notes`, { text }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['move-outs'] })
      qc.invalidateQueries({ queryKey: ['move-out', vars.id] })
    },
  })
}

// AI Text Generation
export function useAIGenerate() {
  return useMutation({
    mutationFn: (body: { prompt: string; context: string; language?: string }) =>
      api.post<{ text: string }>('/ai/generate', body),
    // Consumers (MarkdownEditor, Textarea) catch-and-ignore; surface failures here
    // so a failed generation isn't silent.
    onError: (err) => {
      useToastStore.getState().addToast(err instanceof Error ? err.message : 'AI generation failed', 'error')
    },
  })
}

// ─────────────────────────────────────────────
// FINANCING (Financier role + applicant flows)
// ─────────────────────────────────────────────

export function useFinancingOffers() {
  return useQuery({
    queryKey: ['financing-offers'],
    queryFn: () => api.get<PaginatedResponse<FinancingOffer>>('/financing/offers'),
  })
}

export function useMyFinancingOffers() {
  return useQuery({
    queryKey: ['financing-offers', 'mine'],
    queryFn: () => api.get<PaginatedResponse<FinancingOffer>>('/financing/offers/mine'),
  })
}

export function useCreateFinancingOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<FinancingOffer>) => api.post<FinancingOffer>('/financing/offers', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financing-offers'] })
    },
  })
}

export function useToggleFinancingOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch<FinancingOffer>(`/financing/offers/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['financing-offers'] }),
  })
}

export function useFinancingApplications() {
  return useQuery({
    queryKey: ['financing-applications'],
    queryFn: () => api.get<PaginatedResponse<FinancingApplication>>('/financing/applications'),
  })
}

export function useFinancingApplication(id: string) {
  return useQuery({
    queryKey: ['financing-application', id],
    queryFn: () => api.get<FinancingApplication>(`/financing/applications/${id}`),
    enabled: Boolean(id),
  })
}

export function useApplyForFinancing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      offerId: string
      amountRequested: number
      tenureMonths: number
      purpose: string
      agreementId?: string
      propertyId?: string
      willUsePayrollDeduction?: boolean
    }) => api.post<FinancingApplication>('/financing/applications', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['financing-applications'] }),
  })
}

export function useDecideFinancingApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action, notes }: { id: string; action: 'approve' | 'reject'; notes?: string }) =>
      api.post(`/financing/applications/${id}/${action}`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financing-applications'] })
      qc.invalidateQueries({ queryKey: ['financing-contracts'] })
    },
  })
}

export function useFinancingContracts() {
  return useQuery({
    queryKey: ['financing-contracts'],
    queryFn: () => api.get<PaginatedResponse<FinancingContract>>('/financing/contracts'),
  })
}

export function useFinancingContract(id: string) {
  return useQuery({
    queryKey: ['financing-contract', id],
    queryFn: () => api.get<FinancingContract>(`/financing/contracts/${id}`),
    enabled: Boolean(id),
  })
}

export function useSignFinancingContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, signature }: { id: string; signature: string }) =>
      api.post<FinancingContract>(`/financing/contracts/${id}/sign`, { signature }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['financing-contracts'] })
      qc.invalidateQueries({ queryKey: ['financing-contract', vars.id] })
    },
  })
}

export interface FinancingCollectionsRow {
  id: string
  applicantId: string
  applicantName?: string
  agreementId?: string
  status: 'in_grace' | 'in_arrears' | 'defaulted'
  principal: number
  totalRepayable: number
  amountRepaid: number
  monthlyPayment: number
  daysOverdue: number
  oldestUnpaidDueDate?: string
  outstanding: number
  lastReminderAt?: string
  lastContactAt?: string
}

export function useFinancierCollections(status?: 'in_grace' | 'in_arrears' | 'defaulted') {
  const qs = status ? `?status=${status}` : ''
  return useQuery({
    queryKey: ['financing-collections', status],
    queryFn: () => api.get<{ items: FinancingCollectionsRow[]; total: number }>(`/financing/collections${qs}`),
  })
}

export function useSendCollectionsReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/financing/contracts/${id}/remind`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['financing-collections'] }),
  })
}

export function useMarkContractDefaulted() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.post(`/financing/contracts/${id}/mark-defaulted`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financing-collections'] })
      qc.invalidateQueries({ queryKey: ['financing-contracts'] })
      qc.invalidateQueries({ queryKey: ['financing-portfolio'] })
    },
  })
}

export function useAddContractNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.post(`/financing/contracts/${id}/notes`, { text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financing-collections'] })
      qc.invalidateQueries({ queryKey: ['financing-contract'] })
    },
  })
}

export function useDisburseFinancingContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<FinancingContract>(`/financing/contracts/${id}/disburse`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['financing-contracts'] })
      qc.invalidateQueries({ queryKey: ['financing-contract', id] })
      qc.invalidateQueries({ queryKey: ['financing-portfolio'] })
    },
  })
}

export function useRepayFinancingContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.post(`/financing/contracts/${id}/repay`, { amount }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['financing-contracts'] })
      qc.invalidateQueries({ queryKey: ['financing-contract', vars.id] })
      qc.invalidateQueries({ queryKey: ['financing-portfolio'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}

export function useFinancingPortfolio() {
  return useQuery({
    queryKey: ['financing-portfolio'],
    queryFn: () => api.get<{
      totalDisbursed: number
      totalRepaid: number
      outstanding: number
      activeContracts: number
      settledContracts: number
      defaultedContracts: number
      inArrearsContracts: number
      pendingApplications: number
      contractCount: number
      defaultRate: number
    }>('/financing/portfolio'),
  })
}

// ─────────────────────────────────────────────
// EMPLOYER / PAYROLL DEDUCTIONS
// ─────────────────────────────────────────────

export function useMyEmployer() {
  return useQuery({
    queryKey: ['employer', 'me'],
    queryFn: () => api.get<Employer | null>('/employers/me'),
  })
}

export function useUpsertEmployer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Employer>) => api.post<Employer>('/employers/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employer'] }),
  })
}

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<PaginatedResponse<Employment>>('/employers/employees'),
  })
}

export function useAddEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; netMonthlySalary: number; startDate: string; staffNumber?: string; jobTitle?: string }) =>
      api.post<Employment>('/employers/employees', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export interface BulkImportRow {
  email: string
  netMonthlySalary: number
  startDate: string
  staffNumber?: string
  jobTitle?: string
}

export interface BulkImportResult {
  created: number
  skipped: number
  errors: { row: number; email?: string; reason: string }[]
}

export function useBulkImportEmployees() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: BulkImportRow[]) =>
      api.post<BulkImportResult>('/employers/employees/bulk', { rows }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export function useUpdateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Employment>) =>
      api.patch<Employment>(`/employers/employees/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export function useMyMandates() {
  return useQuery({
    queryKey: ['mandates', 'mine'],
    queryFn: () => api.get<PaginatedResponse<DeductionMandate>>('/employers/mandates/mine'),
  })
}

export function useEmployerMandates() {
  return useQuery({
    queryKey: ['mandates'],
    queryFn: () => api.get<PaginatedResponse<DeductionMandate>>('/employers/mandates'),
  })
}

export function useCreateMandate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      allocationType: 'rent' | 'savings' | 'loan_repayment' | 'wallet_topup'
      targetEntityId?: string
      amountType: 'fixed' | 'percentage'
      amount: number
      startDate: string
      endDate?: string
      noticePeriodDays?: number
      signature: string
    }) => api.post<DeductionMandate>('/employers/mandates', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandates'] }),
  })
}

export function useApproveMandate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<DeductionMandate>(`/employers/mandates/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandates'] }),
  })
}

export function useRevokeMandate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<DeductionMandate>(`/employers/mandates/${id}/revoke`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandates'] }),
  })
}

export function usePayrollRuns() {
  return useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get<PaginatedResponse<PayrollRun>>('/employers/payroll/runs'),
  })
}

export function usePayrollRun(id: string) {
  return useQuery({
    queryKey: ['payroll-run', id],
    queryFn: () => api.get<PayrollRun>(`/employers/payroll/runs/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreatePayrollRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { periodLabel: string; periodStart: string; periodEnd: string; scheduledPayDate: string }) =>
      api.post<PayrollRun>('/employers/payroll/runs', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-runs'] }),
  })
}

export function useApprovePayrollRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<PayrollRun>(`/employers/payroll/runs/${id}/approve`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] })
      qc.invalidateQueries({ queryKey: ['payroll-run', id] })
    },
  })
}

export function useProcessPayrollRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<PayrollRun>(`/employers/payroll/runs/${id}/process`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] })
      qc.invalidateQueries({ queryKey: ['payroll-run', id] })
    },
  })
}

// ─────────────────────────────────────────────
// ADMIN — Platform-wide views (read-only)
// ─────────────────────────────────────────────

export interface AdminFinancingContractRow extends FinancingContract {
  applicantName?: string
  financierName?: string
}

export interface AdminEmployerRow extends Employer {
  activeEmployees: number
  activeMandates: number
}

export interface AdminMaintenanceRow extends MaintenanceRequest {
  propertyTitle?: string
  tenantName?: string
}

export interface AdminInsurancePolicyRow extends InsurancePolicy {
  policyHolderName?: string
  productName?: string
  providerName?: string
  category?: InsuranceCategory
}

export function useAdminFinancingContracts(params?: { status?: string; page?: number }) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.page) query.set('page', String(params.page))
  const qs = query.toString()
  return useQuery({
    queryKey: ['admin-financing-contracts', params],
    queryFn: () =>
      api.get<PaginatedResponse<AdminFinancingContractRow>>(
        `/admin/financing/contracts${qs ? `?${qs}` : ''}`,
      ),
  })
}

export function useAdminEmployers() {
  return useQuery({
    queryKey: ['admin-employers'],
    queryFn: () => api.get<{ items: AdminEmployerRow[]; total: number }>('/admin/employers'),
  })
}

export function useAdminMaintenance(params?: { status?: string; page?: number }) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.page) query.set('page', String(params.page))
  const qs = query.toString()
  return useQuery({
    queryKey: ['admin-maintenance', params],
    queryFn: () =>
      api.get<PaginatedResponse<AdminMaintenanceRow>>(`/admin/maintenance${qs ? `?${qs}` : ''}`),
  })
}

export function useAdminInsurancePolicies(params?: { status?: string; page?: number }) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.page) query.set('page', String(params.page))
  const qs = query.toString()
  return useQuery({
    queryKey: ['admin-insurance-policies', params],
    queryFn: () =>
      api.get<PaginatedResponse<AdminInsurancePolicyRow>>(
        `/admin/insurance/policies${qs ? `?${qs}` : ''}`,
      ),
  })
}
