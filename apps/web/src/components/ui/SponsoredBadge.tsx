import { Megaphone } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

/**
 * The label every paid placement carries (sponsored listings, paid "featured"
 * businesses). One component so the wording and look cannot drift between
 * surfaces: the Ghana advertising code requires a paid item to be identified
 * as such, and "Sponsored" is the plain word for it.
 */
export function SponsoredBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={cn('gap-1', className)} data-testid="sponsored-badge">
      <Megaphone size={10} aria-hidden="true" /> Sponsored
    </Badge>
  )
}
