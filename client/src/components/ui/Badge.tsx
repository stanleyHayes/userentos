import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary dark:text-blue-400',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-amber-700 dark:text-amber-400',
        danger: 'bg-danger/10 text-danger',
        muted: 'bg-gray-100 dark:bg-[#252a3a] text-muted dark:text-[#cbd5e1]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
