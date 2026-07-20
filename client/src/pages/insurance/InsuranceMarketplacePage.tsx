import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import TextField from '@mui/material/TextField'
import {
  ShieldPlus, ShieldCheck, FileWarning, Wallet as WalletIcon, Plus, Pencil,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  useInsuranceProducts, useMyPolicies, useBuyPolicy, useFileClaim, useWallet,
  useCreateInsuranceProduct, useUpdateInsuranceProduct,
} from '@/hooks/useApi'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import type { InsuranceProduct, InsurancePolicy, InsuranceCategory } from '@/types'

const CATEGORY_LABELS: Record<InsuranceCategory, string> = {
  renters: 'Renters',
  landlord: 'Landlord',
  rent_guarantee: 'Rent Guarantee',
  property_damage: 'Property Damage',
  tenant_default: 'Tenant Default',
}

const CATEGORY_VARIANTS: Record<InsuranceCategory, 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  renters: 'default',
  landlord: 'success',
  rent_guarantee: 'warning',
  property_damage: 'danger',
  tenant_default: 'muted',
}

const POLICY_STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  pending: 'warning',
  active: 'success',
  lapsed: 'muted',
  cancelled: 'muted',
  claimed: 'danger',
}

export function InsuranceMarketplacePage() {
  const user = useAuthStore((s) => s.user)
  const role = user?.activeRole ?? 'tenant'
  const isAdmin = role === 'admin' || (user?.roles ?? []).includes('super_admin')
  const [tab, setTab] = useState<'browse' | 'policies' | 'manage'>('browse')
  const { attach: tabIndicatorAttach, style: tabIndicatorStyle, visible: tabIndicatorVisible } = useSlidingIndicator<HTMLDivElement, 'underline'>(tab, 'underline')

  // Categories visible per role
  const visibleCategories = useMemo<InsuranceCategory[]>(() => {
    if (isAdmin) return ['renters', 'landlord', 'rent_guarantee', 'property_damage', 'tenant_default']
    if (role === 'tenant') return ['renters']
    if (role === 'landlord' || role === 'property_manager') return ['landlord', 'rent_guarantee', 'property_damage', 'tenant_default']
    return ['renters', 'landlord', 'rent_guarantee', 'property_damage', 'tenant_default']
  }, [role, isAdmin])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight flex items-center gap-2">
            <ShieldPlus size={24} className="text-primary dark:text-blue-400" />
            Insurance Marketplace
          </h1>
          <p className="text-xs sm:text-sm text-muted dark:text-gray-400 mt-0.5">
            Protect your home, belongings, and rental income with policies from trusted partners.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div ref={tabIndicatorAttach} className="relative flex gap-1 border-b border-border/40 dark:border-[#252a3a]/40">
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 rounded-full bg-primary transition-[transform,width] duration-300 ease-out dark:bg-blue-400"
          style={{ ...tabIndicatorStyle, opacity: tabIndicatorVisible ? 1 : 0 }}
        />
        <TabButton tabKey="browse" active={tab === 'browse'} onClick={() => setTab('browse')}>Browse</TabButton>
        <TabButton tabKey="policies" active={tab === 'policies'} onClick={() => setTab('policies')}>My Policies</TabButton>
        {isAdmin && <TabButton tabKey="manage" active={tab === 'manage'} onClick={() => setTab('manage')}>Manage Products</TabButton>}
      </div>

      {tab === 'browse' && <BrowseTab visibleCategories={visibleCategories} />}
      {tab === 'policies' && <PoliciesTab />}
      {tab === 'manage' && isAdmin && <ManageTab />}
    </div>
  )
}

