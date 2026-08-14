import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Calendar, ArrowLeft, Clock, Share2, ArrowRight } from 'lucide-react'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface BlogPost {
  id: string; title: string; slug: string; excerpt: string; content: string
  author: string; coverImage?: string; tags: string[]; createdAt: string
}

export function PublicBlogDetailPage() {
  const { slug } = useParams<{ slug: string }>()

  const { data: post, isLoading } = useQuery({
    queryKey: ['blog-post', slug],
    queryFn: () => api.get<BlogPost>(`/blog/slug/${slug}`),
    enabled: !!slug,
  })

  // Fetch other posts for "related" section
  const { data: postsData } = useQuery({
    queryKey: ['blog-public'],
    queryFn: () => api.get<{ items: BlogPost[] }>('/blog'),
  })
  const relatedPosts = (postsData?.items ?? []).filter((p) => p.slug !== slug).slice(0, 3)

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16">
        <DetailSkeleton />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <BookOpen size={48} className="mx-auto text-muted mb-4" />
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">Article not found</h1>
        <p className="text-sm text-muted mt-2">This article doesn't exist or has been removed.</p>
        <Link to="/" className="inline-block mt-6">
          <Button>Back to Home <ArrowRight size={14} /></Button>
        </Link>
      </div>
    )
  }

  const readTime = Math.max(1, Math.ceil((post.content?.length ?? 0) / 1000))

  return (
    <div className="animate-fade-up">
      {/* Hero header */}
      <div className="relative">
        {post.coverImage ? (
          <div className="h-64 md:h-96 overflow-hidden">
            <img src={post.coverImage} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          </div>
        ) : (
          <div className="h-48 md:h-64 bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10" />
        )}

        <div className="max-w-4xl mx-auto px-6">
          <div className={post.coverImage ? '-mt-24 relative z-10' : 'pt-8'}>
            {/* Back link */}
            <Link to="/#blog" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white mb-4 transition-colors">
              <ArrowLeft size={16} /> Back to Articles
            </Link>

            {/* Tags + Meta */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {post.tags.map((t) => (
                <Badge key={t} variant="default" className="text-[11px] bg-white/10 text-white border-white/20 backdrop-blur">{t}</Badge>
              ))}
            </div>

            {/* Title */}
            <h1 className={`text-3xl md:text-5xl font-extrabold font-display tracking-tight leading-tight ${post.coverImage ? 'text-white' : 'text-primary-dark dark:text-white'}`}>
              {post.title}
            </h1>

            {/* Author + date row */}
            <div className={`flex items-center gap-4 mt-4 ${post.coverImage ? 'text-white/60' : 'text-muted'}`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white text-xs font-bold">R</div>
                <span className="text-sm font-medium text-white dark:text-white">RentOS Team</span>
              </div>
              <span className="flex items-center gap-1 text-xs"><Calendar size={12} /> {formatDate(post.createdAt)}</span>
              <span className="flex items-center gap-1 text-xs"><Clock size={12} /> {readTime} min read</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-lg text-muted dark:text-gray-400 leading-relaxed mb-8 border-l-4 border-primary/30 pl-4 italic">
            {post.excerpt}
          </p>
        )}

        {/* Article body */}
        <Card className="overflow-hidden p-0">
          <div className="h-1 bg-gradient-to-r from-primary to-primary-light" />
          <div className="p-6 md:p-10">
            <div className="prose-rentos">
              <Markdown remarkPlugins={[remarkGfm]}>{post.content}</Markdown>
            </div>
          </div>
        </Card>

        {/* Share + CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-border dark:border-[#252a3a]">
          <Button variant="outline" onClick={() => {
            if (navigator.share) navigator.share({ title: post.title, url: window.location.href })
            else { navigator.clipboard.writeText(window.location.href) }
          }}>
            <Share2 size={14} /> Share this article
          </Button>
          <Link to="/register">
            <Button>Join RentOS <ArrowRight size={14} /></Button>
          </Link>
        </div>

        {/* Related posts */}
        {relatedPosts.length > 0 && (
          <div className="mt-16">
            <h2 className="text-xl font-extrabold font-display text-primary-dark dark:text-white mb-6">More Articles</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {relatedPosts.map((rp) => (
                <Link key={rp.id} to={`/article/${rp.slug}`} className="group">
                  <Card className="h-full hover:shadow-lg dark:hover:shadow-black/30 hover:-translate-y-0.5 transition-all overflow-hidden">
                    {rp.coverImage ? (
                      <div className="h-32 overflow-hidden">
                        <img src={rp.coverImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      </div>
                    ) : (
                      <div className="h-24 bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10 flex items-center justify-center">
                        <BookOpen size={24} className="text-primary/15" />
                      </div>
                    )}
                    <div className="p-4">
                      <p className="text-xs text-muted dark:text-gray-500 mb-1">{formatDate(rp.createdAt)}</p>
                      <h3 className="text-sm font-bold text-primary-dark dark:text-white line-clamp-2 group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">
                        {rp.title}
                      </h3>
                      <p className="text-xs text-muted dark:text-gray-400 mt-1 line-clamp-2">{rp.excerpt}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
