/**
 * A professional's RentOS website (brief §03): the data, the context every
 * page reads, and visit tracking. RentOS owns the structure — Home,
 * Properties, About, News, Contact — and the design; the owner supplies the
 * content in "My website".
 *
 * A site answers at /s/<slug>/… on the platform and at the root of
 * <slug>.userentos.com or the owner's own domain. On those hosts nobody is
 * signed in (sessions do not cross domains), so enquiries and anything else
 * that needs an account link back to the same page on the platform.
 */
import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { platformOrigin } from './platformOrigin'
import { useAuthStore } from '@/stores/authStore'
import type { Property } from '@/types'

export interface SiteData {
  id: string
  slug: string
  name: string
  tagline?: string
  about?: string
  heroTitle?: string
  heroSubtitle?: string
  services: string[]
  serviceAreas: string[]
  aboutImageUrl?: string
  gallery: string[]
  status: string
  published?: boolean
  /** True when the owner is previewing a draft. */
  preview: boolean
  canonicalUrl: string
  professionalType: string | null
  identityVerified: boolean
  branding: { logoUrl?: string; coverUrl?: string; primaryColor?: string; accentColor?: string; hideRentosBranding?: boolean }
  contact: { city?: string; hours?: string }
  createdAt?: string
}

export interface SitePost {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  coverImage?: string
  tags?: string[]
  author?: string
  publishedAt?: string
  createdAt: string
}

export interface SiteContextValue {
  site: SiteData
  /** Path prefix for the site's pages: "/s/<slug>" on the platform, "" on its own host. */
  base: string
  /** On <slug>.userentos.com or a custom domain. */
  onHost: boolean
  /** The site's brand colour, or RentOS navy. */
  color: string
}

export const SiteContext = createContext<SiteContextValue | null>(null)

export function useSite(): SiteContextValue {
  const value = useContext(SiteContext)
  if (!value) throw new Error('useSite outside a RentOS website')
  return value
}

/** A path on the site: sitePath(base, '/properties'). */
export const sitePath = (base: string, path = '') => `${base}${path}` || '/'

/** The same site page on the platform, where visitors can sign in. */
export const platformSiteUrl = (slug: string, path = '') => `${platformOrigin()}/s/${slug}${path}`

const HEX = /^#[0-9a-f]{6}$/i
export const RENTOS_NAVY = '#1e3a5f'

/** The brand colour if it is a usable hex colour, else RentOS navy. */
export function siteColor(site: Pick<SiteData, 'branding'>): string {
  const color = site.branding?.primaryColor
  return color && HEX.test(color) ? color : RENTOS_NAVY
}

/** White or near-black text, whichever reads better on the colour. */
export function contrastText(hex: string): string {
  const value = HEX.test(hex) ? hex.slice(1) : '1e3a5f'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.45 ? '#0f172a' : '#ffffff'
}

export function useSiteData(slug: string | undefined) {
  return useQuery({
    queryKey: ['site', slug],
    queryFn: () => api.get<SiteData>(`/storefronts/${slug}`),
    enabled: Boolean(slug),
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
    staleTime: 60_000,
  })
}

export type SiteListingFilter = '' | 'rent' | 'sale' | 'short_let'

export function useSiteProperties(slug: string, filter: SiteListingFilter, page: number, limit = 12) {
  return useQuery({
    queryKey: ['site', slug, 'properties', filter, page, limit],
    queryFn: () => api.get<{ items: Property[]; total: number; page: number; totalPages: number }>(
      `/storefronts/${slug}/properties?page=${page}&limit=${limit}${filter ? `&listingType=${filter}` : ''}`,
    ),
    placeholderData: (previous) => previous,
  })
}

export function useSitePosts(slug: string) {
  return useQuery({
    queryKey: ['site', slug, 'posts'],
    queryFn: () => api.get<{ items: SitePost[]; total: number }>(`/storefronts/${slug}/posts`),
  })
}

export function useSitePost(slug: string, postSlug: string | undefined) {
  return useQuery({
    queryKey: ['site', slug, 'post', postSlug],
    queryFn: () => api.get<SitePost>(`/storefronts/${slug}/posts/${postSlug}`),
    enabled: Boolean(postSlug),
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  })
}

// ─── Visit tracking (the owner's website analytics) ───

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const VISITOR_KEY = 'rentos-storefront-visitor'

export type SiteTrackEvent =
  | { type: 'view'; propertyId?: string }
  | { type: 'listing_impression'; propertyIds: string[] }

function visitorSessionId(): string | undefined {
  try {
    let id = sessionStorage.getItem(VISITOR_KEY)
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(VISITOR_KEY, id) }
    return id
  } catch {
    return undefined
  }
}

/** Fire-and-forget: a metrics write is never why a page fails. The owner's own visits are not counted (server side). */
export function trackSite(slug: string, event: SiteTrackEvent) {
  const token = useAuthStore.getState().token
  void fetch(`${API_BASE}/storefronts/${encodeURIComponent(slug)}/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ ...event, sessionId: visitorSessionId() }),
    keepalive: true,
  }).catch(() => {})
}

/** Listing impressions not yet counted in this tab. */
export function unseenListings(slug: string, ids: string[]): string[] {
  const key = `rentos-storefront-seen:${slug}`
  try {
    const seen = new Set<string>(JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[])
    const fresh = ids.filter((id) => !seen.has(id))
    if (fresh.length) sessionStorage.setItem(key, JSON.stringify([...seen, ...fresh]))
    return fresh
  } catch {
    return ids
  }
}

/** The address a website is shared at: the owner's domain once connected, else <slug>.userentos.com. */
export const websiteUrl = (s: { slug: string; canonicalDomain?: string }) => (s.canonicalDomain ? `https://${s.canonicalDomain}` : `https://${s.slug}.userentos.com`)

export const PROFESSIONAL_LABEL: Record<string, string> = { agent: 'Real estate agent', agency: 'Real estate agency', property_manager: 'Property manager' }
