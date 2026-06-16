import { Link, useParams, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Calendar, ArrowLeft, Clock, PenSquare, Trash2, Share2 } from 'lucide-react'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuthStore } from '@/stores/authStore'
import { useState } from 'react'

interface BlogPost {
  id: string; title: string; slug: string; excerpt: string; content: string
  author: string; coverImage?: string; tags: string[]; createdAt: string
}

export function BlogDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.roles?.some((r) => ['admin', 'government', 'super_admin'].includes(r))
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const { data: post, isLoading } = useQuery({
    queryKey: ['blog-post', slug],
    queryFn: () => api.get<BlogPost>(`/blog/slug/${slug}`),
    enabled: !!slug,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/blog/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blog'] }); navigate('/blog') },
  })

  if (isLoading) return <DetailSkeleton />

  if (!post) {
    return <EmptyState preset="properties" title="Post not found" description="This blog post doesn't exist or has been removed." action={{ label: 'Back to Blog', href: '/blog' }} />
  }

  const readTime = Math.max(1, Math.ceil((post.content?.length ?? 0) / 1000))

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <Link to="/blog" className="flex items-center gap-2 text-sm text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white transition-colors">
          <ArrowLeft size={16} /> Back to Blog
        </Link>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link to={`/blog/edit/${post.id}`}>
              <Button variant="outline" size="sm"><PenSquare size={14} /> Edit</Button>
            </Link>
            {deleteConfirm ? (
              <div className="flex items-center gap-2">
                <Button variant="danger" size="sm" onClick={() => deleteMutation.mutate(post.id)}>Confirm</Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(true)}><Trash2 size={14} /></Button>
            )}
          </div>
        )}
      </div>

      {/* Cover */}
      {post.coverImage ? (
        <div className="rounded-2xl overflow-hidden h-64 md:h-80">
          <img src={post.coverImage} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10 h-48 flex items-center justify-center">
          <BookOpen size={48} className="text-primary/15" />
        </div>
      )}

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2">
        {post.tags.map((t) => <Badge key={t} variant="default" className="text-[11px]">{t}</Badge>)}
        <span className="flex items-center gap-1 text-xs text-muted dark:text-gray-500"><Calendar size={12} /> {formatDate(post.createdAt)}</span>
        <span className="flex items-center gap-1 text-xs text-muted dark:text-gray-500"><Clock size={12} /> {readTime} min read</span>
      </div>

      {/* Title */}
      <h1 className="text-3xl md:text-4xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight leading-tight">
        {post.title}
      </h1>

      {/* Author */}
      <div className="flex items-center gap-3 pb-6 border-b border-border dark:border-[#252a3a]">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white text-sm font-bold">R</div>
        <div>
          <p className="text-sm font-bold text-primary-dark dark:text-white">RentOS Team</p>
          <p className="text-xs text-muted dark:text-gray-500">{formatDate(post.createdAt)}</p>
        </div>
      </div>

      {/* Content */}
      <Card className="overflow-hidden p-0">
        <div className="h-1 bg-gradient-to-r from-primary to-primary-light" />
        <div className="p-5 md:p-8">
          <div className="prose-rentos">
            <Markdown remarkPlugins={[remarkGfm]}>{post.content}</Markdown>
          </div>
        </div>
      </Card>

      {/* Share */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => {
          if (navigator.share) navigator.share({ title: post.title, url: window.location.href })
          else navigator.clipboard.writeText(window.location.href)
        }}>
          <Share2 size={14} /> Share
        </Button>
      </div>
    </div>
  )
}