function TabButton({ tabKey, active, onClick, children }: { tabKey: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      data-tab-key={tabKey}
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? 'text-primary dark:text-blue-400'
          : 'text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Browse Tab ───

function BrowseTab({ visibleCategories }: { visibleCategories: InsuranceCategory[] }) {
  const [categoryFilter, setCategoryFilter] = useState<InsuranceCategory | 'all'>('all')
  const { data, isLoading } = useInsuranceProducts(
    categoryFilter === 'all' ? undefined : { category: categoryFilter },
  )
  const products = (data?.items ?? []).filter((p) => visibleCategories.includes(p.category))
  const [selected, setSelected] = useState<InsuranceProduct | null>(null)
  const { attach: categoryPillAttach, style: categoryPillStyle, visible: categoryPillVisible } = useSlidingIndicator<HTMLDivElement>(categoryFilter === 'all' ? '__all__' : categoryFilter)

  return (
    <div className="space-y-4">
      {/* Category chips */}
      <div ref={categoryPillAttach} className="relative isolate flex flex-wrap gap-1.5">
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary shadow-sm transition-[transform,width,height] duration-300 ease-out"
          style={{ ...categoryPillStyle, opacity: categoryPillVisible ? 1 : 0 }}
        />
        <CategoryChip
          tabKey="__all__"
          active={categoryFilter === 'all'}
          onClick={() => setCategoryFilter('all')}
          label="All"
        />
        {visibleCategories.map((c) => (
          <CategoryChip
            key={c}
            tabKey={c}
            active={categoryFilter === c}
            onClick={() => setCategoryFilter(c)}
            label={CATEGORY_LABELS[c]}
          />
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="No insurance products available"
          description="Check back soon — new products are added regularly."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onBuy={() => setSelected(p)} />
          ))}
        </div>
      )}

      {selected && (
        <BuyPolicyModal product={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function CategoryChip({ tabKey, active, onClick, label }: { tabKey: string; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      data-tab-key={tabKey}
      onClick={onClick}
      className={`relative z-10 text-[11px] px-3 py-1.5 rounded-full border transition-colors font-medium ${
        active
          ? 'text-white border-primary'
          : 'border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:border-primary/50'
      }`}
    >
      {label}
    </button>
  )
}

function ProductCard({ product, onBuy }: { product: InsuranceProduct; onBuy: () => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-primary-dark dark:text-white truncate">{product.productName}</h3>
          <p className="text-[11px] text-muted dark:text-gray-500 truncate">{product.providerName}</p>
        </div>
        <Badge variant={CATEGORY_VARIANTS[product.category]}>{CATEGORY_LABELS[product.category]}</Badge>
      </div>

      <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">{product.description}</p>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5">
          <p className="text-muted dark:text-gray-500">Premium</p>
          <p className="font-bold text-primary dark:text-blue-400">{formatCurrency(product.monthlyPremium)}/mo</p>
        </div>
        <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5">
          <p className="text-muted dark:text-gray-500">Coverage</p>
          <p className="font-bold text-primary-dark dark:text-white">{formatCurrency(product.coverageLimit)}</p>
        </div>
      </div>

      <div className="text-[10px] text-muted dark:text-gray-500 leading-relaxed">
        <p className="font-semibold">Includes:</p>
        <p>{product.coverageDetails}</p>
      </div>

      <Button onClick={onBuy} className="w-full mt-auto">
        <ShieldCheck size={14} /> Buy Policy
      </Button>
    </Card>
  )
}

function BuyPolicyModal({ product, onClose }: { product: InsuranceProduct; onClose: () => void }) {
  const { data: wallet } = useWallet()
  const buy = useBuyPolicy()
  const balance = wallet?.balance ?? 0
  const insufficient = balance < product.monthlyPremium

  async function handleBuy() {
    try {
      await buy.mutateAsync({ productId: product.id, termMonths: 12 })
      useToastStore.getState().addToast(`Policy ${product.productName} activated.`, 'success')
      onClose()
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || 'Failed to buy policy', 'error')
    }
  }

  return (
    <Modal open onClose={onClose} title="Confirm Policy Purchase">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-primary-dark dark:text-white">{product.productName}</p>
          <p className="text-xs text-muted dark:text-gray-400">{product.providerName}</p>
        </div>

        <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted dark:text-gray-500">Monthly premium</span>
            <span className="font-bold text-primary-dark dark:text-white">{formatCurrency(product.monthlyPremium)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted dark:text-gray-500">Coverage limit</span>
            <span className="font-bold text-primary-dark dark:text-white">{formatCurrency(product.coverageLimit)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted dark:text-gray-500">Excess</span>
            <span className="font-bold text-primary-dark dark:text-white">{formatCurrency(product.excessAmount)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted dark:text-gray-500">Term</span>
            <span className="font-bold text-primary-dark dark:text-white">12 months</span>
          </div>
        </div>

        <div className={`rounded-xl p-3 flex items-center gap-2 ${insufficient ? 'bg-danger/10 text-danger' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
          <WalletIcon size={14} />
          <span className="text-xs font-semibold">
            Wallet balance: {formatCurrency(balance)}
            {insufficient ? ' — insufficient funds' : ''}
          </span>
        </div>

        {product.terms && (
          <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] p-3">
            <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-1">Terms</p>
            <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed">{product.terms}</p>
          </div>
        )}

        {buy.isError && (
          <div className="rounded-md bg-danger/10 p-2.5 text-xs text-danger">{(buy.error as Error).message}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleBuy} disabled={insufficient || buy.isPending}>
            {buy.isPending ? 'Processing...' : `Pay ${formatCurrency(product.monthlyPremium)}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Policies Tab ───

function PoliciesTab() {
  const { data, isLoading } = useMyPolicies()
  const { data: productsData } = useInsuranceProducts({ all: true })
  const policies = data?.items ?? []
  const productsById = new Map((productsData?.items ?? []).map((p) => [p.id, p]))
  const [claimPolicy, setClaimPolicy] = useState<InsurancePolicy | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    )
  }

  if (policies.length === 0) {
    return (
      <EmptyState
        title="No insurance policies yet"
        description="Browse the marketplace to protect your home or rental investment."
      />
    )
  }

  return (
    <div className="space-y-3">
      {policies.map((policy) => {
        const product = productsById.get(policy.productId)
        return (
          <PolicyCard
            key={policy.id}
            policy={policy}
            productName={product?.productName ?? 'Policy'}
            providerName={product?.providerName ?? 'Insurance Provider'}
            onClaim={() => setClaimPolicy(policy)}
          />
        )
      })}

      {claimPolicy && <FileClaimModal policy={claimPolicy} onClose={() => setClaimPolicy(null)} />}
    </div>
  )
}

function PolicyCard({
  policy, productName, providerName, onClaim,
}: { policy: InsurancePolicy; productName: string; providerName: string; onClaim: () => void }) {
  const canClaim = policy.status === 'active' || policy.status === 'claimed'
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-primary-dark dark:text-white">{productName}</h3>
          <p className="text-[11px] text-muted dark:text-gray-500">{providerName}</p>
          <p className="text-[10px] font-mono text-muted dark:text-gray-500 mt-0.5">{policy.policyNumber}</p>
        </div>
        <Badge variant={POLICY_STATUS_VARIANTS[policy.status] ?? 'default'}>{policy.status}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
          <p className="text-muted dark:text-gray-500">Premium</p>
          <p className="font-bold text-primary-dark dark:text-white">{formatCurrency(policy.monthlyPremium)}</p>
        </div>
        <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
          <p className="text-muted dark:text-gray-500">Started</p>
          <p className="font-bold text-primary-dark dark:text-white">{policy.startDate}</p>
        </div>
        <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
          <p className="text-muted dark:text-gray-500">Ends</p>
          <p className="font-bold text-primary-dark dark:text-white">{policy.endDate}</p>
        </div>
      </div>

      {policy.claims.length > 0 && (
        <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] p-2.5">
          <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-1.5">Claims</p>
          <div className="space-y-1">
            {policy.claims.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-[11px]">
                <span className="text-gray-600 dark:text-gray-300 truncate flex-1">{c.description}</span>
                <Badge variant={c.status === 'paid' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'} className="ml-2">
                  {formatCurrency(c.amount)} - {c.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onClaim} disabled={!canClaim}>
          <FileWarning size={12} /> File Claim
        </Button>
      </div>
    </Card>
  )
}

function FileClaimModal({ policy, onClose }: { policy: InsurancePolicy; onClose: () => void }) {
  const fileClaim = useFileClaim()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount)
    if (!num || num <= 0) {
      setFormError('Enter a claim amount greater than 0.')
      return
    }
    if (description.trim().length < 10) {
      setFormError('Description must be at least 10 characters.')
      return
    }
    setFormError('')
    try {
      await fileClaim.mutateAsync({ id: policy.id, amount: num, description })
      useToastStore.getState().addToast('Claim filed successfully.', 'success')
      onClose()
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || 'Failed to file claim', 'error')
    }
  }

  return (
    <Modal open onClose={onClose} title="File Insurance Claim">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] p-3">
          <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-1">Policy</p>
          <p className="text-xs font-mono text-primary-dark dark:text-white">{policy.policyNumber}</p>
        </div>

        <TextField
          id="claim-amount"
          label="Claim Amount (GHS)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          fullWidth
          required
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          id="claim-description"
          label="Description (min 10 characters)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what happened..."
          fullWidth
          required
          multiline
          rows={4}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {formError && (
          <div className="rounded-md bg-danger/10 p-2.5 text-xs text-danger">{formError}</div>
        )}

        {fileClaim.isError && (
          <div className="rounded-md bg-danger/10 p-2.5 text-xs text-danger">{(fileClaim.error as Error).message}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={fileClaim.isPending}>
            {fileClaim.isPending ? 'Submitting...' : 'Submit Claim'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Admin Manage Tab ───

function ManageTab() {
  const { data, isLoading } = useInsuranceProducts({ all: true })
  const products = data?.items ?? []
  const [editing, setEditing] = useState<InsuranceProduct | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus size={14} /> New Product</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState title="No products" description="Create your first insurance product." />
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-primary-dark dark:text-white truncate">{p.productName}</p>
                  <Badge variant={CATEGORY_VARIANTS[p.category]}>{CATEGORY_LABELS[p.category]}</Badge>
                  <Badge variant={p.active ? 'success' : 'muted'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <p className="text-[11px] text-muted dark:text-gray-500">
                  {p.providerName} - {formatCurrency(p.monthlyPremium)}/mo - {formatCurrency(p.coverageLimit)} limit
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                <Pencil size={12} /> Edit
              </Button>
            </Card>
          ))}
        </div>
      )}

      {editing && <EditProductModal product={editing} onClose={() => setEditing(null)} />}
      {creating && <CreateProductModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function EditProductModal({ product, onClose }: { product: InsuranceProduct; onClose: () => void }) {
  const update = useUpdateInsuranceProduct()
  const [active, setActive] = useState(product.active)
  const [terms, setTerms] = useState(product.terms ?? '')
  const [premium, setPremium] = useState(String(product.monthlyPremium))

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    try {
      await update.mutateAsync({
        id: product.id,
        active,
        terms,
        monthlyPremium: Number(premium),
      })
      useToastStore.getState().addToast('Product updated.', 'success')
      onClose()
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || 'Update failed', 'error')
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit: ${product.productName}`}>
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Switch checked={active} onChange={setActive} size="sm" />
          <span className="text-sm text-gray-600 dark:text-gray-300">Active</span>
        </label>
        <TextField
          id="edit-premium"
          label="Monthly Premium (GHS)"
          type="number"
          value={premium}
          onChange={(e) => setPremium(e.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          id="edit-terms"
          label="Terms"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          fullWidth
          multiline
          rows={4}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving...' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function CreateProductModal({ onClose }: { onClose: () => void }) {
  const create = useCreateInsuranceProduct()
  const [form, setForm] = useState({
    providerId: '',
    providerName: '',
    productName: '',
    category: 'renters' as InsuranceCategory,
    description: '',
    coverageDetails: '',
    monthlyPremium: '',
    coverageLimit: '',
    excessAmount: '0',
    terms: '',
    commissionPct: '5',
  })

  function uf<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await create.mutateAsync({
        providerId: form.providerId,
        providerName: form.providerName,
        productName: form.productName,
        category: form.category,
        description: form.description,
        coverageDetails: form.coverageDetails,
        monthlyPremium: Number(form.monthlyPremium),
        coverageLimit: Number(form.coverageLimit),
        excessAmount: Number(form.excessAmount),
        terms: form.terms,
        active: true,
        commissionPct: Number(form.commissionPct),
      })
      useToastStore.getState().addToast('Product created.', 'success')
      onClose()
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || 'Create failed', 'error')
    }
  }

  return (
    <Modal open onClose={onClose} title="New Insurance Product">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <TextField id="np-providerId" label="Provider ID" value={form.providerId} onChange={(e) => uf('providerId', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField id="np-providerName" label="Provider Name" value={form.providerName} onChange={(e) => uf('providerName', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
        </div>
        <TextField id="np-productName" label="Product Name" value={form.productName} onChange={(e) => uf('productName', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
        <TextField
          id="np-category" label="Category" select value={form.category}
          onChange={(e) => uf('category', e.target.value as InsuranceCategory)}
          fullWidth required slotProps={{ inputLabel: { shrink: true }, select: { native: true } }}
        >
          <option value="renters">Renters</option>
          <option value="landlord">Landlord</option>
          <option value="rent_guarantee">Rent Guarantee</option>
          <option value="property_damage">Property Damage</option>
          <option value="tenant_default">Tenant Default</option>
        </TextField>
        <TextField id="np-description" label="Description" value={form.description} onChange={(e) => uf('description', e.target.value)} fullWidth required multiline rows={2} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField id="np-coverageDetails" label="Coverage Details" value={form.coverageDetails} onChange={(e) => uf('coverageDetails', e.target.value)} fullWidth required multiline rows={2} slotProps={{ inputLabel: { shrink: true } }} />
        <div className="grid grid-cols-3 gap-3">
          <TextField id="np-premium" label="Premium/mo" type="number" value={form.monthlyPremium} onChange={(e) => uf('monthlyPremium', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField id="np-limit" label="Coverage Limit" type="number" value={form.coverageLimit} onChange={(e) => uf('coverageLimit', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField id="np-excess" label="Excess" type="number" value={form.excessAmount} onChange={(e) => uf('excessAmount', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        </div>
        <TextField id="np-commission" label="Commission %" type="number" value={form.commissionPct} onChange={(e) => uf('commissionPct', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        <TextField id="np-terms" label="Terms" value={form.terms} onChange={(e) => uf('terms', e.target.value)} fullWidth multiline rows={3} slotProps={{ inputLabel: { shrink: true } }} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating...' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  )
}
