import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { useQuery, useMutation } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import { ListSkeleton } from '@/components/ui/Skeleton'
import TextField from '@mui/material/TextField'
import {
  ShieldCheck, TrendingUp, TrendingDown, Activity, Building2, Users,
  Calculator, BarChart3, AlertTriangle, DollarSign, Clock, Gauge,
} from 'lucide-react'
import { DoodleZigzag } from '@/components/ui/Doodles'

// --- Types ---

interface RentCapResult {
  affectedProperties: number
  totalProperties: number
  affectedPercentage: number
  currentAvgRent: number
  newAvgRent: number
  totalMonthlyReduction: number
  annualSavingsForTenants: number
  estimatedRevenueImpact: number
}

interface AdvanceLimitResult {
  affectedAgreements: number
  totalAgreements: number
  affectedPercentage: number
  totalPropertiesAffected: number
  currentAvgAdvance: number
  estimatedTenantRelief: number
}

interface MarketHealthData {
  overallScore: number
  indicators: {
    label: string
    value: string
    trend: 'up' | 'down' | 'stable'
    description: string
  }[]
  alerts: {
    level: 'info' | 'warning' | 'critical'
    message: string
  }[]
}

// --- Page ---

export function PolicySimulationPage() {
  return (
    <div className="space-y-6">
      <div className="relative">
        <DoodleZigzag className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
        <h1 className="text-2xl font-bold text-primary-dark dark:text-white">Policy Simulation</h1>
        <p className="text-sm text-muted mt-1">Model the impact of regulatory changes on the rental market</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RentCapSimulator />
        <AdvanceLimitSimulator />
      </div>

      <MarketHealthDashboard />
    </div>
  )
}

// --- Rent Cap Simulator ---

