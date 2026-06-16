import {
  Home, Flame, Crown, Trophy, BadgeCheck, PiggyBank, Target, Briefcase,
  Building2, ShieldCheck, CheckCircle2, Award, Lock, type LucideIcon,
} from 'lucide-react'
import Tooltip from '@mui/material/Tooltip'
import { cn } from '@/lib/utils'
import type { AchievementTier } from '@/types'

const TIER_GRADIENT: Record<AchievementTier, string> = {
  bronze: 'from-amber-700 via-amber-500 to-orange-400',
  silver: 'from-slate-400 via-slate-300 to-slate-200',
  gold: 'from-yellow-500 via-amber-400 to-yellow-300',
  platinum: 'from-cyan-400 via-violet-400 to-fuchsia-400',
}

const TIER_RING: Record<AchievementTier, string> = {
  bronze: 'ring-amber-500/30',
  silver: 'ring-slate-400/30',
  gold: 'ring-yellow-400/40',
  platinum: 'ring-violet-400/40',
}

const ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  flame: Flame,
  crown: Crown,
  trophy: Trophy,
  'badge-check': BadgeCheck,
  'piggy-bank': PiggyBank,
  target: Target,
  briefcase: Briefcase,
  'building-2': Building2,
  'shield-check': ShieldCheck,
  'check-circle-2': CheckCircle2,
}

export interface BadgeCardProps {
  title: string
  description: string
  icon: string
  tier: AchievementTier
  earned: boolean
  earnedAt?: string
  className?: string
}

export function BadgeCard({ title, description, icon, tier, earned, earnedAt, className }: BadgeCardProps) {
  const Icon = ICON_MAP[icon] ?? Award
  const gradient = TIER_GRADIENT[tier]
  const ring = TIER_RING[tier]

  return (
    <Tooltip
      title={
        <div className="text-xs">
          <p className="font-bold mb-0.5">{title}</p>
          <p>{description}</p>
          {earned && earnedAt && <p className="opacity-70 mt-1">Earned {new Date(earnedAt).toLocaleDateString()}</p>}
        </div>
      }
      placement="top"
      arrow
    >
      <div
        className={cn(
          'group relative rounded-2xl p-4 border transition-all',
          earned
            ? `bg-gradient-to-br ${gradient} border-white/20 shadow-lg ring-2 ${ring} hover:-translate-y-0.5 hover:shadow-xl`
            : 'bg-surface dark:bg-[#0c0e1a] border-border/40 dark:border-[#252a3a]/40 opacity-60 hover:opacity-80',
          className,
        )}
      >
        <div className="flex flex-col items-center text-center gap-2">
          <div
            className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-sm',
              earned ? 'bg-white/30 text-white' : 'bg-muted/10 dark:bg-gray-700/20 text-muted dark:text-gray-500',
            )}
          >
            {earned ? <Icon size={26} /> : <Lock size={22} />}
          </div>
          <p
            className={cn(
              'text-xs font-bold tracking-tight truncate w-full',
              earned ? 'text-white drop-shadow-sm' : 'text-primary-dark dark:text-gray-300',
            )}
          >
            {title}
          </p>
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wider',
              earned ? 'text-white/80' : 'text-muted dark:text-gray-500',
            )}
          >
            {tier}
          </span>
        </div>
      </div>
    </Tooltip>
  )
}
