import { useState, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { useWallet, useDeposit, useWithdraw, useSavingsPlans, useCreateSavingsPlan, useContributeToSavings } from '@/hooks/useApi'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PiggyBank, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Switch } from '@/components/ui/Switch'
import { DatePicker } from '@/components/ui/DatePicker'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { DoodleSpiral } from '@/components/ui/Doodles'
import { InvestmentsTab } from './InvestmentsTab'
import { LoansTab } from './LoansTab'

const methodOptions = [
  { value: 'mtn_momo', label: 'MTN Mobile Money' },
  { value: 'telecel_cash', label: 'Telecel Cash' },
  { value: 'airteltigo_money', label: 'AirtelTigo Money' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]

const frequencyOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

export function SavingsPage() {
  const [tab, setTab] = useState<'savings' | 'investments' | 'loans'>('savings')
  const { data: wallet, isLoading: walletLoading } = useWallet()
  const { data: plansData, isLoading: plansLoading } = useSavingsPlans()
  const plans = plansData?.items ?? []
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [showContribute, setShowContribute] = useState<string | null>(null)

  const isLoading = walletLoading || plansLoading
  const activePlans = plans.filter((p) => p.status === 'active')
  const recentTxs = (wallet?.transactions ?? []).slice(-10).reverse()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative">
          <DoodleSpiral className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
          <h1 className="text-2xl font-bold text-primary-dark dark:text-white">RentGuard</h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">Save, invest, and protect your rent</p>
        </div>
        <Button onClick={() => setShowNewPlan(true)} className="w-full sm:w-auto">
          <Plus size={16} />
          New Savings Plan
        </Button>
      </div>

      <div className="flex gap-1 bg-white dark:bg-[#0c0e1a] rounded-full border border-border dark:border-[#252a3a] p-1">
        {([['savings', 'Savings'], ['investments', 'Investments'], ['loans', 'Micro-Loans']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8e] dark:from-blue-600 dark:to-blue-500 text-white shadow-sm' : 'text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'investments' ? <InvestmentsTab /> : tab === 'loans' ? <LoansTab /> : null}

      {tab !== 'savings' ? null : isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-[#1e3a5f] to-[#2d5a8e] dark:from-blue-600 dark:to-blue-500 text-white border-0">
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  <PiggyBank size={20} />
                  <span className="text-sm text-white/80">Wallet Balance</span>
                </div>
                <p className="text-3xl font-bold">{formatCurrency(wallet?.balance ?? 0)}</p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setShowDeposit(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium h-8 px-4 bg-white/20 text-white hover:bg-white/30 backdrop-blur transition-all hover:-translate-y-[1px] cursor-pointer"
                  >
                    <ArrowDownRight size={14} /> Deposit
                  </button>
                  <button
                    onClick={() => setShowWithdraw(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium h-8 px-4 border border-white/30 text-white hover:bg-white/10 transition-all hover:-translate-y-[1px] cursor-pointer"
                  >
                    <ArrowUpRight size={14} /> Withdraw
                  </button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-muted">Active Plans</p>
                <p className="text-2xl font-bold text-primary-dark dark:text-white mt-1">{activePlans.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-muted">Total Saved in Plans</p>
                <p className="text-2xl font-bold text-accent mt-1">
                  {formatCurrency(plans.reduce((sum, p) => sum + p.currentAmount, 0))}
                </p>
              </CardContent>
            </Card>
          </div>

          {plans.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Savings Plans</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {plans.map((plan) => (
                    <div key={plan.id} className="rounded-lg border border-border dark:border-[#252a3a] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-primary-dark dark:text-white">Plan #{plan.id.slice(0, 8)}</h3>
                          <p className="text-xs text-muted dark:text-gray-400 capitalize">{plan.frequency} contributions - Target {formatDate(plan.targetDate)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={plan.status === 'active' ? 'success' : plan.status === 'completed' ? 'default' : 'muted'}>{plan.status}</Badge>
                          {plan.status === 'active' && (
                            <Button size="sm" variant="outline" onClick={() => setShowContribute(plan.id)}>Contribute</Button>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted">Progress</span>
                        <span className="font-medium">{Math.min(100, Math.round((plan.currentAmount / plan.targetAmount) * 100))}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (plan.currentAmount / plan.targetAmount) * 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted mt-2">
                        <span>Saved: {formatCurrency(plan.currentAmount)}</span>
                        <span>Target: {formatCurrency(plan.targetAmount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {recentTxs.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentTxs.map((tx, i) => (
                    <div key={tx.id ?? tx.reference ?? i} className="flex items-center justify-between py-2 border-b border-border dark:border-[#252a3a] last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${tx.type === 'deposit' ? 'bg-accent/10' : 'bg-danger/10'}`}>
                          {tx.type === 'deposit' ? <ArrowDownRight size={16} className="text-accent" /> : <ArrowUpRight size={16} className="text-danger" />}
                        </div>
                        <div>
                          <p className="text-sm text-primary-dark dark:text-white">{tx.description}</p>
                          <p className="text-xs text-muted">{formatDate(tx.createdAt)}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-medium ${tx.type === 'deposit' ? 'text-accent' : 'text-danger'}`}>
                        {tx.type === 'deposit' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <WalletActionModal open={showDeposit} onClose={() => setShowDeposit(false)} action="deposit" />
      <WalletActionModal open={showWithdraw} onClose={() => setShowWithdraw(false)} action="withdraw" />
      <CreatePlanModal open={showNewPlan} onClose={() => setShowNewPlan(false)} />
      <ContributeModal planId={showContribute} onClose={() => setShowContribute(null)} />
    </div>
  )
}

function WalletActionModal({ open, onClose, action }: { open: boolean; onClose: () => void; action: 'deposit' | 'withdraw' }) {
  const deposit = useDeposit()
  const withdraw = useWithdraw()
  const mutation = action === 'deposit' ? deposit : withdraw
  const [form, setForm] = useState({ amount: '', method: 'mtn_momo' })

  function handleClose() {
    onClose()
    setForm({ amount: '', method: 'mtn_momo' })
    mutation.reset()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await mutation.mutateAsync({ amount: Number(form.amount), method: form.method })
      handleClose()
    } catch {
      // Error is displayed via mutation.isError
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={action === 'deposit' ? 'Deposit to Wallet' : 'Withdraw from Wallet'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input id="amount" label="Amount (GHS)" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required min="1" />
        <Select id="method" label="Method" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} options={methodOptions} />
        {mutation.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(mutation.error as Error).message}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending} variant={action === 'deposit' ? 'accent' : 'primary'}>
            {mutation.isPending ? 'Processing...' : action === 'deposit' ? 'Deposit' : 'Withdraw'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CreatePlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createPlan = useCreateSavingsPlan()
  const [form, setForm] = useState({ targetAmount: '', frequency: 'monthly', contributionAmount: '', targetDate: '', autoDebit: false })

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await createPlan.mutateAsync({
      targetAmount: Number(form.targetAmount),
      frequency: form.frequency as 'daily' | 'weekly' | 'monthly',
      contributionAmount: Number(form.contributionAmount),
      targetDate: form.targetDate,
      autoDebit: form.autoDebit,
    })
    onClose()
    setForm({ targetAmount: '', frequency: 'monthly', contributionAmount: '', targetDate: '', autoDebit: false })
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Savings Plan">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
        <Input id="targetAmount" label="Target Amount (GHS)" type="number" value={form.targetAmount} onChange={(e) => update('targetAmount', e.target.value)} required min="1" />
        <Select id="frequency" label="Contribution Frequency" value={form.frequency} onChange={(e) => update('frequency', e.target.value)} options={frequencyOptions} />
        <Input id="contributionAmount" label="Contribution per Cycle (GHS)" type="number" value={form.contributionAmount} onChange={(e) => update('contributionAmount', e.target.value)} required min="1" />
        <DatePicker label="Target Date" value={form.targetDate} onChange={(v) => update('targetDate', v)} required minDate={new Date().toISOString().slice(0, 10)} />
        <label className="flex items-center gap-2.5 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
          <Switch checked={form.autoDebit} onChange={(v) => update('autoDebit', v)} size="sm" />
          Enable auto-debit
        </label>
        {createPlan.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(createPlan.error as Error).message}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createPlan.isPending}>{createPlan.isPending ? 'Creating...' : 'Create Plan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function ContributeModal({ planId, onClose }: { planId: string | null; onClose: () => void }) {
  const contribute = useContributeToSavings()
  const [amount, setAmount] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!planId) return
    await contribute.mutateAsync({ planId, amount: Number(amount) })
    onClose()
    setAmount('')
  }

  return (
    <Modal open={!!planId} onClose={onClose} title="Contribute to Plan">
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-muted mb-4">This will deduct from your wallet balance.</p>
        <Input id="amount" label="Amount (GHS)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min="1" />
        {contribute.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger mt-4">{(contribute.error as Error).message}</div>}
        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={contribute.isPending}>{contribute.isPending ? 'Contributing...' : 'Contribute'}</Button>
        </div>
      </form>
    </Modal>
  )
}
