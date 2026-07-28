import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Wifi, Truck, Sparkles, Sofa, ClipboardList, Camera, KeyRound, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import type { BusinessCategory, BusinessWithListings } from '@/hooks/useApi'

interface Task {
  key: string
  label: string
  icon: React.ReactNode
  /** When set, the task suggests local businesses of this category in the city. */
  category?: BusinessCategory
}

const TASKS: Task[] = [
  { key: 'handover', label: 'Confirm move-in date & key handover', icon: <KeyRound size={15} /> },
  { key: 'meters', label: 'Photograph meter readings & condition', icon: <Camera size={15} /> },
  { key: 'internet', label: 'Set up home internet', icon: <Wifi size={15} />, category: 'internet' },
  { key: 'movers', label: 'Schedule movers', icon: <Truck size={15} />, category: 'moving' },
  { key: 'cleaning', label: 'Book a deep clean', icon: <Sparkles size={15} />, category: 'cleaning' },
  { key: 'furniture', label: 'Buy furniture & essentials', icon: <Sofa size={15} />, category: 'furniture' },
  { key: 'address', label: 'Update your address everywhere', icon: <MapPin size={15} /> },
]

function loadChecked(agreementId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`rentos-movein-${agreementId}`) ?? '[]') as string[]
  } catch {
    return []
  }
}

/**
 * Move-in checklist for tenants — progress persists per agreement in
 * localStorage; city-aware tasks point at local businesses in the area.
 */
export function MoveInChecklist({ agreementId, city, businessItems }: { agreementId: string; city: string; businessItems: BusinessWithListings[] }) {
  const [checked, setChecked] = useState<string[]>(() => loadChecked(agreementId))

  const categoriesInCity = new Set(businessItems.map((i) => i.business.category))

  function toggle(key: string) {
    setChecked((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      localStorage.setItem(`rentos-movein-${agreementId}`, JSON.stringify(next))
      return next
    })
  }

  const done = checked.length
  const pct = Math.round((done / TASKS.length) * 100)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardList size={16} className="text-primary dark:text-blue-400" />
          Move-in checklist
          <span className="ml-auto text-xs font-semibold text-muted dark:text-gray-500">{done}/{TASKS.length}</span>
        </CardTitle>
        {/* Progress */}
        <div className="mt-2 h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {TASKS.map((task) => {
            const isDone = checked.includes(task.key)
            const nearby = task.category && categoriesInCity.has(task.category)
            return (
              <li key={task.key} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface/70 dark:hover:bg-white/[0.03] transition-colors">
                <button
                  type="button"
                  onClick={() => toggle(task.key)}
                  aria-pressed={isDone}
                  className={`neumorphic-icon flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors ${
                    isDone ? 'bg-accent border-accent text-white' : 'text-transparent'
                  }`}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <span className={`text-muted dark:text-gray-500 ${isDone ? 'opacity-50' : ''}`}>{task.icon}</span>
                <span className={`text-sm flex-1 ${isDone ? 'line-through text-muted dark:text-gray-600' : 'text-primary-dark dark:text-gray-200'}`}>
                  {task.label}
                </span>
                {nearby && !isDone && (
                  <Link to="/local-services" className="text-[11px] font-semibold text-primary dark:text-blue-400 hover:underline whitespace-nowrap">
                    Nearby options →
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
        {city && <p className="mt-3 text-[11px] text-muted dark:text-gray-500">Suggestions based on {city}.</p>}
      </CardContent>
    </Card>
  )
}
