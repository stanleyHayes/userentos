import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import {
  TrendingUp, Shield, PiggyBank, FileText, Clock, Search,
  AlertTriangle, CheckCircle2, Info, ArrowUpRight, ArrowDownRight,
  CreditCard, Lightbulb, ChevronRight, Gavel,
} from 'lucide-react'
import { FormSkeleton } from '@/components/ui/Skeleton'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface CreditScoreData {
  score: number
  factors: {
    paymentHistory: number
    savingsConsistency: number
    agreementCompliance: number
    disputeRecord: number
    accountAge: number
  }
  insights: string[]
  stats: Record<string, number>
  history: { score: number; date: string }[]
  calculatedAt: string
}

function getScoreLabel(score: number) {
  if (score >= 80) return { label: 'Excellent', color: 'text-emerald-500', bg: 'bg-emerald-500', hex: '#10b981', gradient: 'from-emerald-500 to-teal-400' }
  if (score >= 60) return { label: 'Good', color: 'text-blue-500', bg: 'bg-blue-500', hex: '#3b82f6', gradient: 'from-blue-500 to-indigo-400' }
  if (score >= 40) return { label: 'Fair', color: 'text-amber-500', bg: 'bg-amber-500', hex: '#f59e0b', gradient: 'from-amber-500 to-orange-400' }
  return { label: 'Needs Work', color: 'text-red-500', bg: 'bg-red-500', hex: '#ef4444', gradient: 'from-red-500 to-rose-400' }
}

const factorConfig = [
  { key: 'paymentHistory', label: 'Payment History', max: 40, weight: '40%', icon: <CreditCard size={18} />, color: 'from-blue-500 to-indigo-500', desc: 'Tracks your rent payment completion rate, consecutive on-time payments, and failed payment penalties' },
  { key: 'savingsConsistency', label: 'Savings Discipline', max: 20, weight: '20%', icon: <PiggyBank size={18} />, color: 'from-violet-500 to-purple-500', desc: 'Based on active RentGuard plans, average savings progress, and completed savings goals' },
  { key: 'agreementCompliance', label: 'Agreement Compliance', max: 20, weight: '20%', icon: <FileText size={18} />, color: 'from-emerald-500 to-teal-500', desc: 'Active agreement status, compliance violations, warnings, and clean record bonus' },
  { key: 'disputeRecord', label: 'Dispute Record', max: 10, weight: '10%', icon: <Gavel size={18} />, color: 'from-amber-500 to-orange-500', desc: 'Fewer open disputes is better. Escalated disputes carry heavier penalties' },
  { key: 'accountAge', label: 'Account Tenure', max: 10, weight: '10%', icon: <Clock size={18} />, color: 'from-cyan-500 to-blue-500', desc: 'Longer account history, email verification, and 12+ month loyalty bonus' },
]

