import { Link } from 'react-router-dom'
import type { Achievement, PaymentStreak } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { StreakRing } from '@/components/badges/StreakRing'
import { BadgeCard } from '@/components/badges/BadgeCard'
import { Trophy } from 'lucide-react'

interface TenantBadgesPanelProps {
  streak: PaymentStreak | undefined
  achievements: Achievement[] | undefined
}

export function TenantBadgesPanel({ streak, achievements }: TenantBadgesPanelProps) {
  /* === Your Streak + Recent Badges === */
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Trophy size={14} className="text-orange-500" /> Your Streak</CardTitle>
            <Link to="/achievements" className="text-[11px] text-primary dark:text-blue-400 hover:underline">View all</Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <StreakRing streak={streak?.currentStreak ?? 0} size={112} />
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
                  <p className="text-[10px] text-muted dark:text-gray-500">Current</p>
                  <p className="text-sm font-bold text-primary-dark dark:text-white">{streak?.currentStreak ?? 0} mo</p>
                </div>
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
                  <p className="text-[10px] text-muted dark:text-gray-500">Longest</p>
                  <p className="text-sm font-bold text-primary-dark dark:text-white">{streak?.longestStreak ?? 0} mo</p>
                </div>
              </div>
              <Link to="/payments">
                <Button size="sm" variant="outline" className="w-full text-xs">Keep it going!</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Badges</CardTitle>
            <Link to="/achievements" className="text-[11px] text-primary dark:text-blue-400 hover:underline">See all</Link>
          </div>
        </CardHeader>
        <CardContent>
          {(achievements?.length ?? 0) === 0 ? (
            <EmptyState preset="general" icon={<Trophy size={40} />} title="No badges yet" description="Pay rent on time to earn your first one." compact />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {(achievements ?? []).slice(0, 6).map((a) => (
                <BadgeCard
                  key={a.code}
                  title={a.title}
                  description={a.description}
                  icon={a.icon}
                  tier={a.tier}
                  earned
                  earnedAt={a.earnedAt}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
