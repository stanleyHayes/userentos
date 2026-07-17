import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
// import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useSubscriptionPackages, useMySubscription, useSubscribe } from '@/hooks/useApi'
import { formatCurrency } from '@/lib/utils'
import { Check, Crown, Package, Building2, ArrowRight } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { DoodleStars } from '@/components/ui/Doodles'
import { IconWatermark } from '@/components/ui/Watermark'
import { EmptyState } from '@/components/ui/EmptyState'
import toast from 'react-hot-toast'

const PAYMENT_METHODS = [
  { value: 'mtn_momo', label: 'MTN Mobile Money' },
  { value: 'telecel_cash', label: 'Telecel Cash' },
  { value: 'airteltigo_money', label: 'AirtelTigo Money' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]

export function SubscriptionPage() {
  const { data: packagesData, isLoading: pkgLoading } = useSubscriptionPackages()
  const { data: sub, isLoading: subLoading, refetch } = useMySubscription()
  const subscribe = useSubscribe()

  const [payingPkg, setPayingPkg] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState('mtn_momo')
  const [payPhone, setPayPhone] = useState('')
  const [pendingInstructions, setPendingInstructions] = useState<string | null>(null)

  const packages = packagesData?.items ?? []

  function handleSubscribe(packageId: string, price: number) {
    if (price > 0) {
      // Paid plan — collect mobile-money details first
      setPayingPkg(packageId)
      return
    }
    void completeSubscribe(packageId)
  }

  async function completeSubscribe(packageId: string, withPayment = false) {
    try {
      const res = await subscribe.mutateAsync(
        withPayment ? { packageId, method: payMethod, phone: payPhone } : { packageId },
      )
      if (res?.instructions) {
        // Payment initiated — activation lands when the provider confirms.
        setPendingInstructions(res.instructions)
        setPayingPkg(null)
        // Poll briefly for activation (simulator completes in ~2s)
        setTimeout(() => void refetch(), 3000)
        setTimeout(() => void refetch(), 7000)
      } else {
        toast.success('Subscription activated!')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to subscribe')
    }
  }

  if (pkgLoading || subLoading) return <TableSkeleton />

  const currentPkgId = sub?.package?.id

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden">
        <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
        <IconWatermark icon={Crown} className="right-10 top-1/2 size-28 -translate-y-1/2 rotate-[-8deg]" />
        <h1 className="text-2xl font-bold text-primary-dark dark:text-white">Subscription Plans</h1>
        <p className="text-sm text-muted mt-1">Choose a plan that fits your property portfolio</p>
      </div>

      {/* Current Plan Summary */}
      {sub?.package && (
        <Card className="border-primary/30 dark:border-blue-500/30 bg-primary/5 dark:bg-primary/10">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 dark:bg-primary/25 flex items-center justify-center">
                  <Crown size={20} className="text-primary dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-primary-dark dark:text-white">Current Plan: {sub.package.name}</p>
                  <p className="text-xs text-muted">
                    {sub.propertyCount} of {sub.maxProperties === -1 ? 'unlimited' : sub.maxProperties} properties used
                    {sub.subscriptionEndDate && ` \u00B7 Renews ${new Date(sub.subscriptionEndDate).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              {sub.maxProperties !== -1 && (
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 rounded-full bg-white/50 dark:bg-[#0c0e1a] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all bg-primary dark:bg-blue-400"
                      style={{ width: `${Math.min(100, (sub.propertyCount / sub.maxProperties) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-primary-dark dark:text-white">{Math.round((sub.propertyCount / sub.maxProperties) * 100)}%</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Package Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => {
          const isCurrent = pkg.id === currentPkgId
          const isUpgrade = currentPkgId && !isCurrent && (pkg.maxProperties === -1 || pkg.maxProperties > (sub?.maxProperties ?? 0))

          return (
            <Card
              key={pkg.id}
              className={`relative overflow-hidden transition-all hover:shadow-lg ${isCurrent ? 'ring-2 ring-primary dark:ring-blue-500' : ''}`}
            >
              {isCurrent && (
                <div className="absolute top-0 right-0 bg-primary dark:bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                  Current Plan
                </div>
              )}
              {pkg.isDefault && !isCurrent && (
                <div className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                  Recommended
                </div>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pkg.price === 0 ? 'bg-gray-100 dark:bg-gray-800' : 'bg-primary/10 dark:bg-primary/20'}`}>
                    {pkg.price === 0 ? <Package size={20} className="text-gray-500" /> : <Crown size={20} className="text-primary dark:text-blue-400" />}
                  </div>
                  <CardTitle className="text-lg">{pkg.name}</CardTitle>
                </div>
                <div className="mb-2">
                  <span className="text-3xl font-extrabold text-primary-dark dark:text-white">
                    {pkg.price === 0 ? 'Free' : formatCurrency(pkg.price)}
                  </span>
                  {pkg.price > 0 && (
                    <span className="text-sm text-muted">/{pkg.billingCycle === 'yearly' ? 'year' : 'month'}</span>
                  )}
                </div>
                <p className="text-sm text-muted">{pkg.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-surface dark:bg-[#0c0e1a]">
                  <Building2 size={16} className="text-primary dark:text-blue-400" />
                  <span className="text-sm font-semibold text-primary-dark dark:text-white">
                    {pkg.maxProperties === -1 ? 'Unlimited' : pkg.maxProperties} Properties
                  </span>
                </div>

                {pkg.benefits.length > 0 && (
                  <ul className="space-y-2">
                    {pkg.benefits.map((b: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted">
                        <Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                <Button
                  className="w-full"
                  variant={isCurrent ? 'outline' : 'primary'}
                  disabled={isCurrent || subscribe.isPending}
                  onClick={() => handleSubscribe(pkg.id, pkg.price)}
                >
                  {isCurrent ? 'Current Plan' : isUpgrade ? (
                    <>Upgrade <ArrowRight size={14} /></>
                  ) : subscribe.isPending ? 'Subscribing...' : 'Select Plan'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {packages.length === 0 && (
        <EmptyState preset="general" title="No plans available" description="Subscription plans will appear here once published." />
      )}

      {/* Payment details modal for paid plans */}
      <Modal open={!!payingPkg} onClose={() => setPayingPkg(null)} title="Pay for subscription">
        <div className="space-y-4">
          <Select
            id="sub-pay-method"
            label="Payment method"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value)}
            options={PAYMENT_METHODS}
          />
          {payMethod !== 'bank_transfer' && (
            <Input
              id="sub-pay-phone"
              label="Mobile money number"
              value={payPhone}
              onChange={(e) => setPayPhone(e.target.value)}
              placeholder="0241234567"
              required
            />
          )}
          <Button
            className="w-full"
            disabled={subscribe.isPending || (payMethod !== 'bank_transfer' && payPhone.trim().length < 9)}
            onClick={() => payingPkg && void completeSubscribe(payingPkg, true)}
            
          >
            Pay & Subscribe
          </Button>
        </div>
      </Modal>

      {/* Provider instructions after initiating payment */}
      <Modal open={!!pendingInstructions} onClose={() => setPendingInstructions(null)} title="Complete your payment">
        <div className="space-y-4">
          <p className="text-sm text-muted">{pendingInstructions}</p>
          <p className="text-xs text-muted">Your plan activates automatically once the payment is confirmed.</p>
          <Button className="w-full" onClick={() => setPendingInstructions(null)}>Got it</Button>
        </div>
      </Modal>
    </div>
  )
}