function RentCapSimulator() {
  const [maxRent, setMaxRent] = useState('')

  const simulate = useMutation({
    mutationFn: (body: { maxRent: number }) =>
      api.post<RentCapResult>('/simulation/rent-cap', body),
  })

  function handleSimulate() {
    const amount = parseFloat(maxRent)
    if (!amount || amount <= 0) return
    simulate.mutate({ maxRent: amount })
  }

  const result = simulate.data

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 dark:bg-blue-500/15">
          <DollarSign size={20} className="text-primary dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-primary-dark dark:text-white">Rent Cap Simulator</h2>
          <p className="text-xs text-muted dark:text-gray-400">Estimate impact of a maximum rent ceiling</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <TextField
            label="Maximum Rent (GHS/month)"
            type="number"
            value={maxRent}
            onChange={(e) => setMaxRent(e.target.value)}
            fullWidth
            placeholder="e.g. 3000"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button onClick={handleSimulate} disabled={simulate.isPending || !maxRent} className="flex-shrink-0">
            {simulate.isPending ? (
              <span className="flex items-center gap-1.5"><Calculator size={14} className="animate-spin" /> Running...</span>
            ) : (
              <span className="flex items-center gap-1.5"><Calculator size={14} /> Simulate</span>
            )}
          </Button>
        </div>

        {simulate.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {(simulate.error as Error).message}
          </div>
        )}

        {result && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <ResultCard
                icon={<Building2 size={16} />}
                label="Affected Properties"
                value={`${result.affectedProperties} / ${result.totalProperties}`}
                percentage={result.affectedPercentage}
              />
              <ResultCard
                icon={<BarChart3 size={16} />}
                label="Current Avg Rent"
                value={formatCurrency(result.currentAvgRent)}
              />
              <ResultCard
                icon={<TrendingDown size={16} />}
                label="New Avg Rent (capped)"
                value={formatCurrency(result.newAvgRent)}
                negative
              />
              <ResultCard
                icon={<Users size={16} />}
                label="Annual Tenant Savings"
                value={formatCurrency(result.annualSavingsForTenants)}
                positive
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// --- Advance Limit Simulator ---

function AdvanceLimitSimulator() {
  const [maxMonths, setMaxMonths] = useState('')

  const simulate = useMutation({
    mutationFn: (body: { maxMonths: number }) =>
      api.post<AdvanceLimitResult>('/simulation/advance-limit', body),
  })

  function handleSimulate() {
    const months = parseInt(maxMonths, 10)
    if (!months || months <= 0) return
    simulate.mutate({ maxMonths: months })
  }

  const result = simulate.data

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 dark:bg-amber-500/15">
          <Clock size={20} className="text-secondary dark:text-amber-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-primary-dark dark:text-white">Advance Limit Simulator</h2>
          <p className="text-xs text-muted dark:text-gray-400">Estimate impact of capping advance rent months</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <TextField
            label="Maximum Advance (months)"
            type="number"
            value={maxMonths}
            onChange={(e) => setMaxMonths(e.target.value)}
            fullWidth
            placeholder="e.g. 6"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button onClick={handleSimulate} disabled={simulate.isPending || !maxMonths} className="flex-shrink-0">
            {simulate.isPending ? (
              <span className="flex items-center gap-1.5"><Calculator size={14} className="animate-spin" /> Running...</span>
            ) : (
              <span className="flex items-center gap-1.5"><Calculator size={14} /> Simulate</span>
            )}
          </Button>
        </div>

        {simulate.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {(simulate.error as Error).message}
          </div>
        )}

        {result && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <ResultCard
                icon={<Building2 size={16} />}
                label="Affected Agreements"
                value={`${result.affectedAgreements} / ${result.totalAgreements}`}
                percentage={result.affectedPercentage}
              />
              <ResultCard
                icon={<Clock size={16} />}
                label="Current Avg Months"
                value={`${(result.currentAvgAdvance ?? 0).toFixed(1)} mo`}
              />
              <ResultCard
                icon={<DollarSign size={16} />}
                label="Est. Tenant Relief"
                value={formatCurrency(result.estimatedTenantRelief)}
                positive
              />
              <ResultCard
                icon={<TrendingUp size={16} />}
                label="Properties Affected"
                value={String(result.totalPropertiesAffected)}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// --- Market Health Dashboard ---

function MarketHealthDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['market-health'],
    queryFn: () => api.get<MarketHealthData>('/simulation/market-health'),
  })

  if (isLoading) return <ListSkeleton rows={3} />

  if (!data) return null

  const scoreColor = data.overallScore >= 70 ? 'text-success' : data.overallScore >= 40 ? 'text-amber-500 dark:text-amber-400' : 'text-danger'
  const scoreBg = data.overallScore >= 70 ? 'bg-success/10' : data.overallScore >= 40 ? 'bg-amber-500/10' : 'bg-danger/10'

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 dark:bg-emerald-500/15">
            <Activity size={20} className="text-accent dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-primary-dark dark:text-white">Market Health Dashboard</h2>
            <p className="text-xs text-muted dark:text-gray-400">Real-time rental market indicators</p>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${scoreBg}`}>
          <Gauge size={16} className={scoreColor} />
          <span className={`text-lg font-extrabold ${scoreColor}`}>{data.overallScore}</span>
          <span className="text-xs text-muted dark:text-gray-400">/100</span>
        </div>
      </div>

      {/* Indicators grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-5">
        {data.indicators.map((indicator, i) => (
          <div key={i} className="rounded-xl border border-border/40 dark:border-[#252a3a]/40 bg-surface dark:bg-[#0c0e1a] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider">{indicator.label}</span>
              {indicator.trend === 'up' ? (
                <TrendingUp size={12} className="text-success" />
              ) : indicator.trend === 'down' ? (
                <TrendingDown size={12} className="text-danger" />
              ) : (
                <Activity size={12} className="text-muted dark:text-gray-500" />
              )}
            </div>
            <p className="text-lg font-extrabold text-primary-dark dark:text-white">{indicator.value}</p>
            <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">{indicator.description}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider">Alerts</p>
          {data.alerts.map((alert, i) => {
            const alertStyles = {
              info: 'bg-primary/5 dark:bg-blue-500/10 border-primary/20 dark:border-blue-500/20 text-primary-dark dark:text-blue-300',
              warning: 'bg-warning/5 dark:bg-amber-500/10 border-warning/20 dark:border-amber-500/20 text-amber-700 dark:text-amber-300',
              critical: 'bg-danger/5 dark:bg-red-500/10 border-danger/20 dark:border-red-500/20 text-danger dark:text-red-300',
            }
            const alertIcons = {
              info: <ShieldCheck size={14} className="text-primary dark:text-blue-400 flex-shrink-0" />,
              warning: <AlertTriangle size={14} className="text-warning dark:text-amber-400 flex-shrink-0" />,
              critical: <AlertTriangle size={14} className="text-danger flex-shrink-0" />,
            }
            return (
              <div key={i} className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${alertStyles[alert.level]}`}>
                {alertIcons[alert.level]}
                {alert.message}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// --- Shared components ---

function ResultCard({ icon, label, value, percentage, positive, negative }: {
  icon: React.ReactNode
  label: string
  value: string
  percentage?: number
  positive?: boolean
  negative?: boolean
}) {
  const valueColor = positive ? 'text-success' : negative ? 'text-danger' : 'text-primary-dark dark:text-white'

  return (
    <div className="rounded-xl border border-border/40 dark:border-[#252a3a]/40 bg-surface dark:bg-[#0c0e1a] p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-muted dark:text-gray-500">{icon}</span>
        <span className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-sm font-extrabold ${valueColor}`}>{value}</p>
      {percentage !== undefined && (
        <div className="mt-1.5">
          <div className="h-1.5 rounded-full bg-border/30 dark:bg-[#252a3a]/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary dark:bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">{percentage}% affected</p>
        </div>
      )}
    </div>
  )
}
