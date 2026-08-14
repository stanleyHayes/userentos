import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const columnClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
} as const

interface FormGridProps {
  children: ReactNode
  columns?: keyof typeof columnClasses
  compact?: boolean
  className?: string
}

export function FormGrid({ children, columns = 2, compact = false, className }: FormGridProps) {
  return (
    <div
      className={cn(
        'grid [&>*]:min-w-0 [&_.MuiFormControl-root]:w-full',
        columnClasses[columns],
        compact ? 'gap-x-3 gap-y-4' : 'gap-x-4 gap-y-5 sm:gap-x-5 sm:gap-y-5',
        className,
      )}
    >
      {children}
    </div>
  )
}
