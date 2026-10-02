import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { GridSkeleton, DetailSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSite, sitePath, useSitePosts, useSitePost } from '@/lib/site'
import { formatDate } from '@/lib/utils'
import { applySeo, setJsonLd } from '@/lib/seo'
import { SitePostCard, PageIntro } from './parts'

/** The website's News page. Each post also appears in RentOS Real Estate News, credited to the owner. */
export function SiteNews() {
  const { site } = useSite()
  const { data, isLoading } = useSitePosts(site.slug)
  const posts = data?.items ?? []
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <PageIntro eyebrow={site.name} title="News">Market updates, new properties and advice from {site.name}.</PageIntro>
      <div className="mt-10">
        {isLoading ? <GridSkeleton cols={3} count={3} /> : posts.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => <SitePostCard key={post.id} post={post} />)}
          </div>
        ) : (
          <EmptyState preset="general" compact title="No news yet" description="Check back soon for market updates and advice." />
        )}
      </div>
    </section>
  )
}

/** One post, with its pictures. */
export function SiteNewsPost() {
  const { postSlug } = useParams<{ postSlug: string }>()
  const { site, base, onHost } = useSite()
  const { data: post, isLoading, isError } = useSitePost(site.slug, postSlug)

  // The website is where a post is indexed; the copy in RentOS Real Estate News points here.
  useEffect(() => {
    if (!post) return
    const home = site.canonicalUrl.replace(/\/$/, '')
    const canonical = `${home}/news/${post.slug}`
    applySeo({
      title: `${post.title} · ${site.name}`,
      description: (post.excerpt || post.title).slice(0, 160),
      canonical,
      image: post.coverImage,
      siteName: site.name,
      type: 'article',
      noIndex: site.preview || (onHost && !site.canonicalUrl.startsWith(window.location.origin)),
    })
    setJsonLd('article', {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt || undefined,
      image: post.coverImage ? [post.coverImage] : undefined,
      datePublished: post.publishedAt ?? post.createdAt,
      mainEntityOfPage: canonical,
      author: { '@type': 'Organization', name: site.name, url: home },
      publisher: { '@type': 'Organization', name: site.name, url: home, ...(site.branding.logoUrl ? { logo: { '@type': 'ImageObject', url: site.branding.logoUrl } } : {}) },
    })
    return () => setJsonLd('article', null)
  }, [post, site, onHost])

  if (isLoading) return <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6"><DetailSkeleton /></div>
  if (isError || !post) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <EmptyState preset="general" title="This post is not available" description="It may have been taken down or moved." action={{ label: 'All news', href: sitePath(base, '/news') }} />
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-4 pt-12 sm:px-6 md:pt-16">
      <Link to={sitePath(base, '/news')} className={buttonVariants({ variant: 'ghost', size: 'sm' })}><ArrowLeft size={15} /> All news</Link>
      <h1 className="mt-6 font-display text-4xl font-extrabold leading-tight tracking-tight text-primary-dark dark:text-white md:text-5xl">{post.title}</h1>
      <p className="mt-4 flex items-center gap-2 text-sm text-muted dark:text-gray-400"><CalendarDays size={14} />{formatDate(post.publishedAt ?? post.createdAt)} · By {site.name}</p>
      {post.coverImage && <img src={post.coverImage} alt="" className="mt-8 aspect-[16/9] w-full rounded-3xl object-cover" />}
      <div className="surface-card mt-10 overflow-hidden rounded-2xl border p-0">
        <div className="h-1" style={{ background: 'linear-gradient(90deg, var(--site-color), color-mix(in oklab, var(--site-color) 55%, white))' }} />
        <div className="prose-rentos site-prose p-5 md:p-8">
          <Markdown remarkPlugins={[remarkGfm]}>{post.content}</Markdown>
        </div>
      </div>
    </article>
  )
}
