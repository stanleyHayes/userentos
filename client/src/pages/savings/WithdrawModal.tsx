import { useState } from 'react'
import { Link } from 'react-router-dom'
import TextField from '@mui/material/TextField'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { AlertCircle, Clock, Landmark } from 'lucide-react'
import { usePayoutAvailability, useRequestPayout } from '@/hooks/useApi'

interface WithdrawModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Requests a payout to the user's saved account. The money leaves the wallet
 * immediately (it is reserved against this request) and reaches their account
 * once an admin approves it, so the copy says so plainly rather than implying
 * an instant transfer.
 */
export function WithdrawModal({ open, onClose }: WithdrawModalProps) {
  const { data: availability, isLoading } = usePayoutAvailability()
  const requestPayout = useRequestPayout()
  const [amount, setAmount] = useState('')

  const balance = availability?.balance ?? 0
  const minimum = availability?.minimum ?? 10
  const value = Number(amount)
  const tooSmall = amount !== '' && value < minimum
  const tooBig = value > balance
  const canSubmit = amount !== '' && value > 0 && !tooSmall && !tooBig

  function submit() {
    requestPayout.mutate({ amount: value }, {
      onSuccess: () => {
        toast.success('Payout requested — you will be notified once it is sent')
        setAmount('')
        onClose()
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not request the payout'),
    })
  }

  function body() {
    if (isLoading) return <p className="text-sm text-muted dark:text-gray-400">Checking your balance…</p>

    if (!availability?.hasVerifiedAccount) {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-4 text-sm text-warning">
            <Landmark size={16} className="mt-0.5 flex-shrink-0" />
            <span>Add a payout account before withdrawing — we need somewhere to send the money.</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Link to="/settings?tab=payouts" onClick={onClose}>
              <Button>Add payout account</Button>
            </Link>
          </div>
        </div>
      )
    }

    if (availability.payoutInProgress) {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl bg-primary/10 p-4 text-sm text-primary dark:bg-blue-500/10 dark:text-blue-400">
            <Clock size={16} className="mt-0.5 flex-shrink-0" />
            <span>You already have a payout in progress. You can request another once it completes.</span>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-surface/60 p-4 dark:bg-white/[0.03]">
          <p className="text-xs text-muted dark:text-gray-400">Available to withdraw</p>
          <p className="text-2xl font-bold text-primary-dark dark:text-white">{formatCurrency(balance)}</p>
        </div>

        <TextField
          label="Amount (GHS)" type="number" size="small" fullWidth autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={tooSmall || tooBig}
          helperText={
            tooBig ? 'That is more than your balance'
              : tooSmall ? `The minimum payout is ${formatCurrency(minimum)}`
                : `Minimum ${formatCurrency(minimum)}`
          }
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minimum, max: balance, step: '0.01' } }}
        />

        <div className="flex items-start gap-2 text-xs text-muted dark:text-gray-400">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            The amount leaves your wallet now and is sent to your saved account once an admin approves it.
            If it cannot be delivered, it comes straight back.
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || requestPayout.isPending}>
            {requestPayout.isPending ? 'Requesting…' : 'Request payout'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Withdraw from wallet">
      {body()}
    </Modal>
  )
}
