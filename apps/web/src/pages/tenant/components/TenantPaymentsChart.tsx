import { Link } from 'react-router-dom'
import type { Payment } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'
import { ArrowRight, CheckCircle } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'

interface TenantPaymentsChartProps {
  completedPayments: Payment[]
  recentPayments: Payment[]
}

export function TenantPaymentsChart({ completedPayments, recentPayments }: TenantPaymentsChartProps) {
  // Payment chart
  const monthMap: Record<string, number> = {}
  for (const p of completedPayments) {
    const m = (p.paidAt ?? p.createdAt).slice(0, 7)
    monthMap[m] = (monthMap[m] ?? 0) + p.amount
  }
  const chartData = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, total]) => ({ month, total }))

  /* Payment chart + summary */
  return (
    <Card className="overflow-hidden p-0">
      <div className="p-4 sm:p-5 pb-0">
        <div className="flex items-center justify-between mb-1 gap-2">
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-bold text-primary-dark dark:text-white tracking-tight">Rent Payments</p>
            <p className="text-[11px] sm:text-xs text-muted dark:text-gray-500">Monthly spending overview</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{formatCurrency(completedPayments.reduce((s, p) => s + p.amount, 0))}</p>
              <p className="text-[10px] text-muted dark:text-gray-500">Total paid</p>
            </div>
            <Link to="/payments">
              <Button size="sm" variant="outline" className="text-xs gap-1"><span className="hidden sm:inline">View all</span><span className="sm:hidden">All</span> <ArrowRight size={12} /></Button>
            </Link>
          </div>
        </div>
      </div>

      {chartData.length > 1 ? (
        <div className="h-44 sm:h-52 mt-2 min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f015" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={35} />
              <Tooltip contentStyle={{ background: '#0c0e1a', border: '1px solid #252a3a', borderRadius: 12, color: '#e2e8f0', fontSize: 12, padding: '8px 12px' }} formatter={(value) => [formatCurrency(Number(value)), 'Paid']} cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2.5} fill="url(#areaFill)" dot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2.5 }} activeDot={{ r: 7, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2.5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-52 flex flex-col items-center justify-center">
          <EmptyState preset="payments" title="No payments yet" description="Your payment chart will build up here over time." action={{ label: 'Make first payment', href: '/payments' }} compact />
        </div>
      )}

      {/* Payment mini-cards strip */}
      {recentPayments.length > 0 && (
        <div className="px-3 sm:px-5 py-3 sm:py-4 bg-surface/50 dark:bg-[#0c0e1a]/50 border-t border-border/30 dark:border-[#252a3a]/30">
          <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1">
            {recentPayments.slice(0, 4).map((p) => (
              <div key={p.id} className="flex-shrink-0 flex items-center gap-2.5 rounded-xl bg-white dark:bg-[#161927] border border-border/50 dark:border-[#252a3a]/50 px-3.5 py-2.5 min-w-[180px]">
                <div className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent/20 flex items-center justify-center">
                  <CheckCircle size={14} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary-dark dark:text-white">{formatCurrency(p.amount)}</p>
                  <p className="text-[10px] text-muted dark:text-gray-500 truncate">{p.paidAt?.slice(0, 10)} - {p.method.replace('_', ' ')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
