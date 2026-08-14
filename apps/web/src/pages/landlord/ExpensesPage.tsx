import { useMemo, useState, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import {
  Receipt, Plus, Trash2, Clock, CheckCircle2, PieChart, Calendar, DollarSign,
} from 'lucide-react'
import { useProperties } from '@/hooks/useApi'
import {
  useLandlordExpenses,
  useCreateExpense,
  useDeleteExpense,
  type LandlordExpense,
  type ExpenseType,
} from '@/hooks/useLandlordOps'
import { useToastStore } from '@/stores/toastStore'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

const EXPENSE_TYPE_OPTIONS: { value: ExpenseType; label: string }[] = [
  { value: 'repair', label: 'Repair' },
  { value: 'levy', label: 'Levy' },
  { value: 'utility', label: 'Utility' },
  { value: 'tax', label: 'Tax' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
]

const TYPE_VARIANT: Record<ExpenseType, 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  repair: 'warning',
  levy: 'muted',
  utility: 'default',
  tax: 'danger',
  insurance: 'success',
  other: 'muted',
}

const TYPE_COLORS: Record<ExpenseType, string> = {
  repair: '#f59e0b',
  levy: '#94a3b8',
  utility: '#3b82f6',
  tax: '#ef4444',
  insurance: '#10b981',
  other: '#8b5cf6',
}

const MONTH_OPTIONS = [3, 6, 12]

export function ExpensesPage() {
  const [months, setMonths] = useState(6)
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<LandlordExpense | null>(null)

  const { data, isLoading } = useLandlordExpenses({ months })
  const { data: propertiesData } = useProperties({ mine: true })
  const del = useDeleteExpense()
  const addToast = useToastStore((s) => s.addToast)

  const items = useMemo(() => data?.items ?? [], [data])
  const summary = data?.summary
  const properties = useMemo(
    () => (propertiesData?.items ?? []).map((p) => ({ id: p.id, title: p.title })),
    [propertiesData],
  )

  const topCategory = useMemo(() => {
    const byType = summary?.byType ?? []
    if (byType.length === 0) return null
    return [...byType].sort((a, b) => b.total - a.total)[0]
  }, [summary])

  const monthlyAvg = summary && summary.months > 0 ? summary.total / summary.months : 0
  const maxMonthTotal = Math.max(...(summary?.byMonth ?? []).map((m) => m.total), 1)
  const maxTypeTotal = Math.max(...(summary?.byType ?? []).map((t) => t.total), 1)

  async function handleDelete() {
    if (!confirmDelete) return
    try {
      await del.mutateAsync(confirmDelete.id)
      addToast('Expense deleted', 'success')
      setConfirmDelete(null)
    } catch (err) {
      addToast((err as Error).message ?? 'Failed to delete', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight flex items-center gap-2">
            <Receipt size={22} className="text-primary dark:text-blue-400" /> Expenses
          </h1>
          <p className="text-sm text-muted dark:text-gray-500 mt-1">
            Track repairs, levies and other costs across your properties.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus size={14} /> Record Expense
        </Button>
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted dark:text-gray-500">Period:</span>
        <div className="flex gap-1 rounded-lg bg-surface dark:bg-[#0c0e1a] p-1">
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                months === m
                  ? 'bg-white dark:bg-[#161927] text-primary-dark dark:text-white shadow-sm'
                  : 'text-muted dark:text-gray-500 hover:text-primary-dark dark:hover:text-gray-300',
              )}
            >
              {m} mo
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : (
        <>
          {/* Stat cards */}
          <div className="stagger-3d grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            <DashboardMetricCard
              label={`Total spent · last ${summary?.months ?? months} months`}
              value={formatCurrency(summary?.total ?? 0)}
              sub={`${items.length} expense${items.length === 1 ? '' : 's'}`}
              icon={<DollarSign size={18} />}
              accent="#f59e0b"
            />
            <DashboardMetricCard
              label="Top category"
              value={topCategory ? topCategory.type.replace('_', ' ') : '—'}
              sub={topCategory ? formatCurrency(topCategory.total) : 'No expenses yet'}
              icon={<PieChart size={18} />}
              accent={topCategory ? TYPE_COLORS[topCategory.type] : '#94a3b8'}
            />
            <DashboardMetricCard
              label="Monthly average"
              value={formatCurrency(monthlyAvg)}
              sub={`Across ${summary?.months ?? months} months`}
              icon={<Calendar size={18} />}
              accent="#3b82f6"
            />
          </div>

          {/* Breakdown */}
          {items.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By type */}
              <Card>
                <CardHeader><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    {(summary?.byType ?? [])
                      .slice()
                      .sort((a, b) => b.total - a.total)
                      .map((t) => (
                        <div key={t.type}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-primary-dark dark:text-gray-300 capitalize">{t.type.replace('_', ' ')}</span>
                            <span className="font-bold text-primary-dark dark:text-white">{formatCurrency(t.total)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${(t.total / maxTypeTotal) * 100}%`, backgroundColor: TYPE_COLORS[t.type] }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              {/* By month */}
              <Card>
                <CardHeader><CardTitle className="text-sm">By Month</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 h-36">
                    {(summary?.byMonth ?? []).map((m) => (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        <span className="text-[9px] font-semibold text-muted dark:text-gray-500 truncate w-full text-center">
                          {formatCurrency(m.total)}
                        </span>
                        <div
                          className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-primary to-blue-400 transition-all"
                          style={{ height: `${Math.max(4, (m.total / maxMonthTotal) * 100)}%` }}
                          title={`${m.month}: ${formatCurrency(m.total)}`}
                        />
                        <span className="text-[10px] text-muted dark:text-gray-500">
                          {new Date(`${m.month}-01`).toLocaleString('en', { month: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Expense list */}
          {items.length === 0 ? (
            <EmptyState
              preset="payments"
              icon={<Receipt size={40} />}
              title="No expenses recorded"
              description="Record repairs, levies and other property costs to see your spending breakdown."
              action={{ label: 'Record Expense', onClick: () => setShowCreate(true) }}
            />
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-sm">Expenses</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {items.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 py-2.5 border-b border-border/20 dark:border-[#252a3a]/20 last:border-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="neumorphic-icon w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${TYPE_COLORS[e.type]}18`, color: TYPE_COLORS[e.type] }}
                        >
                          <Receipt size={13} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-primary-dark dark:text-white truncate">
                              {e.propertyTitle ?? 'Property'}
                            </p>
                            <Badge variant={TYPE_VARIANT[e.type]} className="text-[9px] capitalize flex-shrink-0">
                              {e.type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted dark:text-gray-500 truncate">
                            {formatDate(e.date)}{e.note ? ` · ${e.note}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-bold text-primary-dark dark:text-white">
                          {formatCurrency(e.amount)}
                        </span>
                        <button
                          onClick={() => setConfirmDelete(e)}
                          className="rounded-lg p-1.5 text-muted/60 hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Delete expense"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <CreateExpenseModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        properties={properties}
      />

      {/* Delete confirmation */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Expense">
        <p className="text-sm text-muted dark:text-gray-400">
          Delete this {confirmDelete ? formatCurrency(confirmDelete.amount) : ''} expense
          {confirmDelete?.propertyTitle ? ` for ${confirmDelete.propertyTitle}` : ''}? This cannot be undone.
        </p>
        <div className="flex items-center gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => void handleDelete()}
            disabled={del.isPending}
            className="gap-1.5"
          >
            {del.isPending ? <Clock size={14} /> : <Trash2 size={14} />} Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Create modal ───
function CreateExpenseModal({
  open,
  onClose,
  properties,
}: {
  open: boolean
  onClose: () => void
  properties: { id: string; title: string }[]
}) {
  const create = useCreateExpense()
  const addToast = useToastStore((s) => s.addToast)

  const [propertyId, setPropertyId] = useState('')
  const [type, setType] = useState<ExpenseType>('repair')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')

  function reset() {
    setPropertyId('')
    setType('repair')
    setAmount('')
    setDate(new Date().toISOString().slice(0, 10))
    setNote('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsedAmount = Number(amount)
    if (!propertyId || !date || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      addToast('Please complete all required fields', 'error')
      return
    }
    try {
      await create.mutateAsync({
        propertyId,
        type,
        amount: parsedAmount,
        date,
        note: note.trim() || undefined,
      })
      addToast('Expense recorded', 'success')
      reset()
      onClose()
    } catch (err) {
      addToast((err as Error).message ?? 'Failed to record expense', 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Expense">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          id="exp-property"
          label="Property"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          options={[
            { value: '', label: 'Select property…' },
            ...properties.map((p) => ({ value: p.id, label: p.title })),
          ]}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="exp-type"
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as ExpenseType)}
            options={EXPENSE_TYPE_OPTIONS}
          />
          <Input
            id="exp-amount"
            label="Amount (GHS)"
            type="number"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            required
          />
        </div>
        <Input
          id="exp-date"
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <Input
          id="exp-note"
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Replaced kitchen tap"
        />

        <div className="flex items-center gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending} className="gap-1.5">
            {create.isPending ? (
              <>
                <Clock size={14} /> Saving…
              </>
            ) : (
              <>
                <CheckCircle2 size={14} /> Save
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
