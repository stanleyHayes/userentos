import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { useAuthStore } from '@/stores/authStore'
import { useAgreements, useCreateAgreement } from '@/hooks/useApi'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, Plus, CheckCircle, AlertTriangle, ArrowUpRight, PenTool, Shield, Calendar, Building2, CreditCard, ChevronRight, Search, ChevronLeft } from 'lucide-react'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { DoodleUnderline } from '@/components/ui/Doodles'
import { EmptyState } from '@/components/ui/EmptyState'
import { DatePicker } from '@/components/ui/DatePicker'
import type { AgreementStatus } from '@/types'

const statusVariant: Record<AgreementStatus, 'muted' | 'warning' | 'success' | 'danger'> = {
  draft: 'muted',
  pending_signatures: 'warning',
  active: 'success',
  expired: 'danger',
  terminated: 'danger',
  disputed: 'danger',
}

const PAGE_SIZE = 8

const statusFilters: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending_signatures', label: 'Pending' },
  { value: 'draft', label: 'Draft' },
  { value: 'expired', label: 'Expired' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'disputed', label: 'Disputed' },
]

export function AgreementsPage() {
  const user = useAuthStore((s) => s.user)
  const isLandlord = user?.activeRole === 'landlord' || user?.activeRole === 'property_manager'
  const { data, isLoading } = useAgreements()
  const agreements = data?.items ?? []
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  // Filter
  const filtered = agreements.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return a.id.toLowerCase().includes(q) || a.propertyId.toLowerCase().includes(q)
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark dark:text-white">Rental Agreements</h1>
          <DoodleUnderline className="text-primary/10 dark:text-blue-400/10 w-32 pointer-events-none" />
          <p className="text-sm text-muted mt-1">Manage your digital rental contracts</p>
        </div>
        {isLandlord && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            New Agreement
          </Button>
        )}
      </div>

      {!isLoading && agreements.length > 0 && (() => {
        const active = agreements.filter((a) => a.status === 'active')
        const pending = agreements.filter((a) => a.status === 'pending_signatures')
        const totalRent = active.reduce((sum, a) => sum + a.rentAmount, 0)
        const flagged = agreements.filter((a) => a.complianceFlags.length > 0)
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Active', value: String(active.length), icon: <CheckCircle size={18} />, color: '#10b981', gradient: 'from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20', sub: `of ${agreements.length} total` },
              { label: 'Pending Signatures', value: String(pending.length), icon: <PenTool size={18} />, color: '#f59e0b', gradient: 'from-amber-500/10 to-yellow-500/10 dark:from-amber-500/20 dark:to-yellow-500/20', sub: pending.length > 0 ? 'Needs attention' : 'All signed' },
              { label: 'Monthly Rent', value: formatCurrency(totalRent), icon: <FileText size={18} />, color: '#3b82f6', gradient: 'from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20', sub: `${active.length} active contract${active.length !== 1 ? 's' : ''}` },
              { label: 'Compliance', value: flagged.length > 0 ? `${flagged.length} flagged` : 'All clear', icon: <Shield size={18} />, color: flagged.length > 0 ? '#ef4444' : '#8b5cf6', gradient: flagged.length > 0 ? 'from-red-500/10 to-rose-500/10 dark:from-red-500/20 dark:to-rose-500/20' : 'from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className={`rounded-2xl bg-gradient-to-br ${kpi.gradient} border border-border/30 dark:border-[#252a3a]/30 p-4 overflow-hidden relative group`}
                style={{ borderLeftWidth: 3, borderLeftColor: kpi.color }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: kpi.color + '18' }}
                  >
                    <div style={{ color: kpi.color }}>{kpi.icon}</div>
                  </div>
                  <ArrowUpRight size={12} className="text-muted/30 dark:text-gray-600" />
                </div>
                <p className="text-lg font-extrabold font-display text-primary-dark dark:text-[#f1f5f9] tracking-tight truncate">{kpi.value}</p>
                <p className="text-[11px] text-gray-600 dark:text-[#94a3b8] mt-0.5">{kpi.label}</p>
                {kpi.sub && <p className="text-[10px] text-gray-500 dark:text-[#64748b] mt-0.5">{kpi.sub}</p>}
              </div>
            ))}
          </div>
        )
      })()}

      {/* Search + Filter bar */}
      {!isLoading && agreements.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search by ID or property..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-white dark:bg-[#161927] border border-border/60 dark:border-[#252a3a]/60 text-primary-dark dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {statusFilters.map((sf) => (
              <button
                key={sf.value}
                onClick={() => { setStatusFilter(sf.value); setPage(1) }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === sf.value
                    ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400'
                    : 'text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a]'
                }`}
              >
                {sf.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <ListSkeleton />
      ) : agreements.length === 0 ? (
        <EmptyState
          preset="agreements"
          {...(isLandlord ? { action: { label: 'Create agreement', onClick: () => setShowCreate(true) } } : {})}
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted dark:text-gray-500 text-center py-10">No agreements matching your filters</p>
      ) : (
        <div className="space-y-3">
          {paginated.map((agreement) => {
            const isActive = agreement.status === 'active'
            const isPending = agreement.status === 'pending_signatures'
            const needsSign = (agreement.status === 'draft' || isPending) && (
              (user?.id === agreement.landlordId && !agreement.landlordSignature) ||
              (user?.id === agreement.tenantId && !agreement.tenantSignature)
            )
            const months = agreement.startDate && agreement.endDate
              ? Math.max(1, Math.round((new Date(agreement.endDate).getTime() - new Date(agreement.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)))
              : null

            return (
              <Card
                key={agreement.id}
                data-testid="agreement-row"
                className="cursor-pointer hover:border-primary/30 dark:hover:border-blue-500/30 transition-all hover:-translate-y-0.5 overflow-hidden"
                onClick={() => navigate(`/agreements/${agreement.id}`)}
              >
                {/* Status accent bar */}
                <div className={`h-1 ${isActive ? 'bg-success' : isPending ? 'bg-warning' : agreement.status === 'draft' ? 'bg-gray-300 dark:bg-gray-600' : 'bg-danger'}`} />

                <CardContent className="pt-3">
                  {/* Top row: ID + status */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isActive ? 'bg-success/10' : isPending ? 'bg-warning/10' : 'bg-primary/8 dark:bg-blue-500/12'}`}>
                        <FileText size={15} className={isActive ? 'text-success' : isPending ? 'text-warning' : 'text-primary dark:text-blue-400'} />
                      </div>
                      <div>
                        <span className="text-[13px] font-bold text-primary-dark dark:text-[#e2e8f0]">Agreement #{agreement.id.slice(0, 8)}</span>
                        {agreement.version > 1 && (
                          <span className="text-[10px] text-muted dark:text-[#64748b] ml-1.5">v{agreement.version}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {needsSign && (
                        <div data-testid="agreement-needs-sign" className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning">
                          <PenTool size={11} />
                          <span className="text-[10px] font-semibold">Sign</span>
                        </div>
                      )}
                      <Badge variant={statusVariant[agreement.status]}>
                        {agreement.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <CreditCard size={13} className="text-muted dark:text-[#64748b] flex-shrink-0" />
                      <div>
                        <p className="text-sm font-extrabold text-primary dark:text-blue-400 leading-tight">{formatCurrency(agreement.rentAmount)}</p>
                        <p className="text-[10px] text-muted dark:text-[#64748b]">per month</p>
                      </div>
                    </div>
                    {agreement.startDate && (
                      <div className="flex items-center gap-2">
                        <Calendar size={13} className="text-muted dark:text-[#64748b] flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-primary-dark dark:text-[#cbd5e1] leading-tight">{formatDate(agreement.startDate)}</p>
                          <p className="text-[10px] text-muted dark:text-[#64748b]">{months ? `${months} month${months !== 1 ? 's' : ''}` : 'start'}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Building2 size={13} className="text-muted dark:text-[#64748b] flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-primary-dark dark:text-[#cbd5e1] leading-tight font-mono">{agreement.propertyId.slice(0, 8)}</p>
                        <p className="text-[10px] text-muted dark:text-[#64748b]">property</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield size={13} className={agreement.securityDeposit > 0 ? 'text-muted dark:text-[#64748b]' : 'text-muted/40 dark:text-[#475569]'} />
                      <div>
                        <p className="text-xs font-medium text-primary-dark dark:text-[#cbd5e1] leading-tight">{formatCurrency(agreement.securityDeposit)}</p>
                        <p className="text-[10px] text-muted dark:text-[#64748b]">deposit</p>
                      </div>
                    </div>
                  </div>

                  {/* Bottom row: signatures + compliance */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-border/30 dark:border-[#252a3a]/30">
                    <div className="flex items-center gap-4">
                      {/* Signatures */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle size={13} className={agreement.landlordSignature ? 'text-success' : 'text-gray-300 dark:text-[#475569]'} />
                          <span className="text-[11px] text-muted dark:text-[#94a3b8]">Landlord</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle size={13} className={agreement.tenantSignature ? 'text-success' : 'text-gray-300 dark:text-[#475569]'} />
                          <span className="text-[11px] text-muted dark:text-[#94a3b8]">Tenant</span>
                        </div>
                      </div>

                      {/* Compliance flags */}
                      {agreement.complianceFlags.length > 0 && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10">
                          <AlertTriangle size={11} className="text-warning" />
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">{agreement.complianceFlags.length} flag{agreement.complianceFlags.length !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>

                    <ChevronRight size={16} className="text-muted/30 dark:text-[#475569]" />
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted dark:text-[#64748b]">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-full text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[32px] h-8 rounded-full text-xs font-medium transition-colors ${
                      p === page
                        ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400'
                        : 'text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-full text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <CreateAgreementModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}

function CreateAgreementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createAgreement = useCreateAgreement()
  const [form, setForm] = useState({
    propertyId: '', tenantId: '', startDate: '', endDate: '',
    rentAmount: '', securityDeposit: '0', advanceMonths: '3', terms: '',
  })

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await createAgreement.mutateAsync({
        propertyId: form.propertyId,
        tenantId: form.tenantId,
        startDate: form.startDate,
        endDate: form.endDate,
        rentAmount: Number(form.rentAmount),
        securityDeposit: Number(form.securityDeposit),
        advanceMonths: Number(form.advanceMonths),
        terms: form.terms ? form.terms.split('\n').filter(Boolean) : [],
      })
      onClose()
    } catch {
      // handled by mutation
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Agreement">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input id="propertyId" label="Property ID" value={form.propertyId} onChange={(e) => update('propertyId', e.target.value)} required placeholder="UUID of the property" />
        <Input id="tenantId" label="Tenant ID" value={form.tenantId} onChange={(e) => update('tenantId', e.target.value)} required placeholder="UUID of the tenant" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DatePicker label="Start Date" value={form.startDate} onChange={(v) => update('startDate', v)} required />
          <DatePicker label="End Date" value={form.endDate} onChange={(v) => update('endDate', v)} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input id="rentAmount" label="Rent (GHS/mo)" type="number" value={form.rentAmount} onChange={(e) => update('rentAmount', e.target.value)} required />
          <Input id="securityDeposit" label="Deposit (GHS)" type="number" value={form.securityDeposit} onChange={(e) => update('securityDeposit', e.target.value)} />
          <Input id="advanceMonths" label="Advance (months)" type="number" value={form.advanceMonths} onChange={(e) => update('advanceMonths', e.target.value)} min="0" max="6" />
        </div>
        <Textarea id="terms" label="Terms (one per line)" value={form.terms} onChange={(e) => update('terms', e.target.value)} placeholder="Tenant responsible for utility bills&#10;No subletting allowed" aiContext="rental agreement terms" />

        {createAgreement.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(createAgreement.error as Error).message}</div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createAgreement.isPending}>
            {createAgreement.isPending ? 'Creating...' : 'Create Agreement'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
