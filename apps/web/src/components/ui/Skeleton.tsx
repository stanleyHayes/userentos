import { cn } from '@/lib/utils'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-gray-200 dark:bg-[#252a3a]', className)} />
}

// === Page-specific skeletons ===

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><div className="space-y-2"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-48" /></div><Skeleton className="h-9 w-28 rounded-xl" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4"><Skeleton className="h-80 w-full rounded-2xl" /></div>
        <div className="space-y-4"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] p-5">
          <Skeleton className="h-12 w-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

export function GridSkeleton({ cols = 3, count = 6 }: { cols?: number; count?: number }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${cols} gap-5`}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] overflow-hidden">
          <Skeleton className="h-44 w-full rounded-none" />
          <div className="p-4 space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><div className="flex gap-3 pt-2"><Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-12" /></div></div>
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-2xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] p-5">
      <div className="flex items-center justify-between mb-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-20" /></div>
      <div className="space-y-3">
        <div className="flex gap-4">{[...Array(cols)].map((_, i) => <Skeleton key={i} className="h-3 flex-1" />)}</div>
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2 border-t border-border/30 dark:border-[#252a3a]/30">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            {[...Array(cols - 1)].map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-80 w-full rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/2" /><div className="grid grid-cols-6 gap-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
        <div className="space-y-4"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
      </div>
    </div>
  )
}

export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-64" /></div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="rounded-2xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] p-5 space-y-4">
        {[...Array(fields)].map((_, i) => (
          <div key={i} className="space-y-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full rounded-lg" /></div>
        ))}
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] p-5 space-y-3">
      <div className="flex items-start justify-between"><Skeleton className="h-10 w-10 rounded-xl" /><Skeleton className="h-4 w-4 rounded" /></div>
      <Skeleton className="h-6 w-24" /><Skeleton className="h-3 w-32" />
    </div>
  )
}
