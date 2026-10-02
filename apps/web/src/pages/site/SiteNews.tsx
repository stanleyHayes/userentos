import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { useSite, sitePath, useSitePosts, useSitePost } from '@/lib/site'
import { formatDate } from '@/lib/utils'
import { applySeo, setJsonLd } from '@/lib/seo'
import { SitePostCard, CardSkeletons } from './parts'

/** The website's News page. Each post also appears in RentOS Real Estate News, credited to the owner. */
export function SiteNews() {
  const { site } = useSite()
  const { data, isLoading } = useSitePosts(site.slug)
  const posts = data?.items ?? []
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--site-color)] opacity-80">{site.name}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">News</h1>
      <p className="mt-3 max-w-2xl text-base text-slate-600">Market updates, new properties and advice from {site.name}.</p>
      <div className="mt-10">
        {isLoading ? <CardSkeletons count={3} tall={false} /> : posts.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => <SitePostCard key={post.id} post={post} />)}
          </div>
        ) : (
          <p className="rounded-2xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-900/5">No news yet. Check back soon.</p>
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

  if (isLoading) return <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6"><div className="h-10 w-3/4 animate-pulse rounded bg-slate-200" /><div className="mt-8 aspect-[16/9] animate-pulse rounded-3xl bg-slate-200" /></div>
  if (isError || !post) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-serif text-3xl font-semibold text-slate-900">This post is not available</h1>
        <Link to={sitePath(base, '/news')} className="mt-6 inline-flex items-center gap-1.5 font-semibold text-slate-900 underline"><ArrowLeft size={16} /> All news</Link>
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-4 pt-12 sm:px-6 md:pt-16">
      <Link to={sitePath(base, '/news')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> All news</Link>
      <h1 className="mt-6 font-serif text-4xl font-semibold leading-tight tracking-tight text-slate-900 md:text-5xl">{post.title}</h1>
      <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><CalendarDays size={14} />{formatDate(post.publishedAt ?? post.createdAt)} · By {site.name}</p>
      {post.coverImage && <img src={post.coverImage} alt="" className="mt-8 aspect-[16/9] w-full rounded-3xl object-cover" />}
      <div className="prose-rentos site-prose mt-10">
        <Markdown remarkPlugins={[remarkGfm]}>{post.content}</Markdown>
      </div>
    </article>
  )
}
