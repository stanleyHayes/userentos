/**
 * RentOS Real Estate News (product brief §07): RentOS's own articles and every
 * post published on a professional's website, always credited to its source
 * ("How Rental Prices Are Changing in Accra / By ABC Properties").
 */
import { useEffect } from 'react'
import { applySeo, setJsonLd } from './seo'
import { platformOrigin } from './platformOrigin'

export interface NewsAttribution {
  source?: 'rentos' | 'website'
  website?: { name: string; slug: string; url: string; logoUrl: string | null } | null
}

export interface NewsArticle extends NewsAttribution {
  slug: string
  title: string
  excerpt?: string
  coverImage?: string
  createdAt: string
  updatedAt?: string
  publishedAt?: string
}

export interface Byline {
  name: string
  initial: string
  /** The author's website, for posts from one. */
  url: string | null
  logoUrl: string | null
}

export function bylineOf(post: NewsAttribution): Byline {
  if (post.source === 'website' && post.website) {
    return { name: post.website.name, initial: post.website.name.charAt(0).toUpperCase(), url: post.website.url, logoUrl: post.website.logoUrl }
  }
  return { name: 'RentOS Team', initial: 'R', url: null, logoUrl: null }
}

/**
 * Where search engines should index an article. A website's post appears both
 * on that website and here; the website is the original, so it gets the
 * credit rather than the two copies competing.
 */
export function articleCanonical(post: NewsArticle): string {
  return post.source === 'website' && post.website
    ? `${post.website.url.replace(/\/$/, '')}/news/${post.slug}`
    : `${platformOrigin()}/article/${post.slug}`
}

/** Head tags and BlogPosting structured data for an article page. */
export function useArticleSeo(post: NewsArticle | undefined) {
  useEffect(() => {
    if (!post) return
    const byline = bylineOf(post)
    const canonical = articleCanonical(post)
    applySeo({
      title: `${post.title} | RentOS Real Estate News`,
      description: (post.excerpt || post.title).slice(0, 160),
      canonical,
      image: post.coverImage,
      siteName: 'RentOS Ghana',
      type: 'article',
    })
    setJsonLd('article', {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt || undefined,
      image: post.coverImage ? [post.coverImage] : undefined,
      datePublished: post.publishedAt ?? post.createdAt,
      dateModified: post.updatedAt ?? post.publishedAt ?? post.createdAt,
      mainEntityOfPage: canonical,
      author: { '@type': 'Organization', name: byline.url ? byline.name : 'RentOS', url: byline.url ?? platformOrigin() },
      publisher: { '@type': 'Organization', name: 'RentOS', url: platformOrigin(), logo: { '@type': 'ImageObject', url: `${platformOrigin()}/email/rentos-mark.png` } },
    })
    return () => setJsonLd('article', null)
  }, [post])
}
