import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useAllSubscriptionPackages, useDeleteSubscriptionPackage } from '@/hooks/useApi'
import { formatCurrency } from '@/lib/utils'
import { Plus, Edit2, Trash2, Package, Check, Users, Building2 } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import toast from 'react-hot-toast'

export function PackagesPage() {
  const { data, isLoading } = useAllSubscriptionPackages()
  const packages = data?.items ?? []
  const deletePkg = useDeleteSubscriptionPackage()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  async function handleDelete(id: string) {
    try {
      await deletePkg.mutateAsync(id)
      toast.success('Package deleted')
      setDeleteConfirm(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete package')
    }
  }

  if (isLoading) return <TableSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white">
            <Package size={20} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
              Subscription Packages
            </h1>
            <p className="text-xs text-muted dark:text-gray-400">Manage subscription tiers for landlords and property managers</p>
          </div>
        </div>
        <Link to="/admin/packages/new">
          <Button className="flex-shrink-0"><Plus size={16} /> New Package</Button>
        </Link>
      </div>

      {/* Stats strip */}
      {packages.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniKPI label="Total Packages" value={String(packages.length)} icon={<Package size={16} />} gradient="from-primary to-blue-600" />
          <MiniKPI label="Active" value={String(packages.filter((p) => p.isActive).length)} icon={<Check size={16} />} gradient="from-emerald-500 to-teal-500" />
          <MiniKPI label="Free Tier" value={String(packages.filter((p) => p.price === 0).length)} icon={<Users size={16} />} gradient="from-amber-500 to-orange-500" />
          <MiniKPI label="Paid Tiers" value={String(packages.filter((p) => p.price > 0).length)} icon={<Building2 size={16} />} gradient="from-violet-500 to-purple-500" />
        </div>
      )}

      {/* Package cards */}
      {packages.length === 0 ? (
        <EmptyState
          icon={<Package size={48} />}
          title="No packages yet"
          description="Create your first subscription package to get started."
          action={{ label: 'Create Package', href: '/admin/packages/new' }}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <Card key={pkg.id} className={`group relative overflow-hidden hover:shadow-lg dark:hover:shadow-black/30 hover:-translate-y-0.5 transition-all flex flex-col ${!pkg.isActive ? 'opacity-60' : ''}`}>
              <div className={`h-1.5 bg-gradient-to-r ${pkg.isDefault ? 'from-accent to-emerald-400' : 'from-primary to-blue-500'}`} />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{pkg.name}</CardTitle>
                    <p className="text-[10px] text-muted dark:text-gray-500 font-mono">{pkg.slug}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {pkg.isDefault && <Badge variant="success" className="text-[10px]">Default</Badge>}
                    {!pkg.isActive && <Badge variant="danger" className="text-[10px]">Inactive</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 space-y-4">
                <div>
                  <div className="text-3xl font-extrabold font-display text-primary-dark dark:text-white">
                    {pkg.price === 0 ? 'Free' : formatCurrency(pkg.price)}
                    {pkg.price > 0 && (
                      <span className="text-sm font-normal text-muted">/{pkg.billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted dark:text-gray-400 mt-1.5 leading-relaxed">{pkg.description}</p>
                </div>

                <div className="rounded-lg bg-surface dark:bg-[#0f172a] px-3 py-2">
                  <span className="text-sm font-bold text-primary-dark dark:text-white">
                    {pkg.maxProperties === -1 ? 'Unlimited' : pkg.maxProperties}
                  </span>
                  <span className="text-xs text-muted"> properties</span>
                </div>

                {pkg.benefits.length > 0 && (
                  <ul className="space-y-1.5">
                    {pkg.benefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted dark:text-gray-400">
                        <Check size={14} className="text-accent mt-0.5 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex-1" />
                <div className="flex gap-2 pt-3 border-t border-border/30 dark:border-[#252a3a]/30 mt-auto">
                  <Link to={`/admin/packages/edit/${pkg.id}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full">
                      <Edit2 size={14} /> Edit
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                    onClick={() => setDeleteConfirm(pkg.id)}
                  >
                    <Trash2 size={14} className="text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Package">
        <p className="text-sm text-muted mb-4">
          Are you sure you want to delete this package? This action cannot be undone.
          Active subscribers will need to be reassigned.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            disabled={deletePkg.isPending}
          >
            {deletePkg.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function MiniKPI({ label, value, icon, gradient }: { label: string; value: string; icon: React.ReactNode; gradient: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white flex-shrink-0`}>
            {icon}
          </div>
          <div>
            <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{value}</p>
            <p className="text-[10px] text-muted dark:text-gray-500">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
