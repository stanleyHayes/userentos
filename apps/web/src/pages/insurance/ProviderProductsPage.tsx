import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { ApprovalStatusBanner } from '@/components/ApprovalStatusBanner'
import TextField from '@mui/material/TextField'
import { Building2, Plus, Pencil } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  useMyInsuranceProviderProfile, useUpsertInsuranceProviderProfile,
  useMyInsuranceProducts, useCreateMyInsuranceProduct, useUpdateMyInsuranceProduct,
} from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'
import type { InsuranceProduct, InsuranceCategory } from '@/types'

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

/**
 * Insurance provider portal: register a provider profile (admin-approved KYC),
 * then manage your own insurance products once approved.
 */
export function ProviderProductsPage() {
  const { data: profile, isLoading: profileLoading } = useMyInsuranceProviderProfile()
  const approved = profile?.approvalStatus === 'approved'
  const { data, isLoading } = useMyInsuranceProducts(approved)
  const products = data?.items ?? []
  const [editing, setEditing] = useState<InsuranceProduct | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight flex items-center gap-2">
          <Building2 size={24} className="text-primary dark:text-blue-400" />
          Insurance Provider Portal
        </h1>
        <p className="text-xs sm:text-sm text-muted dark:text-gray-400 mt-0.5">
          Register your company, pass admin review, and list your insurance products on the marketplace.
        </p>
      </div>

      <ApprovalStatusBanner
        status={profile?.approvalStatus}
        rejectionReason={profile?.rejectionReason}
        entityLabel="insurance provider profile"
      />

      {profileLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : !profile ? (
        <ProviderProfileForm />
      ) : approved ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setCreating(true)}><Plus size={14} /> New Product</Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : products.length === 0 ? (
            <EmptyState title="No products yet" description="Create your first insurance product for the marketplace." />
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
                      {formatCurrency(p.monthlyPremium)}/mo - {formatCurrency(p.coverageLimit)} limit
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
      ) : (
        <EmptyState
          title="Awaiting approval"
          description="Your provider profile is with our review team. You can list products here once it's approved."
        />
      )}
    </div>
  )
}

// ─── Provider profile registration (KYC) ───

function ProviderProfileForm() {
  const upsert = useUpsertInsuranceProviderProfile()
  const [form, setForm] = useState({
    institutionName: '',
    licenseNumber: '',
    companyRegistrationNo: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
  })

  function uf<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await upsert.mutateAsync({
        institutionName: form.institutionName,
        licenseNumber: form.licenseNumber || undefined,
        companyRegistrationNo: form.companyRegistrationNo || undefined,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        address: form.address || undefined,
      })
      useToastStore.getState().addToast('Profile submitted for review.', 'success')
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || 'Submission failed', 'error')
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-bold text-primary-dark dark:text-white">Register as an insurance provider</h2>
      <p className="text-xs text-muted dark:text-gray-400 mt-1 mb-4">
        Your details are reviewed by an administrator before your account can list products.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField id="ip-name" label="Institution Name" value={form.institutionName} onChange={(e) => uf('institutionName', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
        <div className="grid grid-cols-2 gap-3">
          <TextField id="ip-license" label="License Number" value={form.licenseNumber} onChange={(e) => uf('licenseNumber', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
          <TextField id="ip-regno" label="Company Registration No." value={form.companyRegistrationNo} onChange={(e) => uf('companyRegistrationNo', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField id="ip-email" label="Contact Email" type="email" value={form.contactEmail} onChange={(e) => uf('contactEmail', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField id="ip-phone" label="Contact Phone" value={form.contactPhone} onChange={(e) => uf('contactPhone', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
        </div>
        <TextField id="ip-address" label="Address" value={form.address} onChange={(e) => uf('address', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        <div className="flex justify-end">
          <Button type="submit" disabled={upsert.isPending}>{upsert.isPending ? 'Submitting...' : 'Submit for Review'}</Button>
        </div>
      </form>
    </Card>
  )
}

// ─── Product modals (providerId/providerName are set server-side from the profile) ───

function EditProductModal({ product, onClose }: { product: InsuranceProduct; onClose: () => void }) {
  const update = useUpdateMyInsuranceProduct()
  const [active, setActive] = useState(product.active)
  const [terms, setTerms] = useState(product.terms ?? '')
  const [premium, setPremium] = useState(String(product.monthlyPremium))

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    try {
      await update.mutateAsync({ id: product.id, active, terms, monthlyPremium: Number(premium) })
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
          id="pp-edit-premium"
          label="Monthly Premium (GHS)"
          type="number"
          value={premium}
          onChange={(e) => setPremium(e.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          id="pp-edit-terms"
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
  const create = useCreateMyInsuranceProduct()
  const [form, setForm] = useState({
    productName: '',
    category: 'renters' as InsuranceCategory,
    description: '',
    coverageDetails: '',
    monthlyPremium: '',
    coverageLimit: '',
    excessAmount: '0',
    terms: '',
  })

  function uf<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await create.mutateAsync({
        productName: form.productName,
        category: form.category,
        description: form.description,
        coverageDetails: form.coverageDetails,
        monthlyPremium: Number(form.monthlyPremium),
        coverageLimit: Number(form.coverageLimit),
        excessAmount: Number(form.excessAmount),
        terms: form.terms,
        active: true,
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
        <TextField id="pp-productName" label="Product Name" value={form.productName} onChange={(e) => uf('productName', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
        <TextField
          id="pp-category" label="Category" select value={form.category}
          onChange={(e) => uf('category', e.target.value as InsuranceCategory)}
          fullWidth required slotProps={{ inputLabel: { shrink: true }, select: { native: true } }}
        >
          <option value="renters">Renters</option>
          <option value="landlord">Landlord</option>
          <option value="rent_guarantee">Rent Guarantee</option>
          <option value="property_damage">Property Damage</option>
          <option value="tenant_default">Tenant Default</option>
        </TextField>
        <TextField id="pp-description" label="Description" value={form.description} onChange={(e) => uf('description', e.target.value)} fullWidth required multiline rows={2} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField id="pp-coverageDetails" label="Coverage Details" value={form.coverageDetails} onChange={(e) => uf('coverageDetails', e.target.value)} fullWidth required multiline rows={2} slotProps={{ inputLabel: { shrink: true } }} />
        <div className="grid grid-cols-3 gap-3">
          <TextField id="pp-premium" label="Premium/mo" type="number" value={form.monthlyPremium} onChange={(e) => uf('monthlyPremium', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField id="pp-limit" label="Coverage Limit" type="number" value={form.coverageLimit} onChange={(e) => uf('coverageLimit', e.target.value)} fullWidth required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField id="pp-excess" label="Excess" type="number" value={form.excessAmount} onChange={(e) => uf('excessAmount', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        </div>
        <TextField id="pp-terms" label="Terms" value={form.terms} onChange={(e) => uf('terms', e.target.value)} fullWidth multiline rows={3} slotProps={{ inputLabel: { shrink: true } }} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating...' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  )
}
