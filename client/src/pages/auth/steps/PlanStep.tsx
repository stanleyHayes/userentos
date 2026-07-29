import type { SubscriptionPackage } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { Check, Crown, Package, Building2, Loader2 } from 'lucide-react'

interface Props {
  packages: SubscriptionPackage[]
  selectedId: string | null
  onSelect: (id: string) => void
  isLoading: boolean
}

export function PlanStep({ packages, selectedId, onSelect, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-10 animate-fade-up">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    )
  }

  if (packages.length === 0) {
    return (
      <div className="animate-fade-up text-center py-8">
        <p className="text-sm text-muted dark:text-gray-400">Plans will appear here once published — you can continue with the free Starter plan.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 animate-fade-up" style={{ animationDelay: '0.05s' }}>
      <div>
        <h2 className="text-base font-bold text-primary-dark dark:text-white">Choose a plan</h2>
        <p className="text-xs text-muted dark:text-gray-500 mt-0.5">Start free — upgrade anytime from the Subscription page.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {packages.map((pkg) => {
          const selected = pkg.id === selectedId
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onSelect(pkg.id)}
              className={`relative text-left rounded-2xl border p-4 transition-[transform,border-color,background-color,box-shadow,color] duration-200 active:scale-[0.97] motion-reduce:transform-none ${
                selected
                  ? 'border-primary/35 bg-primary/8 shadow-[inset_3px_3px_8px_rgba(30,58,95,0.12)] dark:border-cyan-300/30 dark:bg-cyan-300/8'
                  : 'neumorphic-icon border-border/70 hover:-translate-y-0.5 hover:border-primary/25 dark:hover:border-cyan-300/25'
              }`}
            >
              {selected && (
                <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary dark:bg-blue-500 text-white">
                  <Check size={12} />
                </span>
              )}
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pkg.price === 0 ? 'bg-gray-100 dark:bg-gray-800' : 'bg-primary/10 dark:bg-primary/20'}`}>
                  {pkg.price === 0 ? <Package size={18} className="text-gray-500" /> : <Crown size={18} className="text-primary dark:text-blue-400" />}
                </div>
                <div>
                  <p className={`text-sm font-bold ${selected ? 'text-primary dark:text-blue-400' : 'text-primary-dark dark:text-white'}`}>{pkg.name}</p>
                  <p className="text-xs text-muted dark:text-gray-400">
                    <span className="font-extrabold text-primary-dark dark:text-white">{pkg.price === 0 ? 'Free' : formatCurrency(pkg.price)}</span>
                    {pkg.price > 0 && <span>/{pkg.billingCycle === 'yearly' ? 'year' : 'month'}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted dark:text-gray-400 mb-2">
                <Building2 size={13} className="text-primary dark:text-blue-400" />
                {pkg.maxProperties === -1 ? 'Unlimited' : pkg.maxProperties} properties
              </div>
              {pkg.benefits.length > 0 && (
                <ul className="space-y-1">
                  {pkg.benefits.slice(0, 3).map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted dark:text-gray-400">
                      <Check size={11} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
