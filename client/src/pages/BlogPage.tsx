import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, BookOpen, Calendar, ArrowLeft, ArrowRight, Share2, User, Clock, PenSquare, Trash2, Plus, ChevronLeft, ChevronRight, FileText, TrendingUp, Eye, Newspaper } from 'lucide-react'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { GridSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuthStore } from '@/stores/authStore'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import { DoodleUnderline } from '@/components/ui/Doodles'
import { IconWatermark } from '@/components/ui/Watermark'

interface BlogPost {
  id: string; title: string; slug: string; excerpt: string; content: string
  author: string; coverImage?: string; tags: string[]; createdAt: string
}

const ADMIN_ROLES = ['admin', 'government', 'super_admin']
const BLOG_PAGE_SIZE = 6

export function BlogPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<string>()
  const [selected, setSelected] = useState<BlogPost | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const { attach: pillAttach, style: pillStyle, visible: pillVisible } = useSlidingIndicator<HTMLDivElement>(tag ?? '__all__')

  const user = useAuthStore((s) => s.user)
  const isAdmin = user && ADMIN_ROLES.includes(user.activeRole)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['blog', search, tag],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (tag) params.set('tag', tag)
      const qs = params.toString()
      return api.get<{ items: BlogPost[] }>(`/blog${qs ? `?${qs}` : ''}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => api.delete(`/blog/${postId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog'] })
      setDeleteConfirmId(null)
      if (selected) setSelected(null)
    },
  })

  const posts = data?.items ?? []
  const allTags = [...new Set(posts.flatMap((p) => p.tags))]
  const relatedPosts = selected ? posts.filter((p) => p.id !== selected.id).slice(0, 3) : []

  // Pagination: featured post is always posts[0], paginate the rest
  const restPosts = posts.slice(1)
  const totalPages = Math.max(1, Math.ceil(restPosts.length / BLOG_PAGE_SIZE))
  const paginatedPosts = restPosts.slice((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE)

  // === DETAIL VIEW ===
  if (selected) {
    const readTime = Math.max(1, Math.ceil((selected.content?.length ?? 0) / 1000))

    return (
      <div className="max-w-5xl mx-auto animate-fade-up">
        {/* Back */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white transition-colors">
            <ArrowLeft size={16} /> Back to Blog
          </button>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Link to={`/blog/edit/${selected.id}`}>
                <Button variant="outline" size="sm">
                  <PenSquare size={14} /> Edit
                </Button>
              </Link>
              {deleteConfirmId === selected.id ? (
                <div className="flex items-center gap-2">
                  <Button variant="danger" size="sm" onClick={() => deleteMutation.mutate(selected.id)}>
                    Confirm Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(selected.id)}>
                  <Trash2 size={14} /> Delete
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          {/* Main article */}
          <div>
            {/* Cover image */}
            {selected.coverImage ? (
              <div className="rounded-2xl overflow-hidden mb-6 h-64 md:h-80">
                <img src={selected.coverImage} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10 mb-6 h-48 flex items-center justify-center">
                <BookOpen size={48} className="text-primary/15" />
              </div>
            )}

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {selected.tags.map((t) => (
                <Badge key={t} variant="default" className="text-[11px]">{t}</Badge>
              ))}
              <span className="flex items-center gap-1 text-xs text-muted dark:text-gray-500">
                <Calendar size={12} /> {formatDate(selected.createdAt)}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted dark:text-gray-500">
                <Clock size={12} /> {readTime} min read
              </span>
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight leading-tight">
              {selected.title}
            </h1>

            {/* Author */}
            <div className="flex items-center gap-3 mt-4 mb-6 pb-6 border-b border-border dark:border-[#252a3a]">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white text-sm font-bold">
                R
              </div>
              <div>
                <p className="text-sm font-bold text-primary-dark dark:text-white">RentOS Team</p>
                <p className="text-xs text-muted dark:text-gray-500">{formatDate(selected.createdAt)}</p>
              </div>
            </div>

            {/* Markdown content */}
            <Card className="overflow-hidden p-0">
              <div className="h-1 bg-gradient-to-r from-primary to-primary-light" />
              <div className="p-5 md:p-8">
                <div className="prose-rentos">
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {selected.content}
                  </Markdown>
                </div>
              </div>
            </Card>

            {/* Share + More */}
            <div className="flex items-center gap-3 mt-6">
              <Button variant="outline" onClick={() => {
                if (navigator.share) navigator.share({ title: selected.title, url: window.location.href })
                else { navigator.clipboard.writeText(window.location.href) }
              }}>
                <Share2 size={14} /> Share Article
              </Button>
              <Button onClick={() => setSelected(null)}>
                More Articles <ArrowRight size={14} />
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Author card */}
            <Card className="overflow-hidden p-0">
              <div className="h-1 bg-gradient-to-r from-secondary to-amber-400" />
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User size={14} className="text-secondary" />
                  <p className="text-xs font-bold text-primary-dark dark:text-white uppercase tracking-wider">About the Author</p>
                </div>
                <div className="border-t border-border dark:border-[#252a3a] pt-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white font-bold">
                      R
                    </div>
                    <div>
                      <p className="text-sm font-bold text-primary-dark dark:text-white">RentOS Team</p>
                      <p className="text-xs text-muted dark:text-gray-500">Contributor</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Related posts */}
            {relatedPosts.length > 0 && (
              <Card className="overflow-hidden p-0">
                <div className="h-1 bg-gradient-to-r from-accent to-emerald-400" />
                <div className="p-4">
                  <p className="text-xs font-bold text-primary-dark dark:text-white uppercase tracking-wider mb-3">Related Articles</p>
                  <div className="border-t border-border dark:border-[#252a3a] pt-3 space-y-3">
                    {relatedPosts.map((p) => (
                      <button key={p.id} onClick={() => navigate(`/article/${p.slug}`)} className="w-full text-left group">
                        <p className="text-sm font-semibold text-primary-dark dark:text-white group-hover:text-primary dark:group-hover:text-blue-400 transition-colors line-clamp-2">{p.title}</p>
                        <p className="text-[10px] text-muted dark:text-gray-500 mt-1">{formatDate(p.createdAt)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    )
  }

  // === LIST VIEW ===
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="relative overflow-hidden">
          <DoodleUnderline className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
          <IconWatermark icon={Newspaper} className="right-10 top-1/2 size-28 -translate-y-1/2 rotate-[-8deg]" />
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">Blog</h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">News, guides, and updates about renting in Ghana</p>
        </div>
        {isAdmin && (
          <Link to="/blog/new">
            <Button>
              <Plus size={16} /> Write Post
            </Button>
          </Link>
        )}
      </div>

      <TextField
        type="text"
        placeholder="Search articles..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> }, inputLabel: { shrink: true } }}
        fullWidth
      />

      {allTags.length > 0 && (
        <div ref={pillAttach} className="relative isolate flex flex-wrap gap-1.5">
          <span aria-hidden className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary border border-primary transition-[transform,width,height] duration-300 ease-out" style={{ ...pillStyle, opacity: pillVisible ? 1 : 0 }} />
          <button data-tab-key="__all__" onClick={() => { setTag(undefined); setPage(1) }} className={`relative z-10 text-xs px-3 py-1.5 rounded-full border transition-colors ${!tag ? 'text-white border-transparent' : 'border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:border-primary/50'}`}>
            All
          </button>
          {allTags.map((t) => (
            <button key={t} data-tab-key={t} onClick={() => { setTag(tag === t ? undefined : t); setPage(1) }} className={`relative z-10 text-xs px-3 py-1.5 rounded-full border transition-colors ${tag === t ? 'text-white border-transparent' : 'border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:border-primary/50'}`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <GridSkeleton cols={2} count={4} />
      ) : posts.length === 0 ? (
        <EmptyState preset="general" title="No blog posts yet" description="Check back soon for news and guides about renting in Ghana." />
      ) : (
        <div className="space-y-4">
          {/* Featured first post */}
          {posts[0] && (() => {
            const readTime = Math.max(1, Math.ceil((posts[0].content?.length ?? 0) / 1000))
            return (
              <div className="relative group cursor-pointer" onClick={() => navigate(`/article/${posts[0].slug}`)}>
                <div className="rounded-2xl overflow-hidden border border-border dark:border-[#252a3a] bg-white dark:bg-[#161927] hover:shadow-2xl dark:hover:shadow-black/40 transition-all">
                  <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr]">
                    {/* Image area */}
                    <div className="relative h-56 md:h-auto min-h-[280px] bg-gradient-to-br from-[#0f2847] via-[#143665] to-[#0d3360] overflow-hidden">
                      {posts[0].coverImage ? (
                        <img src={posts[0].coverImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                      ) : (
                        <>
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(59,130,246,0.2),transparent_60%)]" />
                          <div className="absolute top-5 right-5 w-14 h-14 rounded-xl bg-white/[0.06] backdrop-blur-sm flex items-center justify-center border border-white/[0.08]">
                            <BookOpen size={24} className="text-white/25" />
                          </div>
                          <div className="absolute bottom-5 left-5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300/50 flex items-center gap-1">
                              <TrendingUp size={10} /> Featured
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    {/* Content */}
                    <div className="p-6 md:p-8 flex flex-col justify-center">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {posts[0].tags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[10px] font-semibold uppercase tracking-wider text-primary dark:text-blue-400 bg-primary/8 dark:bg-blue-400/10 px-2.5 py-1 rounded-full">
                            {t}
                          </span>
                        ))}
                      </div>
                      <h2 className="text-xl md:text-2xl font-extrabold font-display text-primary-dark dark:text-white group-hover:text-primary dark:group-hover:text-blue-400 transition-colors leading-snug">
                        {posts[0].title}
                      </h2>
                      <p className="text-sm text-muted dark:text-gray-400 mt-3 line-clamp-3 leading-relaxed">{posts[0].excerpt}</p>
                      <div className="flex items-center gap-4 mt-5 pt-4 border-t border-border dark:border-[#252a3a]">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white text-[10px] font-bold">R</div>
                          <span className="text-xs text-muted dark:text-gray-500">RentOS Team</span>
                        </div>
                        <span className="text-[10px] text-muted dark:text-gray-500 flex items-center gap-1"><Calendar size={10} /> {formatDate(posts[0].createdAt)}</span>
                        <span className="text-[10px] text-muted dark:text-gray-500 flex items-center gap-1"><Clock size={10} /> {readTime} min</span>
                        <span className="ml-auto text-xs font-semibold text-primary dark:text-blue-400 flex items-center gap-1 group-hover:gap-2 transition-all">
                          Read <ArrowRight size={12} />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                    <Link to={`/blog/edit/${posts[0].id}`} onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" className="bg-white/90 dark:bg-[#161927]/90 backdrop-blur-sm">
                        <PenSquare size={12} />
                      </Button>
                    </Link>
                    {deleteConfirmId === posts[0].id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="danger" size="sm" onClick={() => deleteMutation.mutate(posts[0].id)}>Confirm</Button>
                        <Button variant="ghost" size="sm" className="bg-white/90 dark:bg-[#161927]/90" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" className="bg-white/90 dark:bg-[#161927]/90 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(posts[0].id) }}>
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Rest of posts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {paginatedPosts.map((post) => {
              const readTime = Math.max(1, Math.ceil((post.content?.length ?? 0) / 1000))
              return (
                <div key={post.id} className="relative group cursor-pointer" onClick={() => navigate(`/article/${post.slug}`)}>
                  <div className="rounded-xl overflow-hidden border border-border dark:border-[#252a3a] bg-white dark:bg-[#161927] hover:shadow-xl dark:hover:shadow-black/30 hover:-translate-y-0.5 hover:border-primary/20 dark:hover:border-blue-500/20 transition-all h-full flex flex-col">
                    {/* Image */}
                    <div className="relative h-40 overflow-hidden">
                      {post.coverImage ? (
                        <img src={post.coverImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#0f2847]/60 via-[#143665]/40 to-[#0d3360]/60 dark:from-[#0f2847] dark:via-[#143665] dark:to-[#0d3360] flex items-center justify-center relative">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_40%,rgba(59,130,246,0.12),transparent_60%)]" />
                          <div className="w-12 h-12 rounded-xl bg-white/[0.06] backdrop-blur-sm flex items-center justify-center border border-white/[0.08]">
                            <FileText size={20} className="text-white/20" />
                          </div>
                        </div>
                      )}
                      {/* Tag overlay */}
                      {post.tags.length > 0 && (
                        <div className="absolute bottom-3 left-3 flex gap-1.5">
                          {post.tags.slice(0, 2).map((t) => (
                            <span key={t} className="text-[9px] font-bold uppercase tracking-wider text-white/90 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Content */}
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="text-[15px] font-bold text-primary-dark dark:text-white group-hover:text-primary dark:group-hover:text-blue-400 transition-colors line-clamp-2 leading-snug">
                        {post.title}
                      </h3>
                      <p className="text-xs text-muted dark:text-gray-400 mt-2 line-clamp-2 leading-relaxed flex-1">{post.excerpt}</p>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border dark:border-[#252a3a]">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white text-[8px] font-bold">R</div>
                        <span className="text-[10px] text-muted dark:text-gray-500 flex items-center gap-1"><Calendar size={9} /> {formatDate(post.createdAt)}</span>
                        <span className="text-[10px] text-muted dark:text-gray-500 flex items-center gap-1"><Clock size={9} /> {readTime} min</span>
                        <Eye size={10} className="ml-auto text-muted dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                      <Link to={`/blog/edit/${post.id}`} onClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" size="sm" className="bg-white/90 dark:bg-[#161927]/90 backdrop-blur-sm">
                          <PenSquare size={12} />
                        </Button>
                      </Link>
                      {deleteConfirmId === post.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="danger" size="sm" onClick={() => deleteMutation.mutate(post.id)}>Confirm</Button>
                          <Button variant="ghost" size="sm" className="bg-white/90 dark:bg-[#161927]/90" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="bg-white/90 dark:bg-[#161927]/90 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(post.id) }}>
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted dark:text-[#64748b]">
                Page {page} of {totalPages} ({restPosts.length} articles)
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-full text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-full text-xs font-medium transition-colors ${p === page ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400' : 'text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a]'}`}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-full text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
