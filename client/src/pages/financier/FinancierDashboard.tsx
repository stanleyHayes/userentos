import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { useAuthStore } from '@/stores/authStore'
import {
  useFinancingPortfolio,
  useFinancingApplications,
  useFinancingContracts,
  useMyFinancingOffers,
  useDecideFinancingApplication,
  useDisburseFinancingContract,
} from '@/hooks/useApi'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Banknote, FileSignature, TrendingUp, AlertTriangle, CheckCircle2,
  Clock, Wallet, Percent, Send, ShieldCheck, Plus,
} from 'lucide-react'

export function FinancierDashboard() {
  const user = useAuthStore((s) => s.user)
  const { data: portfolio } = useFinancingPortfolio()
  const { data: applicationsData } = useFinancingApplications()
  const { data: contractsData } = useFinancingContracts()
  const { data: offersData } = useMyFinancingOffers()
  const decide = useDecideFinancingApplication()
  const disburse = useDisburseFinancingContract()

  const applications = applicationsData?.items ?? []
  const pendingApps = applications.filter((a) => a.status === 'submitted' || a.status === 'under_review')
  const contracts = contractsData?.items ?? []
  const pendingDisbursement = contracts.filter((c) => c.status === 'pending_disbursement' && c.signedByApplicant)
  const offers = offersData?.items ?? []
  const activeOffers = offers.filter((o) => o.active).length

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Financier portal"
        title={`${greeting}, ${user?.firstName ?? 'there'}`}
        description="Lend with confidence - manage offers, applications, and repayments"
        tone="financier"
        actions={
          <Link to="/financing/offers/new">
            <Button size="sm" className="bg-white/10 border-0 text-white hover:bg-white/20"><Plus size={14} /> New Offer</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <DashboardMetricCard label="Disbursed" value={formatCurrency(portfolio?.totalDisbursed ?? 0)} sub={`${portfolio?.contractCount ?? 0} contracts`} accent="#10b981" icon={<Banknote size={18} />} href="/financing/contracts" />
        <DashboardMetricCard label="Outstanding" value={formatCurrency(portfolio?.outstanding ?? 0)} sub={`${portfolio?.activeContracts ?? 0} active`} accent="#3b82f6" icon={<Wallet size={18} />} href="/financing/contracts" />
        <DashboardMetricCard label="Repaid" value={formatCurrency(portfolio?.totalRepaid ?? 0)} sub={`${portfolio?.settledContracts ?? 0} settled`} accent="#8b5cf6" icon={<CheckCircle2 size={18} />} href="/financing/contracts" />
        <DashboardMetricCard label="Default Rate" value={`${portfolio?.defaultRate ?? 0}%`} sub={`${portfolio?.defaultedContracts ?? 0} defaulted`} accent={(portfolio?.defaultRate ?? 0) > 5 ? '#ef4444' : '#10b981'} icon={<Percent size={18} />} href="/financing/collections" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Pending applications */}
        <div className="lg:col-span-8 space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Pending Applications</CardTitle>
                <Badge variant={pendingApps.length > 0 ? 'warning' : 'muted'} className="text-[10px]">{pendingApps.length} pending</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {pendingApps.length === 0 ? (
                <div className="text-center py-8">
                  <Clock size={28} className="mx-auto text-muted/40 mb-2" />
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">No pending applications</p>
                  <p className="text-xs text-muted dark:text-gray-500 mt-1">New applications will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingApps.slice(0, 6).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/40 dark:border-[#252a3a]/40 hover:border-primary/30 dark:hover:border-blue-500/30 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-primary-dark dark:text-white truncate">{a.applicantName ?? 'Applicant'}</p>
                          <Badge variant="default" className="text-[10px]">Score {a.creditScoreAtApply ?? '—'}</Badge>
                        </div>
                        <p className="text-xs text-muted dark:text-gray-500 line-clamp-1">{a.purpose}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px]">
                          <span className="font-bold text-primary dark:text-blue-400">{formatCurrency(a.amountRequested)}</span>
                          <span className="text-muted dark:text-gray-500">{a.tenureMonths} mo</span>
                          <span className="text-muted dark:text-gray-500">{formatDate(a.createdAt).split(',')[0]}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="accent"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: a.id, action: 'approve' })}
                        >
                          <CheckCircle2 size={12} /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: a.id, action: 'reject', notes: 'Declined' })}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                  {pendingApps.length > 6 && (
                    <Link to="/financing/applications" className="text-xs text-primary dark:text-blue-400 hover:underline">View all {pendingApps.length} →</Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending disbursements */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Awaiting Disbursement</CardTitle>
                <Badge variant={pendingDisbursement.length > 0 ? 'default' : 'muted'} className="text-[10px]">{pendingDisbursement.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {pendingDisbursement.length === 0 ? (
                <div className="text-center py-6">
                  <Send size={24} className="mx-auto text-muted/40 mb-2" />
                  <p className="text-xs text-muted dark:text-gray-500">No contracts ready to disburse</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingDisbursement.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-primary-dark dark:text-white truncate">{c.applicantName ?? c.applicantId.slice(0, 8)}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px]">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(c.principal - c.processingFee)}</span>
                          <span className="text-muted dark:text-gray-500 capitalize">{c.productType.replace('_', ' ')}</span>
                          <Badge variant="success" className="text-[9px]">Signed</Badge>
                        </div>
                      </div>
                      <Button size="sm" variant="primary" disabled={disburse.isPending} onClick={() => disburse.mutate(c.id)}>
                        <Send size={12} /> Disburse
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active contracts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Active Contracts</CardTitle>
                <Link to="/financing/contracts"><Badge variant="default" className="text-[10px] cursor-pointer">{contracts.filter((c) => c.status === 'active').length} active</Badge></Link>
              </div>
            </CardHeader>
            <CardContent>
              {contracts.filter((c) => c.status === 'active').length === 0 ? (
                <div className="text-center py-6">
                  <FileSignature size={24} className="mx-auto text-muted/40 mb-2" />
                  <p className="text-xs text-muted dark:text-gray-500">No active contracts yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {contracts.filter((c) => c.status === 'active').slice(0, 5).map((c) => {
                    const pct = c.totalRepayable > 0 ? (c.amountRepaid / c.totalRepayable) * 100 : 0
                    return (
                      <Link to={`/financing/contracts/${c.id}`} key={c.id} className="block p-2 rounded-lg hover:bg-surface dark:hover:bg-[#0c0e1a]">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-xs font-semibold text-primary-dark dark:text-white truncate">{c.applicantName ?? c.applicantId.slice(0, 8)}</p>
                          <span className="text-[11px] font-bold text-primary dark:text-blue-400">{formatCurrency(c.amountRepaid)} / {formatCurrency(c.totalRepayable)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right rail */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">My Offers</CardTitle>
                <Link to="/financing/offers"><span className="text-[11px] text-primary dark:text-blue-400 hover:underline">Manage</span></Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <ShieldCheck size={20} className="text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{activeOffers}</p>
                  <p className="text-[11px] text-muted dark:text-gray-500">Active offers / {offers.length} total</p>
                </div>
              </div>
              <div className="space-y-1.5 border-t border-border/30 dark:border-[#252a3a]/30 pt-3">
                {offers.slice(0, 4).map((o) => (
                  <div key={o.id} className="flex items-center justify-between py-1">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-primary-dark dark:text-white truncate">{o.name}</p>
                      <p className="text-[10px] text-muted dark:text-gray-500 capitalize">{o.productType.replace('_', ' ')} · {o.annualInterestRate}% APR</p>
                    </div>
                    <Badge variant={o.active ? 'success' : 'muted'} className="text-[9px]">{o.active ? 'Live' : 'Off'}</Badge>
                  </div>
                ))}
                {offers.length === 0 && (
                  <Link to="/financing/offers/new" className="block text-center py-3">
                    <Plus size={20} className="mx-auto text-muted/40 mb-1" />
                    <p className="text-xs text-primary dark:text-blue-400 font-semibold">Create your first offer</p>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Risk Snapshot</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                <RiskRow icon={<TrendingUp size={14} />} label="Active" value={portfolio?.activeContracts ?? 0} color="text-emerald-500" />
                <RiskRow icon={<AlertTriangle size={14} />} label="In arrears" value={portfolio?.inArrearsContracts ?? 0} color="text-amber-500" />
                <RiskRow icon={<AlertTriangle size={14} />} label="Defaulted" value={portfolio?.defaultedContracts ?? 0} color="text-red-500" />
                <RiskRow icon={<CheckCircle2 size={14} />} label="Settled" value={portfolio?.settledContracts ?? 0} color="text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function RiskRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={color}>{icon}</div>
        <span className="text-xs text-muted dark:text-gray-400">{label}</span>
      </div>
      <span className="text-sm font-bold text-primary-dark dark:text-white">{value}</span>
    </div>
  )
}
