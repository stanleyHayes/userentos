import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─────────────────────────────────────────────
// AUTHOR DASHBOARD (spec §6/§7)
// Shapes mirror apps/api/src/routes/authoring.ts, which returns the raw
// BlogPost document plus a string `id`. Every field below is one the server
// actually stores.
// ─────────────────────────────────────────────

export type AuthorPostStatus = 'draft' | 'in_review' | 'scheduled' | 'published' | 'archived' | 'removed'

export interface AuthorPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  /** Public byline; the server derives it from the author's name, never their email. */
  author: string
  coverImage?: string
  tags: string[]
  published: boolean
  authorId?: string
  /** Set at creation when the author asked for the post to sit on their storefront feed. */
  storefrontId?: string
  status?: AuthorPostStatus
  scheduledFor?: string
  /** When it actually went live — distinct from createdAt for a scheduled post. */
  publishedAt?: string
  seoTitle?: string
  seoDescription?: string
  canonicalUrl?: string
  /** Only ever set by an admin takedown. */
  removedReason?: string
  createdAt: string
  updatedAt: string
}

export interface AuthorPostList {
  items: AuthorPost[]
  total: number
}

/** Mirrors the zod body of POST /authoring/posts. Optional URL fields must be
 *  omitted rather than sent empty — the schema validates them with .url(). */
export interface AuthorPostInput {
  title: string
  excerpt: string
  content: string
  coverImage?: string
  tags?: string[]
  seoTitle?: string
  seoDescription?: string
  canonicalUrl?: string
  /** ISO date. A future value makes /publish queue the post instead of releasing it. */
  scheduledFor?: string
  /** Create only: resolves the author's storefront and scopes the post to its feed. */
  attachToStorefront?: boolean
}

export interface PublishResult {
  id: string
  status: 'published' | 'scheduled'
  scheduledFor?: string
}

/**
 * GET /authoring/posts — always scoped to the signed-in author, so this never
 * shows anyone else's work, not even for an admin. Passing no status returns
 * every state, which is what the counts on the dashboard are built from.
 */
export function useAuthorPosts(status?: AuthorPostStatus) {
  return useQuery({
    queryKey: ['author-posts', status ?? 'all'],
    queryFn: () => api.get<AuthorPostList>(`/authoring/posts${status ? `?status=${status}` : ''}`),
  })
}

/** Anything that changes a post's state also changes what the public feed serves. */
function invalidatePosts(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['author-posts'] })
  qc.invalidateQueries({ queryKey: ['blog'] })
}

export function useCreatePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AuthorPostInput) => api.post<AuthorPost>('/authoring/posts', body),
    onSuccess: () => invalidatePosts(qc),
  })
}

export function useUpdatePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<AuthorPostInput> & { id: string }) =>
      api.patch<AuthorPost>(`/authoring/posts/${id}`, body),
    onSuccess: () => invalidatePosts(qc),
  })
}

/**
 * POST /authoring/posts/:id/publish — the plan's blog quota is enforced here,
 * not at save time, and a rejection comes back as a 402 whose message names the
 * plan and the limit. Callers must show that message rather than their own.
 */
export function usePublishPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<PublishResult>(`/authoring/posts/${id}/publish`, {}),
    onSuccess: () => invalidatePosts(qc),
  })
}

export function useArchivePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ id: string; status: 'archived' }>(`/authoring/posts/${id}/archive`, {}),
    onSuccess: () => invalidatePosts(qc),
  })
}

/** Admin/super_admin only — the route is behind requireRole. */
export function useTakedownPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<{ id: string; status: 'removed' }>(`/authoring/posts/${id}/takedown`, { reason }),
    onSuccess: () => invalidatePosts(qc),
  })
}
