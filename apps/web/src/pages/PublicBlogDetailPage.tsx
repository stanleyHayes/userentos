import { Link, useParams } from 'react-router-dom'
import { MoreFromWebsite, NewsAvatar, NewsBylineName } from '@/components/news/NewsByline'
import { useArticleSeo, type NewsArticle } from '@/lib/news'
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

interface BlogPost extends NewsArticle {
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
  useArticleSeo(post)

  // Fetch other posts for "related" section
  const { data: postsData } = useQuery({
    queryKey: ['blog-public'],
    queryFn: () => api.get<{ items: BlogPost[] }>('/blog?pageSize=6'),
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
      {/* Hero: the title on the cover photo, or on a plain band when there is none */}
      <div className={post.coverImage ? 'relative flex min-h-[22rem] items-end overflow-hidden md:min-h-[30rem]' : 'bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10'}>
        {post.coverImage && (
          <>
            <img src={post.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />
          </>
        )}
        <div className={`relative mx-auto w-full max-w-4xl px-6 ${post.coverImage ? 'pb-8 pt-28' : 'pb-10 pt-12'}`}>
          <Link to="/#blog" className={`mb-4 inline-flex items-center gap-2 text-sm transition-colors ${post.coverImage ? 'text-white/75 hover:text-white' : 'text-muted hover:text-primary-dark dark:hover:text-white'}`}>
            <ArrowLeft size={16} /> Back to news
          </Link>

          {post.tags.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {post.tags.map((t) => (
                <Badge key={t} variant="default" className={`text-[11px] ${post.coverImage ? 'border-white/20 bg-white/10 text-white backdrop-blur' : ''}`}>{t}</Badge>
              ))}
            </div>
          )}

          <h1 className={`font-display text-3xl font-extrabold leading-tight tracking-tight md:text-5xl ${post.coverImage ? 'text-white' : 'text-primary-dark dark:text-white'}`}>
            {post.title}
          </h1>

          <div className={`mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 ${post.coverImage ? 'text-white/75' : 'text-muted'}`}>
            <div className="flex items-center gap-2">
              <NewsAvatar post={post} className="h-8 w-8 text-xs" />
              <NewsBylineName post={post} className={`text-sm font-semibold ${post.coverImage ? 'text-white' : 'text-primary-dark dark:text-white'}`} />
            </div>
            <span className="flex items-center gap-1 text-xs"><Calendar size={12} /> {formatDate(post.publishedAt ?? post.createdAt)}</span>
            <span className="flex items-center gap-1 text-xs"><Clock size={12} /> {readTime} min read</span>
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
          <MoreFromWebsite post={post} />
          <Link to="/register">
            <Button>Join RentOS <ArrowRight size={14} /></Button>
          </Link>
        </div>

        {/* Related posts */}
        {relatedPosts.length > 0 && (
          <div className="mt-16">
            <h2 className="text-xl font-extrabold font-display text-primary-dark dark:text-white mb-6">More from RentOS Real Estate News</h2>
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
                      <p className="text-xs text-muted dark:text-gray-500 mb-1">{formatDate(rp.publishedAt ?? rp.createdAt)}{rp.source === 'website' && rp.website ? ` · By ${rp.website.name}` : ''}</p>
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
