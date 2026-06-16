import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FormGrid } from '@/components/ui/FormGrid'
import {
  useAllSubscriptionPackages,
  useCreateSubscriptionPackage,
  useUpdateSubscriptionPackage,
} from '@/hooks/useApi'
import { ArrowLeft, Plus, X, Package, Eye, Check, CreditCard, ListChecks, Settings2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import toast from 'react-hot-toast'
import { FormSkeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  price: 0,
  billingCycle: 'monthly' as 'monthly' | 'yearly',
  maxProperties: 3,
  benefits: [''],
  isActive: true,
  isDefault: false,
  sortOrder: 0,
}

export function PackageEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id

  const { data: packagesData, isLoading: loadingPackages } = useAllSubscriptionPackages()
  const createPkg = useCreateSubscriptionPackage()
  const updatePkg = useUpdateSubscriptionPackage()

  const [form, setForm] = useState(emptyForm)

  // Hydrate form from existing package on edit (compare-by-id pattern)
  const [hydratedFromId, setHydratedFromId] = useState<string | null>(null)
  if (isEdit && id && packagesData?.items && hydratedFromId !== id) {
    const pkg = packagesData.items.find((p) => p.id === id)
    if (pkg) {
      setHydratedFromId(id)
      setForm({
        name: pkg.name,
        slug: pkg.slug,
        description: pkg.description,
        price: pkg.price,
        billingCycle: pkg.billingCycle,
        maxProperties: pkg.maxProperties,
        benefits: pkg.benefits.length > 0 ? [...pkg.benefits] : [''],
        isActive: pkg.isActive,
        isDefault: pkg.isDefault,
        sortOrder: pkg.sortOrder,
      })
    }
  }

  // Auto-generate slug from name
  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      slug: f.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    }))
  }

  function addBenefit() {
    setForm((f) => ({ ...f, benefits: [...f.benefits, ''] }))
  }

  function removeBenefit(idx: number) {
    setForm((f) => ({ ...f, benefits: f.benefits.filter((_, i) => i !== idx) }))
  }

  function updateBenefit(idx: number, value: string) {
    setForm((f) => ({ ...f, benefits: f.benefits.map((b, i) => (i === idx ? value : b)) }))
  }

  async function handleSubmit() {
    const benefits = form.benefits.filter((b) => b.trim())
    const payload = { ...form, benefits }

    try {
      if (isEdit) {
        await updatePkg.mutateAsync({ id, ...payload })
        toast.success('Package updated')
      } else {
        await createPkg.mutateAsync(payload)
        toast.success('Package created')
      }
      navigate('/admin/packages')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save package')
    }
  }

  if (isEdit && loadingPackages) return <FormSkeleton fields={6} />

  const isSaving = createPkg.isPending || updatePkg.isPending
  const canSubmit = form.name && form.slug && form.description && !isSaving

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border/80 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/packages')}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/80 text-muted transition-colors hover:border-primary/40 hover:text-primary-dark dark:border-white/10 dark:hover:text-white"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary dark:bg-sky-400/10 dark:text-sky-300">
                <Package size={22} />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary-dark dark:text-white">
                  {isEdit ? 'Edit Package' : 'Create Package'}
                </h1>
                <p className="mt-1 text-sm text-muted">
                  {isEdit ? 'Update subscription package details' : 'Set up a new subscription tier'}
                </p>
              </div>
            </div>
          </div>
          <Badge variant={form.isActive ? 'success' : 'danger'}>
            {form.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Form */}
        <div className="space-y-6">
          {/* Basic Info */}
          <Card className="p-5 sm:p-6">
            <CardHeader className="mb-5">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary dark:bg-sky-400/10 dark:text-sky-300">
                  <Package size={17} />
                </span>
                <div>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Package naming and public copy.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormGrid columns={2}>
                <TextField
                  label="Package Name"
                  fullWidth
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Professional"
                />
                <TextField
                  label="Slug"
                  fullWidth
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                  helperText="URL-friendly identifier"
                />
              </FormGrid>
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={4}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe what this package offers..."
              />
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card className="p-5 sm:p-6">
            <CardHeader className="mb-5">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary dark:bg-sky-400/10 dark:text-sky-300">
                  <CreditCard size={17} />
                </span>
                <div>
                  <CardTitle>Pricing and Limits</CardTitle>
                  <CardDescription>Billing cadence and property allowance.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormGrid columns={3}>
                <TextField
                  label="Price (GHS)"
                  type="number"
                  fullWidth
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                  helperText="0 = Free tier"
                />
                <TextField
                  label="Billing Cycle"
                  select
                  fullWidth
                  value={form.billingCycle}
                  onChange={(e) => setForm((f) => ({ ...f, billingCycle: e.target.value as 'monthly' | 'yearly' }))}
                >
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="yearly">Yearly</MenuItem>
                </TextField>
                <TextField
                  label="Max Properties"
                  type="number"
                  fullWidth
                  value={form.maxProperties}
                  onChange={(e) => setForm((f) => ({ ...f, maxProperties: Number(e.target.value) }))}
                  helperText="-1 = Unlimited"
                  slotProps={{ htmlInput: { min: -1 } }}
                />
              </FormGrid>
            </CardContent>
          </Card>

          {/* Benefits */}
          <Card className="p-5 sm:p-6">
            <CardHeader className="mb-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary dark:bg-sky-400/10 dark:text-sky-300">
                    <ListChecks size={17} />
                  </span>
                  <div>
                    <CardTitle>Benefits</CardTitle>
                    <CardDescription>Visible package inclusions.</CardDescription>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={addBenefit} type="button">
                  <Plus size={14} /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {form.benefits.map((b, i) => (
                  <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-border/80 bg-surface/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="mt-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent/10">
                      <Check size={12} className="text-accent" />
                    </div>
                    <TextField
                      fullWidth
                      placeholder={`Benefit ${i + 1}`}
                      value={b}
                      onChange={(e) => updateBenefit(i, e.target.value)}
                    />
                    {form.benefits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBenefit(i)}
                        className="mt-1 grid h-10 w-10 place-items-center rounded-xl text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card className="p-5 sm:p-6">
            <CardHeader className="mb-5">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary dark:bg-sky-400/10 dark:text-sky-300">
                  <Settings2 size={17} />
                </span>
                <div>
                  <CardTitle>Settings</CardTitle>
                  <CardDescription>Publishing and display order.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
                <TextField
                  label="Sort Order"
                  type="number"
                  fullWidth
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  helperText="Lower = shown first"
                />
                <div className="flex min-h-[64px] items-center rounded-xl border border-border/80 bg-surface/60 px-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        checked={form.isActive}
                        onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                        color="primary"
                      />
                    }
                    label="Active"
                  />
                </div>
                <div className="flex min-h-[64px] items-center rounded-xl border border-border/80 bg-surface/60 px-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        checked={form.isDefault}
                        onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                        color="primary"
                      />
                    }
                    label="Default Package"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-3 rounded-2xl border border-border/80 bg-white/90 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={() => navigate('/admin/packages')}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {isSaving ? 'Saving...' : isEdit ? 'Update Package' : 'Create Package'}
            </Button>
          </div>
        </div>

        {/* Live Preview */}
        <div>
          <div className="sticky top-24 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-500">
              <Eye size={14} /> Live Preview
            </div>
            <Card className={`overflow-hidden p-0 ${!form.isActive ? 'opacity-60' : ''}`}>
              <div className="h-1.5 bg-gradient-to-r from-primary to-blue-500" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-extrabold font-display text-primary-dark dark:text-white">
                      {form.name || 'Package Name'}
                    </h3>
                    <p className="text-[10px] text-muted font-mono">{form.slug || 'slug'}</p>
                  </div>
                  <div className="flex gap-1">
                    {form.isDefault && <Badge variant="success" className="text-[9px]">Default</Badge>}
                    {!form.isActive && <Badge variant="danger" className="text-[9px]">Inactive</Badge>}
                  </div>
                </div>

                <div className="mb-4">
                  <span className="text-3xl font-extrabold font-display text-primary-dark dark:text-white">
                    {form.price === 0 ? 'Free' : formatCurrency(form.price)}
                  </span>
                  {form.price > 0 && (
                    <span className="text-sm text-muted">/{form.billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                  )}
                </div>

                <p className="text-xs text-muted mb-4 leading-relaxed">
                  {form.description || 'Package description will appear here...'}
                </p>

                <div className="rounded-lg bg-surface dark:bg-[#0f172a] px-3 py-2 mb-4">
                  <span className="text-sm font-bold text-primary-dark dark:text-white">
                    {form.maxProperties === -1 ? 'Unlimited' : form.maxProperties}
                  </span>
                  <span className="text-xs text-muted"> properties</span>
                </div>

                {form.benefits.filter((b) => b.trim()).length > 0 && (
                  <ul className="space-y-2">
                    {form.benefits.filter((b) => b.trim()).map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted dark:text-gray-400">
                        <Check size={14} className="text-accent mt-0.5 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
