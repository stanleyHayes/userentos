import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useCancelPayment } from '@/hooks/useApi'
import type { Payment } from '@/types'

/**
 * An unconfirmed bank transfer (or an interrupted payment) holds its rent
 * period, so a new payment for that period is refused until it settles. This
 * is the payer's way out: cancel it, then pay another way.
 */
export function CancelPaymentControl({ payment, onCancelled }: { payment: Payment; onCancelled: (payment: Payment) => void }) {
  const cancel = useCancelPayment()
  const [confirming, setConfirming] = useState(false)
  if (!payment.payerCancellable) return null
  return <section className="space-y-2 border-t border-border dark:border-[#252a3a] pt-4" aria-label="Cancel payment">
    {!confirming
      ? <Button variant="outline" className="w-full" onClick={() => setConfirming(true)}>Cancel this payment</Button>
      : <>
        <p className="text-sm text-primary-dark dark:text-gray-100">
          Only cancel if you have not sent this money. If a transfer you already made still arrives, it is matched to this payment and our team is alerted.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={cancel.isPending} onClick={() => setConfirming(false)}>Keep it</Button>
          <Button className="flex-1" disabled={cancel.isPending} onClick={() => cancel.mutate(payment.id, { onSuccess: (cancelled) => { setConfirming(false); onCancelled(cancelled) } })}>
            {cancel.isPending ? 'Cancelling…' : 'Yes, cancel it'}
          </Button>
        </div>
      </>}
    {cancel.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{cancel.error.message}</p>}
  </section>
}
