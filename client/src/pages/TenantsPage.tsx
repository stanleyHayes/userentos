import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  Users, User, Mail, Phone, Building2, Calendar, CreditCard,
  ChevronRight, ChevronLeft, CheckCircle,
  Search, AlertTriangle,
} from 'lucide-react'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { DoodleUnderline } from '@/components/ui/Doodles'

interface TenantAgreement {
  id: string
  status: string
  rentAmount: number
  startDate: string
  endDate: string
  propertyId: string
  propertyTitle: string
  propertyAddress?: { street: string; city: string; region: string }
  propertyType?: string
  totalPaid: number
  paymentCount: number
  lastPaymentDate: string | null
}

interface Tenant {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  profileImage?: string
  isVerified: boolean
  agreements: TenantAgreement[]
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  active: 'success', pending_signatures: 'warning', draft: 'muted', expired: 'danger', terminated: 'danger', disputed: 'danger',
}

export function TenantsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-tenants'],
    queryFn: () => api.get<{ items: Tenant[] }>('/agreements/tenants'),
  })
  const [search, setSearch] = useState('')
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 8

  const tenants = data?.items ?? []
  const filtered = tenants.filter((t) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return `${t.firstName} ${t.lastName}`.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)
  })

  const activeTenants = tenants.filter((t) => t.agreements.some((a) => a.status === 'active'))
  const totalRent = activeTenants.reduce((sum, t) => sum + t.agreements.filter((a) => a.status === 'active').reduce((s, a) => s + a.rentAmount, 0), 0)
  const totalCollected = tenants.reduce((sum, t) => sum + t.agreements.reduce((s, a) => s + a.totalPaid, 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative">
          <DoodleUnderline className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">My Tenants</h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">Manage your current and past tenants</p>
        </div>
        <div className="flex items-center gap-2">
          <Users size={18} className="text-primary dark:text-blue-400" />
          <span className="text-sm font-bold text-primary-dark dark:text-white">{tenants.length}</span>
        </div>
      </div>

      {/* KPI Stats */}
      {!isLoading && tenants.length > 0 && (
        <div className="stagger-3d grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active Tenants', value: String(activeTenants.length), icon: <Users size={18} />, color: '#059669', sub: `of ${tenants.length} total` },
            { label: 'Monthly Rent', value: formatCurrency(totalRent), icon: <CreditCard size={18} />, color: '#2563eb', sub: 'from active leases' },
            { label: 'Total Collected', value: formatCurrency(totalCollected), icon: <CheckCircle size={18} />, color: '#d97706' },
            { label: 'Properties Rented', value: String(new Set(tenants.flatMap((t) => t.agreements.filter((a) => a.status === 'active').map((a) => a.propertyId))).size), icon: <Building2 size={18} />, color: '#7c3aed' },
          ].map((kpi) => (
            <DashboardMetricCard key={kpi.label} label={kpi.label} value={kpi.value} sub={kpi.sub} icon={kpi.icon} accent={kpi.color} />
          ))}
        </div>
      )}

      {/* Search */}
      {tenants.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-white dark:bg-[#161927] border border-border/60 dark:border-[#252a3a]/60 text-primary-dark dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}

      {isLoading ? (
        <ListSkeleton />
      ) : filtered.length === 0 && !search ? (
        <EmptyState preset="properties" title="No tenants yet" description="Once tenants sign rental agreements for your properties, they will appear here." />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted text-center py-10">No tenants matching "{search}"</p>
      ) : (
        <div className="space-y-3">
          {(() => {
            const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
            const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
            return <>
          {paginated.map((tenant) => {
            const activeAgreement = tenant.agreements.find((a) => a.status === 'active')
            const totalPaid = tenant.agreements.reduce((sum, a) => sum + a.totalPaid, 0)
            return (
              <Card key={tenant.id} className="cursor-pointer hover:border-primary/30 dark:hover:border-blue-500/30 transition-all hover:-translate-y-0.5" onClick={() => setSelectedTenant(tenant)}>
                <CardContent>
                  <div className="flex items-start gap-3 sm:gap-4">
                    {/* Avatar */}
                    <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light dark:from-blue-600 dark:to-blue-400 text-white text-sm font-bold flex-shrink-0 mt-0.5">
                      {tenant.firstName[0]}{tenant.lastName[0]}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h3 className="text-sm font-bold text-primary-dark dark:text-white truncate">{tenant.firstName} {tenant.lastName}</h3>
                          {tenant.isVerified && <CheckCircle size={14} className="text-accent flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={activeAgreement ? 'success' : 'muted'}>
                            {activeAgreement ? 'Active' : 'Past'}
                          </Badge>
                          <ChevronRight size={16} className="text-muted/40 hidden sm:block" />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted dark:text-gray-500">
                        <span className="flex items-center gap-1 truncate"><Mail size={10} /> {tenant.email}</span>
                        {tenant.phone && <span className="flex items-center gap-1"><Phone size={10} /> {tenant.phone}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        {activeAgreement && (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Building2 size={11} className="text-primary dark:text-blue-400 flex-shrink-0" />
                            <span className="text-xs text-primary-dark dark:text-gray-300 truncate">{activeAgreement.propertyTitle}</span>
                            <span className="text-xs font-bold text-primary dark:text-blue-400 flex-shrink-0">{formatCurrency(activeAgreement.rentAmount)}/mo</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="text-muted dark:text-gray-500">{tenant.agreements.length} agreement{tenant.agreements.length !== 1 ? 's' : ''}</span>
                          <span className="font-bold text-accent">{formatCurrency(totalPaid)} paid</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted dark:text-[#64748b]">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-full text-muted hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-full text-xs font-medium transition-colors ${p === page ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400' : 'text-muted hover:bg-surface dark:hover:bg-[#0c0e1a]'}`}>{p}</button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-full text-muted hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
          </>
          })()}
        </div>
      )}

      {/* Tenant Detail Modal */}
      {selectedTenant && (
        <Modal open onClose={() => setSelectedTenant(null)} title="Tenant Details" className="max-w-2xl">
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light dark:from-blue-600 dark:to-blue-400 text-white text-lg font-bold">
                {selectedTenant.firstName[0]}{selectedTenant.lastName[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-primary-dark dark:text-white">{selectedTenant.firstName} {selectedTenant.lastName}</h2>
                  {selectedTenant.isVerified && <Badge variant="success">Verified</Badge>}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted dark:text-gray-400">
                  <span className="flex items-center gap-1"><Mail size={12} /> {selectedTenant.email}</span>
                  {selectedTenant.phone && <span className="flex items-center gap-1"><Phone size={12} /> {selectedTenant.phone}</span>}
                </div>
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-lg font-extrabold text-primary dark:text-blue-400">{selectedTenant.agreements.length}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">Agreements</p>
              </div>
              <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-lg font-extrabold text-accent">{formatCurrency(selectedTenant.agreements.reduce((s, a) => s + a.totalPaid, 0))}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">Total Paid</p>
              </div>
              <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-lg font-extrabold text-secondary">{selectedTenant.agreements.reduce((s, a) => s + a.paymentCount, 0)}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">Payments</p>
              </div>
            </div>

            {/* Agreements list */}
            <div>
              <p className="text-xs font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-3">Rental Agreements</p>
              <div className="space-y-3">
                {selectedTenant.agreements.map((a) => {
                  const isActive = a.status === 'active'
                  const months = a.startDate && a.endDate
                    ? Math.max(1, Math.round((new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)))
                    : null
                  const expectedTotal = months ? a.rentAmount * months : null
                  const paidPercent = expectedTotal ? Math.min(100, Math.round((a.totalPaid / expectedTotal) * 100)) : null
                  return (
                    <div key={a.id} className={`rounded-2xl overflow-hidden border ${isActive ? 'border-accent/30 dark:border-emerald-500/20' : 'border-border/40 dark:border-[#252a3a]/40'}`}>
                      {/* Header strip */}
                      <div className={`flex items-center justify-between px-4 py-2.5 ${isActive ? 'bg-accent/5 dark:bg-emerald-500/5' : 'bg-surface dark:bg-[#0c0e1a]'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-accent/10' : 'bg-primary/10 dark:bg-blue-500/10'}`}>
                            <Building2 size={13} className={isActive ? 'text-accent' : 'text-primary dark:text-blue-400'} />
                          </div>
                          <span className="text-sm font-bold text-primary-dark dark:text-white truncate">{a.propertyTitle}</span>
                        </div>
                        <Badge variant={statusVariant[a.status] ?? 'default'}>{a.status.replace('_', ' ')}</Badge>
                      </div>

                      <div className="p-4 space-y-3">
                        {a.propertyAddress && (
                          <p className="text-[10px] text-muted dark:text-gray-500 flex items-center gap-1">
                            <span className="capitalize">{a.propertyType}</span> · {a.propertyAddress.street}, {a.propertyAddress.city}
                          </p>
                        )}

                        {/* Rent + dates row */}
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <p className="text-xl font-extrabold font-display text-primary dark:text-blue-400">{formatCurrency(a.rentAmount)}<span className="text-xs font-normal text-muted dark:text-gray-500">/mo</span></p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted dark:text-gray-500 bg-surface dark:bg-[#0c0e1a] px-2.5 py-1 rounded-lg">
                            <Calendar size={11} />
                            {formatDate(a.startDate)} — {formatDate(a.endDate)}
                          </div>
                        </div>

                        {/* Payment progress */}
                        {paidPercent !== null && (
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] text-muted dark:text-gray-500">Payment Progress</span>
                              <span className="text-[10px] font-bold text-primary-dark dark:text-white">{paidPercent}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#252a3a]/50 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${paidPercent}%`, backgroundColor: paidPercent >= 75 ? '#10b981' : paidPercent >= 40 ? '#3b82f6' : '#f59e0b' }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Bottom row */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/20 dark:border-[#252a3a]/20">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle size={12} className="text-accent" />
                              <span className="text-xs font-bold text-accent">{formatCurrency(a.totalPaid)}</span>
                              <span className="text-[10px] text-muted dark:text-gray-500">paid</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <CreditCard size={12} className="text-muted dark:text-gray-500" />
                              <span className="text-xs text-muted dark:text-gray-500">{a.paymentCount} payment{a.paymentCount !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          {a.lastPaymentDate && (
                            <span className="text-[10px] text-muted dark:text-gray-500">
                              Last: {formatDate(a.lastPaymentDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-border/30 dark:border-[#252a3a]/30">
              <Link to={`/tenant-profile/${selectedTenant.id}`} className="flex-1">
                <Button className="w-full">
                  <User size={14} /> View Profile
                </Button>
              </Link>
              <Link to={`/messages`} className="flex-1">
                <Button variant="outline" className="w-full">
                  <Mail size={14} /> Message
                </Button>
              </Link>
              <Link to={`/disputes`}>
                <Button variant="outline" className="text-danger border-danger/30 hover:bg-danger/5">
                  <AlertTriangle size={14} />
                </Button>
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
