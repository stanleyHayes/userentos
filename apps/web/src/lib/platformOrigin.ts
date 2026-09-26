/**
 * Where the main site lives. On a storefront host ({slug}.userentos.com or a
 * seller's own domain) every relative path would stay on that host, so onward
 * links to the rest of RentOS name the platform explicitly.
 */
export function platformOrigin(): string {
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.localhost')) {
    return `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ''}`
  }
  return ((import.meta.env.VITE_SITE_URL as string | undefined) || 'https://userentos.com').replace(/\/$/, '')
}
