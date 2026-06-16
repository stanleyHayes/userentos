import type { StateStorage } from 'zustand/middleware'

/**
 * Shared cookie-based storage for Zustand persist middleware.
 * Uses cookies with domain set to the root domain so all subdomains
 * (tenant.rentos.com.gh, landlord.rentos.com.gh, etc.) share auth state.
 */

/**
 * Compute the root domain for cross-subdomain cookie sharing.
 * Returns null when we should NOT set a domain attribute (localhost, IP addresses,
 * or public suffixes like vercel.app where the browser would reject the cookie).
 */
function getRootDomain(): string | null {
  const hostname = window.location.hostname

  // localhost or IP addresses — don't set domain, let the browser default to current host
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null
  }

  const parts = hostname.split('.')

  // Known public suffixes where we own the subdomain (e.g. rentos.vercel.app)
  // Browsers reject domain=.vercel.app, so don't set domain at all
  const publicSuffixes = ['vercel.app', 'netlify.app', 'onrender.com', 'pages.dev', 'herokuapp.com']
  if (publicSuffixes.some((s) => hostname.endsWith(s))) {
    return null
  }

  // e.g. tenant.rentos.com.gh → .rentos.com.gh
  if (parts.length >= 4) {
    return '.' + parts.slice(-3).join('.')
  }
  // e.g. rentos.com.gh (3 parts with two-part TLD) — no subdomain to share with
  // e.g. tenant.rentos.gh (3 parts) → .rentos.gh
  if (parts.length === 3) {
    // Two-part TLDs like .com.gh, .co.uk
    const twoPartTLDs = ['com.gh', 'co.uk', 'com.au', 'co.za']
    const lastTwo = parts.slice(-2).join('.')
    if (twoPartTLDs.includes(lastTwo)) {
      // hostname IS the root (e.g. rentos.com.gh) — no need to set domain
      return null
    }
    return '.' + parts.slice(-2).join('.')
  }

  // e.g. rentos.gh — bare domain, no subdomain sharing needed
  return null
}

const DOMAIN = getRootDomain()

function setCookie(name: string, value: string): void {
  const encoded = encodeURIComponent(value)
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()
  const domainPart = DOMAIN ? `; domain=${DOMAIN}` : ''
  document.cookie = `${name}=${encoded}${domainPart}; path=/; expires=${expires}; SameSite=Lax`
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function deleteCookie(name: string): void {
  const domainPart = DOMAIN ? `; domain=${DOMAIN}` : ''
  document.cookie = `${name}=${domainPart}; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export const cookieStorage: StateStorage = {
  getItem(name: string): string | null {
    return getCookie(name)
  },
  setItem(name: string, value: string): void {
    setCookie(name, value)
  },
  removeItem(name: string): void {
    deleteCookie(name)
  },
}
