import { Link } from 'react-router-dom'
import type { SavingsPlan } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'

interface TenantSavingsGoalCardProps {
  plan: SavingsPlan
}

export function TenantSavingsGoalCard({ plan }: TenantSavingsGoalCardProps) {
  /* Savings progress */
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Savings Goal</CardTitle>
          <Link to="/savings"><Badge variant="success" className="cursor-pointer text-[10px]">On track</Badge></Link>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{formatCurrency(plan.currentAmount)}</p>
        <p className="text-[11px] text-muted dark:text-gray-500 mb-3">of {formatCurrency(plan.targetAmount)} target</p>
        <div className="h-2.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400" style={{ width: `${Math.min(100, (plan.currentAmount / plan.targetAmount) * 100)}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-accent font-semibold">{Math.min(100, Math.round((plan.currentAmount / plan.targetAmount) * 100))}%</span>
          <span className="text-[10px] text-muted dark:text-gray-500">Due {formatDate(plan.targetDate)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
