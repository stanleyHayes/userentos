import { useState, useMemo, useEffect, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { useAuthStore } from '@/stores/authStore'
import { usePayments, useCreatePayment, useAgreements } from '@/hooks/useApi'
import { useCelebrationStore } from '@/stores/celebrationStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import { CreditCard, ArrowUpDown, Search, X, TrendingUp, Clock, CheckCircle } from 'lucide-react'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { DoodleStars } from '@/components/ui/Doodles'
import { EmptyState } from '@/components/ui/EmptyState'
import type { PaymentStatus, Payment } from '@/types'

const statusVariant: Record<PaymentStatus, 'warning' | 'default' | 'success' | 'danger' | 'muted'> = {
  pending: 'warning',
  processing: 'default',
  completed: 'success',
  failed: 'danger',
  refunded: 'muted',
}

const methodOptions = [
  { value: 'mtn_momo', label: 'MTN Mobile Money' },
  { value: 'telecel_cash', label: 'Telecel Cash' },
  { value: 'airteltigo_money', label: 'AirtelTigo Money' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]

type SortField = 'date' | 'amount'
type SortDir = 'asc' | 'desc'

export function PaymentsPage() {
  const user = useAuthStore((s) => s.user)
  const isTenant = user?.activeRole === 'tenant'

  // Filters — applied SERVER-side (the list endpoint is paginated)
  const [statusFilter, setStatusFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const perPage = 10

  // Debounce the reference search so each keystroke doesn't fire a query
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data, isLoading, isFetching } = usePayments({
    page,
    pageSize: perPage,
    status: statusFilter || undefined,
    method: methodFilter || undefined,
    search: debouncedSearch || undefined,
    sort: sortField,
    order: sortDir,
  })
  const payments = useMemo(() => data?.items ?? [], [data?.items])
  const [showPay, setShowPay] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [pendingInstructions, setPendingInstructions] = useState<string | null>(null)

  const toggleSort = (field: SortField) => {
    setPage(1)
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  // Summary aggregates come from the server (computed over the full filtered set)
  const summary = data?.summary
  const totalPaid = summary?.totalPaid ?? 0
  const pendingAmount = summary?.pendingAmount ?? 0
  const pendingCount = summary?.pendingCount ?? 0
  const failedCount = summary?.failedCount ?? 0
  const avgPayment = summary?.avgPayment ?? 0
  const completedCount = summary?.completedCount ?? 0
  const hasActiveFilters = statusFilter || methodFilter || searchQuery

  const totalPages = data?.totalPages ?? 1

  function clearFilters() {
    setStatusFilter('')
    setMethodFilter('')
    setSearchQuery('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative">
          <h1 className="text-2xl font-bold text-primary-dark dark:text-white">Payments</h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            {isTenant ? 'Track your rent payments' : 'Track received payments'}
          </p>
          <DoodleStars className="absolute -top-2 -right-8 text-secondary/15 dark:text-amber-400/15 w-12 h-12 pointer-events-none" />
        </div>
        {isTenant && (
          <Button data-testid="make-payment-button" onClick={() => setShowPay(true)}>
            <CreditCard size={16} />
            Make Payment
          </Button>
        )}
      </div>

      <div className="stagger-3d grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Paid', value: formatCurrency(totalPaid), icon: <CheckCircle size={18} />, color: '#059669' },
          { label: 'Pending', value: formatCurrency(pendingAmount), icon: <Clock size={18} />, color: '#d97706', sub: `${pendingCount} payment${pendingCount !== 1 ? 's' : ''}` },
          { label: 'Avg Payment', value: formatCurrency(avgPayment), icon: <TrendingUp size={18} />, color: '#2563eb' },
          { label: 'Transactions', value: String(data?.total ?? 0), icon: <CreditCard size={18} />, color: '#7c3aed', sub: failedCount > 0 ? `${failedCount} failed` : `${completedCount} completed` },
        ].map((kpi) => (
          <DashboardMetricCard key={kpi.label} label={kpi.label} value={kpi.value} sub={kpi.sub} icon={kpi.icon} accent={kpi.color} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Payment History</CardTitle>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-primary dark:text-blue-400 hover:underline flex items-center gap-1">
                <X size={12} /> Clear filters
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-4">
            <div className="w-full sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
              <TextField
                type="text"
                placeholder="Search reference..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }, inputLabel: { shrink: true } }}
                size="small"
                fullWidth
              />
            </div>
            <div className="w-full sm:w-40">
              <TextField
                select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, renderValue: (v) => (v as string) || 'All Status' } }}
                size="small"
                fullWidth
              >
                <MenuItem value="">All Status</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="processing">Processing</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
                <MenuItem value="refunded">Refunded</MenuItem>
              </TextField>
            </div>
            <div className="w-full sm:w-44">
              <TextField
                select
                value={methodFilter}
                onChange={(e) => { setMethodFilter(e.target.value); setPage(1) }}
                slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, renderValue: (v): React.ReactNode => (v as string) ? methodOptions.find(m => m.value === v)?.label ?? (v as string) : 'All Methods' } }}
                size="small"
                fullWidth
              >
                <MenuItem value="">All Methods</MenuItem>
                {methodOptions.map((m) => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </TextField>
            </div>
          </div>

          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : payments.length === 0 ? (
            hasActiveFilters ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted dark:text-gray-400">No payments match your filters.</p>
                <button onClick={clearFilters} className="text-sm text-primary dark:text-blue-400 hover:underline mt-2">Clear filters</button>
              </div>
            ) : (
              <EmptyState preset="payments" action={{ label: 'Make payment', onClick: () => setShowPay(true) }} />
            )
          ) : (
            <div className={`overflow-x-auto ${isFetching ? 'opacity-60 transition-opacity' : ''}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#252a3a]">
                    <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Reference</th>
                    <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">
                      <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-primary-dark dark:hover:text-white transition-colors">
                        Date
                        <ArrowUpDown size={12} className={sortField === 'date' ? 'text-primary dark:text-blue-400' : ''} />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Method</th>
                    <th className="text-right py-3 px-2 text-muted dark:text-gray-400 font-medium">
                      <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 ml-auto hover:text-primary-dark dark:hover:text-white transition-colors">
                        Amount
                        <ArrowUpDown size={12} className={sortField === 'amount' ? 'text-primary dark:text-blue-400' : ''} />
                      </button>
                    </th>
                    <th className="text-right py-3 px-2 text-muted dark:text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-border dark:border-[#252a3a] last:border-0 hover:bg-surface dark:hover:bg-[#0c0e1a]/50 transition-colors cursor-pointer" onClick={() => setSelectedPayment(payment)}>
                      <td className="py-3 px-2 font-mono text-xs text-primary-dark dark:text-gray-200">{payment.reference}</td>
                      <td className="py-3 px-2 text-muted dark:text-gray-400">{formatDate(payment.createdAt)}</td>
                      <td className="py-3 px-2 text-muted dark:text-gray-400 capitalize">{payment.method.replace('_', ' ')}</td>
                      <td className="py-3 px-2 text-right font-medium text-primary-dark dark:text-white">{formatCurrency(payment.amount)}</td>
                      <td className="py-3 px-2 text-right">
                        <Badge variant={statusVariant[payment.status]} data-testid="payment-status">{payment.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border dark:border-[#252a3a]">
                  <p className="text-xs text-muted dark:text-gray-400">
                    Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, data?.total ?? 0)} of {data?.total ?? 0}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | string)[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
                        acc.push(p)
                        return acc
                      }, [])
                      .map((p, i) =>
                        typeof p === 'string' ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted">...</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                              page === p
                                ? 'bg-primary dark:bg-blue-500 text-white'
                                : 'text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#0c0e1a]'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <Modal open onClose={() => setSelectedPayment(null)} title="Payment Details">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted dark:text-gray-400">Reference</span>
                <p className="font-mono font-medium text-primary-dark dark:text-white mt-0.5">{selectedPayment.reference}</p>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Status</span>
                <div className="mt-0.5"><Badge variant={statusVariant[selectedPayment.status]}>{selectedPayment.status}</Badge></div>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Amount</span>
                <p className="font-bold text-primary dark:text-blue-400 mt-0.5">{formatCurrency(selectedPayment.amount)}</p>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Method</span>
                <p className="font-medium text-primary-dark dark:text-white mt-0.5 capitalize">{selectedPayment.method.replace('_', ' ')}</p>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Date</span>
                <p className="font-medium text-primary-dark dark:text-white mt-0.5">{formatDate(selectedPayment.paidAt ?? selectedPayment.createdAt)}</p>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Agreement</span>
                <p className="font-mono text-xs text-primary-dark dark:text-white mt-0.5">{selectedPayment.agreementId?.slice(0, 12)}...</p>
              </div>
            </div>
            {selectedPayment.receiptUrl && (
              <a href={selectedPayment.receiptUrl} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="outline" className="w-full">View Receipt</Button>
              </a>
            )}
          </div>
        </Modal>
      )}

      <MakePaymentModal
        open={showPay}
        onClose={() => setShowPay(false)}
        onInstructions={(text) => setPendingInstructions(text)}
      />

      {pendingInstructions && (
        <Modal open onClose={() => setPendingInstructions(null)} title="Complete your payment">
          <div className="space-y-4">
            <p className="text-sm text-primary-dark dark:text-gray-100 whitespace-pre-wrap">
              {pendingInstructions}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setPendingInstructions(null)}>Got it</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MakePaymentModal({
  open,
  onClose,
  onInstructions,
}: {
  open: boolean
  onClose: () => void
  onInstructions: (text: string) => void
}) {
  const createPayment = useCreatePayment()
  const celebrate = useCelebrationStore((s) => s.celebrate)
  const user = useAuthStore((s) => s.user)
  const { data: agreementData } = useAgreements()
  const agreements = (agreementData?.items ?? []).filter((a) => a.status === 'active')
  const defaultAgreementId = agreements[0]?.id ?? ''
  const [form, setForm] = useState({ agreementId: defaultAgreementId, amount: '', method: 'mtn_momo', phone: user?.phone ?? '' })

  // Default to the first active agreement once it becomes available.
  if (form.agreementId === '' && defaultAgreementId !== '') {
    setForm((prev) => ({ ...prev, agreementId: defaultAgreementId }))
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const result = await createPayment.mutateAsync({
        agreementId: form.agreementId,
        amount: Number(form.amount),
        method: form.method,
        phone: form.phone.trim() || undefined,
      })
      celebrate('payment', 'Payment initiated!')
      onClose()
      setForm({ agreementId: defaultAgreementId, amount: '', method: 'mtn_momo', phone: user?.phone ?? '' })
      if (result?.instructions) {
        onInstructions(result.instructions)
      }
    } catch {
      // handled by mutation
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Make Rent Payment">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
        {agreements.length > 0 ? (
          <Select
            id="agreementId"
            label="Agreement"
            value={form.agreementId}
            onChange={(e) => update('agreementId', e.target.value)}
            options={[
              { value: '', label: 'Select agreement...' },
              ...agreements.map((a) => ({
                value: a.id,
                label: `${a.id.slice(0, 8)}... - ${formatCurrency(a.rentAmount)}/mo`,
              })),
            ]}
            required
          />
        ) : (
          <Input
            id="agreementId"
            label="Agreement ID"
            value={form.agreementId}
            onChange={(e) => update('agreementId', e.target.value)}
            required
            placeholder="UUID of active agreement"
          />
        )}

        <TextField
          id="amount"
          label="Amount (GHS)"
          type="number"
          value={form.amount}
          onChange={(e) => update('amount', e.target.value)}
          required
          fullWidth
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: 1, 'data-testid': 'payment-amount-input' },
          }}
        />

        <TextField
          id="method"
          select
          label="Payment Method"
          value={form.method}
          onChange={(e) => update('method', e.target.value)}
          fullWidth
          data-testid="payment-method-select"
          slotProps={{
            inputLabel: { shrink: true },
          }}
        >
          {methodOptions.map((m) => (
            <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
          ))}
        </TextField>

        {form.method !== 'bank_transfer' && (
          <TextField
            id="phone"
            label="Mobile Money Number"
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            required
            fullWidth
            placeholder="0241234567"
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { 'data-testid': 'payment-phone-input' },
            }}
          />
        )}

        {createPayment.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(createPayment.error as Error).message}</div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" data-testid="payment-submit" disabled={createPayment.isPending}>
            {createPayment.isPending ? 'Processing...' : 'Pay Now'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
