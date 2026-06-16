import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StreakRingProps {
  /** Current streak in months */
  streak: number
  /** Optional sub-label below the count */
  label?: string
  /** Diameter in pixels */
  size?: number
  className?: string
}

function tierColors(streak: number): { stroke: string; glow: string; text: string } {
  if (streak >= 24) return { stroke: '#a78bfa', glow: 'drop-shadow(0 0 12px rgba(167,139,250,0.45))', text: 'text-violet-400' }
  if (streak >= 12) return { stroke: '#facc15', glow: 'drop-shadow(0 0 12px rgba(250,204,21,0.45))', text: 'text-yellow-400' }
  if (streak >= 6) return { stroke: '#94a3b8', glow: 'drop-shadow(0 0 8px rgba(148,163,184,0.4))', text: 'text-slate-400' }
  if (streak >= 3) return { stroke: '#f97316', glow: 'drop-shadow(0 0 8px rgba(249,115,22,0.4))', text: 'text-orange-500' }
  return { stroke: '#3b82f6', glow: 'drop-shadow(0 0 6px rgba(59,130,246,0.35))', text: 'text-blue-500' }
}

// Threshold ladder used to compute % progress within the current tier
const TIERS = [3, 6, 12, 24]

function progressFraction(streak: number): number {
  if (streak <= 0) return 0
  let prev = 0
  for (const t of TIERS) {
    if (streak < t) return (streak - prev) / (t - prev)
    prev = t
  }
  return 1
}

export function StreakRing({ streak, label, size = 144, className }: StreakRingProps) {
  const stroke = 8
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = progressFraction(streak)
  const dash = circumference * fraction
  const colors = tierColors(streak)

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        style={{ filter: streak > 0 ? colors.glow : undefined }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border dark:stroke-[#252a3a]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{
            transition: 'stroke-dasharray 800ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Flame size={size > 120 ? 18 : 14} className={cn('mb-1', colors.text)} />
        <span className="text-3xl font-extrabold font-display text-primary-dark dark:text-white leading-none">{streak}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-gray-500 mt-0.5">
          {label ?? (streak === 1 ? 'month' : 'months')}
        </span>
      </div>
    </div>
  )
}
