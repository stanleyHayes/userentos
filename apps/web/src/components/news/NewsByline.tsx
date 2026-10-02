import { ArrowUpRight } from 'lucide-react'
import { bylineOf, type NewsAttribution } from '@/lib/news'
import { buttonVariants } from '@/components/ui/buttonVariants'

/** The author's logo (or initial); the RentOS initial for RentOS's own articles. */
export function NewsAvatar({ post, className = 'h-8 w-8 text-xs' }: { post: NewsAttribution; className?: string }) {
  const byline = bylineOf(post)
  return byline.logoUrl
    ? <img src={byline.logoUrl} alt="" className={`shrink-0 rounded-full bg-white object-cover ${className}`} />
    : <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-light font-bold text-white ${className}`}>{byline.initial}</span>
}

/** "By ABC Properties", linked to their website; "RentOS Team" otherwise. */
export function NewsBylineName({ post, className = '' }: { post: NewsAttribution; className?: string }) {
  const byline = bylineOf(post)
  return byline.url
    ? <a href={byline.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className={`hover:underline ${className}`}>By {byline.name}</a>
    : <span className={className}>{byline.name}</span>
}

/** On a website's post: a way to the rest of that website. */
export function MoreFromWebsite({ post }: { post: NewsAttribution }) {
  const byline = bylineOf(post)
  if (!byline.url) return null
  return (
    <a href={byline.url} target="_blank" rel="noopener" className={buttonVariants({ variant: 'outline' })}>
      More from {byline.name} <ArrowUpRight size={14} />
    </a>
  )
}
