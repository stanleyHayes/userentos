import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
// import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useSubscriptionPackages, useMySubscription, useSubscribe, usePaymentMethods, useCancelPayment } from '@/hooks/useApi'
import { formatCurrency } from '@/lib/utils'
import { api } from '@/lib/api'
import { paymentInProgress } from '@/lib/actionFees'
import { Check, Clock3, Crown, Package, Building2, ArrowRight } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import toast from 'react-hot-toast'

// Fallback only: used while the server's list is in flight, and it
// deliberately omits bank_transfer — offering a rail that may not be
// configured is the bug this replaced — and Telecel, which waits for its
// voucher step (apps/api/src/services/payments/index.ts).
const FALLBACK_METHODS = [
  { id: 'mtn_momo', label: 'MTN Mobile Money' },
  { id: 'airteltigo_money', label: 'AirtelTigo Money' },
]


export function SubscriptionPage() {
  // Server-driven, so an unconfigured rail is never offered.
  const { data: methodsData } = usePaymentMethods()
  const serverMethods = Array.isArray(methodsData?.methods) ? methodsData.methods : null
  const payableMethods = serverMethods ?? FALLBACK_METHODS
  // The server answered and offers nothing: payments are not set up yet.
  const noMethods = serverMethods?.length === 0
  const { data: packagesData, isLoading: pkgLoading } = useSubscriptionPackages()
  const { data: sub, isLoading: subLoading, refetch } = useMySubscription()
  const subscribe = useSubscribe()

  const [payingPkg, setPayingPkg] = useState<string | null>(null)
  // The payer's pick, kept only while the server still offers it; otherwise the first method offered.
  const [chosenMethod, setPayMethod] = useState<string | null>(null)
  const payMethod = chosenMethod && payableMethods.some((m) => m.id === chosenMethod) ? chosenMethod : (payableMethods[0]?.id ?? 'mtn_momo')
  const [payPhone, setPayPhone] = useState('')
  const [pendingInstructions, setPendingInstructions] = useState<string | null>(null)
  // A payment for this plan already under way, or not confirmed yet. "Check again" only reads its
  // status: sending the checkout again could start a second charge. It can be cancelled only when
  // the server says so (never a Paystack charge: the prompt may still be approved).
  const [openPayment, setOpenPayment] = useState<{ id: string; message: string; cancellable?: boolean } | null>(null)
  const [checking, setChecking] = useState(false)
  const cancelPayment = useCancelPayment()

  const packages = packagesData?.items ?? []

  function handleSubscribe(packageId: string, price: number) {
    setOpenPayment(null)
    if (price > 0) {
      // Paid plan — collect mobile-money details first
      setPayingPkg(packageId)
      return
    }
    void completeSubscribe(packageId)
  }

  async function completeSubscribe(packageId: string, withPayment = false) {
    setOpenPayment(null)
    try {
      const res = await subscribe.mutateAsync(
        withPayment ? { packageId, method: payMethod, phone: payPhone } : { packageId },
      )
      if (res?.payment && res.payment.status !== 'completed') {
        // Payment under way: activation lands when the provider confirms it.
        setPendingInstructions(res.instructions ?? 'Approve the payment on your phone. Your plan activates once it is confirmed.')
        setPayingPkg(null)
        // Poll briefly for activation (simulator completes in ~2s)
        setTimeout(() => void refetch(), 3000)
        setTimeout(() => void refetch(), 7000)
      } else {
        // A free plan, or a payment already confirmed.
        setPayingPkg(null)
        void refetch()
        toast.success('Subscription activated!')
      }
    } catch (e) {
      const open = paymentInProgress(e)
      const failure = e as { code?: string; data?: { payment?: { id: string } } }
      if (open) {
        // Its own next step when it has one (a bank transfer's deposit details), otherwise the phone prompt.
        const instructions = (e as { data?: { instructions?: string } }).data?.instructions
        setOpenPayment({ id: open.id, message: `A payment for this plan is already in progress. ${instructions ?? 'Approve the prompt on your phone; your plan activates once it is confirmed.'}` })
        void checkPayment(open.id, true)
      } else if (failure?.code === 'PAYMENT_UNCONFIRMED' && failure.data?.payment?.id) {
        setOpenPayment({ id: failure.data.payment.id, message: e instanceof Error ? e.message : 'We could not confirm this payment yet.' })
        void checkPayment(failure.data.payment.id, true)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to subscribe')
      }
    }
  }

  /** Reads where the open payment stands; never starts another one. `quiet` keeps the current message. */
  async function checkPayment(asked = openPayment?.id, quiet = false) {
    if (!asked) return
    setChecking(true)
    try {
      const current = await api.get<{ status: string; payerCancellable?: boolean }>(`/payments/${asked}`)
      if (current.status === 'completed') {
        setOpenPayment(null)
        setPayingPkg(null)
        void refetch()
        toast.success('Subscription activated!')
      } else if (current.status === 'failed' || current.status === 'refunded') {
        // Nothing was charged: the form comes back for a fresh payment.
        setOpenPayment(null)
        toast('The earlier payment did not go through. Nothing was charged; you can pay again.')
      } else {
        setOpenPayment((open) => open && open.id === asked ? {
          ...open,
          cancellable: current.payerCancellable === true,
          ...(quiet ? {} : { message: 'Still waiting for confirmation. If you approved the payment, your plan activates on its own; check again in a few minutes.' }),
        } : open)
      }
    } catch (e) {
      if (!quiet) toast.error(e instanceof Error ? e.message : 'Could not check the payment')
    } finally {
      setChecking(false)
    }
  }

  /** Calls off a payment the server allows the payer to cancel (a bank transfer, never a Paystack charge). */
  async function cancelOpenPayment() {
    if (!openPayment) return
    try {
      await cancelPayment.mutateAsync(openPayment.id)
      setOpenPayment(null)
      toast.success('Payment cancelled. You can pay another way.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not cancel the payment')
    }
  }

  if (pkgLoading || subLoading) return <TableSkeleton />

  const currentPkgId = sub?.package?.id
  // A downgrade keeps existing listings ("degrade, never delete"), so usage can
  // exceed the limit, and an admin may set a limit of 0: never show >100%,
  // Infinity% or NaN%.
  const usedPct = sub && sub.maxProperties > 0 ? Math.min(100, Math.round((sub.propertyCount / sub.maxProperties) * 100)) : 100
  const overBy = sub && sub.maxProperties >= 0 ? Math.max(0, sub.propertyCount - sub.maxProperties) : 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Subscription Plans"
        description="Choose a plan that fits your property portfolio."
        icon={<Crown size={22} />}
      />

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
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-primary-dark dark:text-white">{overBy > 0 ? `${overBy} over limit` : `${usedPct}%`}</span>
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
      <Modal open={!!payingPkg} onClose={() => { setPayingPkg(null); setOpenPayment(null) }} title="Pay for subscription">
        <div className="space-y-4">
          {noMethods ? (
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
              <Clock3 size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Payments are not available yet</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800/75 dark:text-amber-200/70">You can upgrade as soon as RentOS turns on mobile money payments. Your current plan keeps working.</p>
              </div>
            </div>
          ) : openPayment ? (
            <div role="status" className="neumorphic-inset space-y-3 rounded-2xl p-4 text-sm text-primary-dark dark:text-gray-200">
              <p>{openPayment.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={checking || cancelPayment.isPending} onClick={() => void checkPayment()}>Check again</Button>
                {openPayment.cancellable && (
                  <Button size="sm" variant="outline" disabled={checking || cancelPayment.isPending} onClick={() => void cancelOpenPayment()}>Cancel this payment</Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <Select
                id="sub-pay-method"
                label="Payment method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                options={payableMethods.map((m) => ({ value: m.id, label: m.label }))}
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
            </>
          )}
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
