import { useRef, useState } from 'react'
import { CheckCircle2, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { api } from '@/lib/api'
import { usePaymentMethods } from '@/hooks/useApi'
import { paymentInProgress, type FeePayment } from '@/lib/actionFees'

const FALLBACK_METHODS = [
  { id: 'mtn_momo', label: 'MTN Mobile Money' },
  // Telecel waits for its voucher step (apps/api/src/services/payments/index.ts).
  { id: 'airteltigo_money', label: 'AirtelTigo Money' },
]
const POLL_MS = 2500
const GIVE_UP_AFTER_MS = 4 * 60 * 1000

type Stage = 'details' | 'waiting' | 'paid' | 'failed'

/**
 * Pays one GH₵5 action fee by mobile money: choose the network, approve the
 * prompt on the phone, and the modal waits for RentOS to confirm the payment
 * before calling onPaid. Closing it stops waiting, never the payment.
 */
export function FeeCheckoutModal({ open, onClose, endpoint, amount, title, children, onPaid }: {
  open: boolean
  onClose: () => void
  /** e.g. /agreements/<id>/signing-fee */
  endpoint: string
  amount: number
  title: string
  /** What the payment unlocks, in a sentence or two. */
  children: React.ReactNode
  onPaid: () => void
}) {
  const { data: methodsData } = usePaymentMethods()
  const methods = (methodsData?.methods ?? FALLBACK_METHODS).filter((m) => m.id !== 'bank_transfer')
  const [method, setMethod] = useState('mtn_momo')
  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState<Stage>('details')
  const [message, setMessage] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const waiting = useRef(0)

  function close() {
    waiting.current += 1
    setStage('details')
    setMessage(null)
    onClose()
  }

  async function waitFor(payment: FeePayment) {
    const run = ++waiting.current
    setStage('waiting')
    const started = Date.now()
    while (Date.now() - started < GIVE_UP_AFTER_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      if (waiting.current !== run) return
      const current = await api.get<FeePayment>(`/payments/${payment.id}`).catch(() => null)
      if (waiting.current !== run) return
      if (current?.status === 'completed') { setStage('paid'); onPaid(); return }
      if (current?.status === 'failed') { setStage('failed'); setMessage('The payment did not go through. Nothing was charged; you can try again.'); return }
    }
    setStage('failed')
    setMessage('We have not had confirmation yet. If you approved the payment, it will still count once it arrives; check again in a few minutes.')
  }

  async function pay() {
    setStarting(true)
    setMessage(null)
    try {
      const res = await api.post<{ payment: FeePayment; instructions?: string }>(endpoint, { method, phone: phone.trim() })
      setMessage(res.instructions ?? null)
      void waitFor(res.payment)
    } catch (err) {
      const open = paymentInProgress(err)
      if (open) { setMessage('Your earlier payment is still in progress.'); void waitFor(open) }
      else setMessage(err instanceof Error ? err.message : 'Could not start the payment')
    } finally {
      setStarting(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title={title}>
      {stage === 'paid' ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="neumorphic-icon grid h-14 w-14 place-items-center rounded-2xl text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={28} /></span>
          <p className="font-semibold text-primary-dark dark:text-white">Payment confirmed</p>
          <Button onClick={close}>Continue</Button>
        </div>
      ) : stage === 'waiting' ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="neumorphic-icon grid h-14 w-14 place-items-center rounded-2xl text-primary dark:text-cyan-300"><Smartphone size={26} /></span>
          <p className="font-semibold text-primary-dark dark:text-white">Approve GH₵{amount} on your phone</p>
          <p className="max-w-sm text-sm text-muted dark:text-gray-400">{message ?? 'Check your phone for the mobile money prompt and enter your PIN.'}</p>
          <p className="inline-flex items-center gap-2 text-xs text-muted"><Loader2 size={14} className="animate-spin" /> Waiting for confirmation…</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="neumorphic-inset rounded-2xl p-4 text-sm text-primary-dark dark:text-gray-200">
            <p className="font-display text-2xl font-extrabold">GH₵{amount}<span className="ml-1 text-sm font-semibold text-muted">one-time</span></p>
            <div className="mt-1 text-muted dark:text-gray-400">{children}</div>
          </div>
          <Select id="fee-method" label="Pay with" value={method} onChange={(e) => setMethod(e.target.value)} options={methods.map((m) => ({ value: m.id, label: m.label }))} />
          <Input id="fee-phone" label="Mobile money number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0241234567" inputMode="tel" />
          {message && <p className="text-sm text-danger">{message}</p>}
          <Button className="w-full" onClick={() => void pay()} disabled={starting || phone.trim().length < 9}>
            {starting ? <Loader2 size={16} className="animate-spin" /> : null} Pay GH₵{amount}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted"><ShieldCheck size={12} /> Paid to RentOS by mobile money. Viewing stays free.</p>
        </div>
      )}
    </Modal>
  )
}
