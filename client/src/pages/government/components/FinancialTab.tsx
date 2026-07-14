import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { CreditCard, DollarSign, Landmark, HandCoins, BarChart3, PiggyBank } from 'lucide-react'
import { ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, BarChart, Bar } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { num, tooltipStyle } from './analytics-constants'
import { EmptyState } from './PanelEmptyState'
import { KPICard } from './KPICard'
import { StatusBreakdownCard } from './StatusBreakdownCard'
import { PieCard } from './PieCard'
import { QuickRow } from './QuickRow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
export function FinancialTab({ pay, inv, lo, wal, sav }: any) {
  const monthlyVolume = pay.monthlyVolume ?? {}
  const volumeData = Object.entries(monthlyVolume)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amount]) => ({
      month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      amount: amount as number,
    }))

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<CreditCard size={18} />} label="Total Payments" value={num(pay.total)} detail={`Avg: ${formatCurrency(pay.avgPaymentAmount ?? 0)}`} gradient="from-blue-500 to-indigo-600" />
        <KPICard icon={<DollarSign size={18} />} label="Completed Volume" value={formatCurrency(pay.completedVolume ?? 0)} detail={`${num(pay.byStatus?.completed)} completed`} gradient="from-emerald-500 to-teal-600" />
        <KPICard icon={<Landmark size={18} />} label="Total Invested" value={formatCurrency(inv.totalInvested ?? 0)} detail={`${num(inv.total)} investments`} gradient="from-cyan-500 to-blue-600" />
        <KPICard icon={<HandCoins size={18} />} label="Loans Disbursed" value={formatCurrency(lo.totalDisbursed ?? 0)} detail={`${formatCurrency(lo.totalOutstanding ?? 0)} outstanding`} gradient="from-orange-500 to-red-600" />
      </div>

      {/* Volume Chart (12 months) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 size={16} className="text-primary dark:text-blue-400" />Monthly Payment Volume (12 months)</CardTitle></CardHeader>
        <CardContent>
          {volumeData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={volumeData}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252a3a" strokeOpacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), 'Volume']} />
                  <Bar dataKey="amount" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState text="No payment data" />}
        </CardContent>
      </Card>

      {/* Payment breakdown + Methods + Investments + Loans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatusBreakdownCard title="Payment Status" icon={<CreditCard size={16} />} data={pay.byStatus ?? {}} total={pay.total ?? 0} />
        <PieCard title="Payment Methods" data={pay.byMethod ?? {}} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Landmark size={16} className="text-cyan-500" />Investments</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Investments" value={num(inv.total)} />
              <QuickRow label="Total Invested" value={formatCurrency(inv.totalInvested ?? 0)} />
              <QuickRow label="Expected Returns" value={formatCurrency(inv.totalExpectedReturn ?? 0)} />
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Status</p>
                {Object.entries(inv.byStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s} value={num(c as number)} />)}
              </div>
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Type</p>
                {Object.entries(inv.byType ?? {}).map(([s, c]) => <QuickRow key={s} label={s.replace(/_/g, ' ')} value={num(c as number)} />)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><HandCoins size={16} className="text-orange-500" />Loans</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Loans" value={num(lo.total)} />
              <QuickRow label="Total Disbursed" value={formatCurrency(lo.totalDisbursed ?? 0)} />
              <QuickRow label="Total Repaid" value={formatCurrency(lo.totalRepaid ?? 0)} />
              <QuickRow label="Outstanding" value={formatCurrency(lo.totalOutstanding ?? 0)} />
              <QuickRow label="Default Rate" value={`${lo.defaultRate ?? 0}%`} alert={(lo.defaultRate ?? 0) > 10} />
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Status</p>
                {Object.entries(lo.byStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s} value={num(c as number)} />)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Wallets + Savings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard size={16} className="text-violet-500" />Wallets</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Wallets" value={num(wal.total)} />
              <QuickRow label="Combined Balance" value={formatCurrency(wal.totalBalance ?? 0)} />
              <QuickRow label="Total Transactions" value={num(wal.totalTransactions)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PiggyBank size={16} className="text-emerald-500" />RentGuard Savings</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Plans" value={num(sav.totalPlans)} />
              <QuickRow label="Active Savers" value={num(sav.activeSavers)} />
              <QuickRow label="Total Saved" value={formatCurrency(sav.totalSaved ?? 0)} />
              <QuickRow label="Total Targeted" value={formatCurrency(sav.totalTargeted ?? 0)} />
              <QuickRow label="Completion Rate" value={`${sav.completionRate ?? 0}%`} />
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted">Savings Progress</span>
                  <span className="font-bold text-emerald-500">{sav.savingsProgress ?? 0}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all" style={{ width: `${Math.min(sav.savingsProgress ?? 0, 100)}%` }} />
                </div>
              </div>
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Status</p>
                {Object.entries(sav.byStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s} value={num(c as number)} />)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