export function CreditScorePage() {
  const user = useAuthStore((s) => s.user)
  const canLookup = user?.activeRole === 'landlord' || user?.activeRole === 'admin' || user?.activeRole === 'government' || user?.activeRole === 'legal_officer'
  const [lookupId, setLookupId] = useState('')
  const [lookupUserId, setLookupUserId] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['credit-score'],
    queryFn: () => api.get<CreditScoreData>('/credit/me'),
  })

  const { data: lookupData, isLoading: lookupLoading, isError: lookupError } = useQuery({
    queryKey: ['credit-score', lookupUserId],
    queryFn: () => api.get<CreditScoreData>(`/credit/${lookupUserId}`),
    enabled: !!lookupUserId,
  })

  if (isLoading) return <FormSkeleton fields={5} />
  if (!data) return null

  const scoreInfo = getScoreLabel(data.score)
  const history = data.history ?? []
  const prevScore = history.length >= 2 ? history[history.length - 2]?.score : data.score
  const scoreDelta = data.score - prevScore
  const stats = data.stats ?? {}

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${scoreInfo.gradient} flex items-center justify-center text-white`}>
          <Shield size={20} />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
            Rent Credit Score
          </h1>
          <p className="text-xs text-muted dark:text-gray-400">Your rental reliability score based on real activity</p>
        </div>
      </div>

      {/* Score Hero Card */}
      <Card className="overflow-hidden">
        <div className={`h-1.5 bg-gradient-to-r ${scoreInfo.gradient}`} />
        <CardContent>
          <div className="flex flex-col md:flex-row items-center gap-8 py-2">
            {/* Gauge */}
            <div className="relative flex-shrink-0">
              <svg className="w-44 h-44" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={scoreInfo.hex} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={scoreInfo.hex} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r="50" fill="url(#scoreGrad)" />
                <circle cx="60" cy="60" r="50" fill="none" className="stroke-gray-200 dark:stroke-[#1e293b]" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="50" fill="none"
                  stroke={scoreInfo.hex}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(data.score / 100) * 314} 314`}
                  transform="rotate(-90 60 60)"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-extrabold font-display" style={{ color: scoreInfo.hex }}>{data.score}</span>
                <span className="text-[10px] text-muted dark:text-gray-500 mt-0.5">out of 100</span>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                <Badge className={`${scoreInfo.bg} text-white border-0 text-sm px-3 py-1`}>{scoreInfo.label}</Badge>
                {scoreDelta !== 0 && (
                  <span className={`flex items-center gap-0.5 text-xs font-semibold ${scoreDelta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {scoreDelta > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {scoreDelta > 0 ? '+' : ''}{scoreDelta} pts
                  </span>
                )}
              </div>
              <p className="text-sm text-muted dark:text-gray-400 leading-relaxed">
                Your credit score is calculated from your payment history, savings activity, agreement compliance, dispute record, and account tenure.
              </p>
              <p className="text-[11px] text-muted dark:text-gray-500 mt-2">
                Last updated: {new Date(data.calculatedAt).toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>

              {/* Quick stats */}
              <div className="flex flex-wrap gap-3 mt-4">
                <MiniStat label="Payments" value={`${stats.completedPayments ?? 0}/${stats.totalPayments ?? 0}`} />
                <MiniStat label="Savings Plans" value={String(stats.activeSavingsPlans ?? 0)} />
                <MiniStat label="Agreements" value={String(stats.activeAgreements ?? 0)} />
                <MiniStat label="Disputes" value={String(stats.openDisputes ?? 0)} alert={(stats.openDisputes ?? 0) > 0} />
                <MiniStat label="Account Age" value={`${stats.accountAgeMonths ?? 0}mo`} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score History Chart */}
      {history.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={16} className="text-primary dark:text-blue-400" />
              Score History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="histFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={scoreInfo.hex} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={scoreInfo.hex} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(d) => new Date(d).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                    formatter={(value) => [String(value ?? ''), 'Score']}
                    labelFormatter={(d) => new Date(d).toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  />
                  <Area type="monotone" dataKey="score" stroke={scoreInfo.hex} strokeWidth={2.5} fill="url(#histFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Factor Breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Info size={16} className="text-primary dark:text-blue-400" />
              Score Breakdown
            </CardTitle>
            <span className="text-[10px] text-muted dark:text-gray-500">Higher is better</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {factorConfig.map((factor) => {
              const value = data.factors[factor.key as keyof typeof data.factors]
              const pct = Math.round((value / factor.max) * 100)
              const barColor = pct >= 75 ? '#10b981' : pct >= 50 ? '#3b82f6' : pct >= 25 ? '#f59e0b' : '#ef4444'

              return (
                <div key={factor.key} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${factor.color} flex items-center justify-center text-white flex-shrink-0 group-hover:scale-110 transition-transform`}>
                        {factor.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-primary-dark dark:text-white">{factor.label}</span>
                          <span className="text-[9px] text-muted dark:text-gray-500 bg-surface dark:bg-[#1e293b] px-1.5 py-0.5 rounded">{factor.weight}</span>
                        </div>
                        <p className="text-[10px] text-muted dark:text-gray-500 leading-relaxed mt-0.5 hidden sm:block">{factor.desc}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-lg font-extrabold font-display" style={{ color: barColor }}>{value}</span>
                      <span className="text-xs text-muted dark:text-gray-500">/{factor.max}</span>
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full bg-surface dark:bg-[#0f172a] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      {data.insights && data.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-500" />
              Personalized Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.insights.map((insight, i) => {
                const isPositive = insight.includes('Excellent') || insight.includes('Great') || insight.includes('strongest')
                return (
                  <div key={i} className={`flex items-start gap-3 rounded-xl px-4 py-3 ${isPositive ? 'bg-emerald-500/5 border border-emerald-500/10' : 'bg-amber-500/5 border border-amber-500/10'}`}>
                    {isPositive ? (
                      <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    )}
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{insight}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Algorithm Explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info size={16} className="text-muted" />
            How Your Score is Calculated
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { factor: 'Payment History', weight: '40 pts', items: ['Completion rate (0-30 pts)', 'Perfect record bonus (+5)', 'Consecutive streak bonus (+5)', 'Failed payment penalty (-3 each)'] },
              { factor: 'Savings Discipline', weight: '20 pts', items: ['Average plan progress (0-14 pts)', 'Completed plan bonus (+3)', 'Diversified plans bonus (+3)'] },
              { factor: 'Agreement Compliance', weight: '20 pts', items: ['Active agreement base (15 pts)', 'Violation penalty (-8 each)', 'Warning penalty (-3 each)', 'Clean record bonus (+5)'] },
              { factor: 'Dispute + Tenure', weight: '20 pts', items: ['Open dispute penalty (-4 each)', 'Escalation penalty (-2 each)', '1 pt per month age (max 6)', 'Verification & loyalty bonus (+4)'] },
            ].map((section) => (
              <div key={section.factor} className="rounded-xl bg-surface/50 dark:bg-[#0f172a]/40 border border-border/30 dark:border-[#334155]/30 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-primary-dark dark:text-white">{section.factor}</h4>
                  <Badge variant="default" className="text-[9px]">{section.weight}</Badge>
                </div>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item} className="text-[11px] text-muted dark:text-gray-400 flex items-start gap-1.5">
                      <ChevronRight size={10} className="mt-0.5 flex-shrink-0 text-muted/50" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tenant Lookup */}
      {canLookup && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search size={16} className="text-primary dark:text-blue-400" />
              Lookup Tenant Credit Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => { e.preventDefault(); setLookupUserId(lookupId) }}
              className="flex items-end gap-3 mb-4"
            >
              <div className="flex-1">
                <Input
                  id="lookup-id"
                  label="Tenant User ID"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  placeholder="Enter tenant's user ID"
                  required
                />
              </div>
              <Button type="submit" disabled={!lookupId || lookupLoading}>
                <Search size={14} /> {lookupLoading ? 'Loading...' : 'Lookup'}
              </Button>
            </form>

            {lookupError && (
              <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-sm text-danger">
                Could not fetch credit score. The user may not exist or you may not have permission.
              </div>
            )}

            {lookupData && <LookupResult data={lookupData} />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MiniStat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-1.5 text-center ${alert ? 'bg-red-500/10' : 'bg-surface dark:bg-[#1e293b]'}`}>
      <p className={`text-sm font-bold ${alert ? 'text-red-500' : 'text-primary-dark dark:text-white'}`}>{value}</p>
      <p className="text-[9px] text-muted dark:text-gray-500">{label}</p>
    </div>
  )
}

function LookupResult({ data }: { data: CreditScoreData }) {
  const info = getScoreLabel(data.score)

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <svg className="w-24 h-24" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="none" className="stroke-gray-200 dark:stroke-[#1e293b]" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="50" fill="none"
              stroke={info.hex}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(data.score / 100) * 314} 314`}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold font-display" style={{ color: info.hex }}>{data.score}</span>
          </div>
        </div>
        <div>
          <Badge className={`${info.bg} text-white border-0 text-xs px-2 py-0.5`}>{info.label}</Badge>
          <p className="text-xs text-muted dark:text-gray-400 mt-2">
            Last calculated: {new Date(data.calculatedAt).toLocaleDateString('en-GH')}
          </p>
          {data.stats && (
            <div className="flex gap-2 mt-2">
              <MiniStat label="Payments" value={`${data.stats.completedPayments ?? 0}/${data.stats.totalPayments ?? 0}`} />
              <MiniStat label="Disputes" value={String(data.stats.openDisputes ?? 0)} alert={(data.stats.openDisputes ?? 0) > 0} />
            </div>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {factorConfig.map((factor) => {
          const value = data.factors[factor.key as keyof typeof data.factors]
          const pct = Math.round((value / factor.max) * 100)
          const barColor = pct >= 75 ? '#10b981' : pct >= 50 ? '#3b82f6' : pct >= 25 ? '#f59e0b' : '#ef4444'
          return (
            <div key={factor.key} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${factor.color} flex items-center justify-center text-white flex-shrink-0`}>
                {factor.icon}
              </div>
              <span className="text-xs text-muted dark:text-gray-400 w-28 truncate">{factor.label}</span>
              <div className="flex-1 h-2 rounded-full bg-surface dark:bg-[#0f172a] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
              </div>
              <span className="text-xs font-bold text-primary-dark dark:text-white w-12 text-right">{value}/{factor.max}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
