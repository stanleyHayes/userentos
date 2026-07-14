import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { BadgeCard } from '@/components/badges/BadgeCard'
import { StreakRing } from '@/components/badges/StreakRing'
import { useMyAchievements, useMyStreak, useStreakLeaderboard } from '@/hooks/useApi'
import { ACHIEVEMENT_CATALOG } from '@/types'
import type { AchievementTier } from '@/types'
import { Trophy, TrendingUp, Medal, Star, Award, Flame } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { WatermarkConstellation } from '@/components/ui/Watermark'

const TIER_ORDER: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum']

export function AchievementsPage() {
  const { data: achievementsData } = useMyAchievements()
  const { data: streak } = useMyStreak()
  const { data: leaderboardData } = useStreakLeaderboard()

  const earnedMap = useMemo(() => {
    const map = new Map<string, { earnedAt?: string }>()
    for (const a of achievementsData?.items ?? []) {
      map.set(a.code, { earnedAt: a.earnedAt })
    }
    return map
  }, [achievementsData])

  const sortedCatalog = useMemo(
    () => [...ACHIEVEMENT_CATALOG].sort(
      (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
    ),
    [],
  )

  const earnedCount = earnedMap.size
  const totalCount = ACHIEVEMENT_CATALOG.length
  const currentStreak = streak?.currentStreak ?? 0
  const longestStreak = streak?.longestStreak ?? 0

  const leaderboard = leaderboardData?.items ?? []

  return (
    <div className="space-y-6">
      <div className="relative flex items-center justify-between flex-wrap gap-3 overflow-hidden">
        <WatermarkConstellation icons={[Trophy, Medal, Star, Award, Flame]} />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-primary-dark dark:text-white">Achievements</h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            Track your streaks, unlock badges, and stay on top of the leaderboard.
          </p>
        </div>
        <Badge variant="success" className="relative z-10 text-xs">
          {earnedCount} of {totalCount} unlocked
        </Badge>
      </div>

      {/* Streak + leaderboard summary row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={16} className="text-orange-500" />
              Your Payment Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-3">
              <StreakRing streak={currentStreak} />
              <div className="grid grid-cols-2 gap-3 w-full mt-2">
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                  <p className="text-xs text-muted dark:text-gray-500">Current</p>
                  <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{currentStreak}</p>
                </div>
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                  <p className="text-xs text-muted dark:text-gray-500">Longest</p>
                  <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{longestStreak}</p>
                </div>
              </div>
              <p className="text-xs text-center text-muted dark:text-gray-500 mt-2">
                {currentStreak === 0
                  ? 'Make your first on-time payment to start your streak.'
                  : currentStreak < 3
                    ? 'Keep paying on time to unlock the 3-month badge!'
                    : currentStreak < 12
                      ? "You're doing great. Don't break the chain!"
                      : 'Legendary consistency — keep it up!'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy size={16} className="text-yellow-500" />
              Streak Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <EmptyState preset="general" title="No streak data yet" description="Be the first to start a streak!" icon={<Trophy size={40} />} compact />
            ) : (
              <ol className="space-y-2">
                {leaderboard.slice(0, 10).map((entry, i) => (
                  <li
                    key={entry.userId}
                    className="flex items-center gap-3 rounded-lg bg-surface dark:bg-[#0c0e1a] px-3 py-2"
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0
                        ? 'bg-yellow-400 text-yellow-950'
                        : i === 1
                          ? 'bg-slate-300 text-slate-800'
                          : i === 2
                            ? 'bg-amber-600 text-white'
                            : 'bg-border dark:bg-[#252a3a] text-muted dark:text-gray-400'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-primary-dark dark:text-white truncate">
                      {entry.displayName}
                    </span>
                    <Badge variant="muted" className="text-[10px] capitalize">{entry.tier}</Badge>
                    <span className="text-xs font-bold text-primary-dark dark:text-white tabular-nums">
                      {entry.longestStreak} mo
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Badges grid */}
      <Card>
        <CardHeader>
          <CardTitle>All Badges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {sortedCatalog.map((def) => {
              const earned = earnedMap.get(def.code)
              return (
                <BadgeCard
                  key={def.code}
                  title={def.title}
                  description={def.description}
                  icon={def.icon}
                  tier={def.tier}
                  earned={!!earned}
                  earnedAt={earned?.earnedAt}
                />
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
