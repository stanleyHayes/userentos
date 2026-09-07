import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Banknote, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  useSellerPaymentAccount, useMarketplaceBanks, useOnboardSellerPayments,
  useMarketplaceTransactions, useMyEntitlements,
} from '@/hooks/useApi'

/**
 * Seller payout onboarding (spec §8.1).
 *
 * The account is only "ready to receive" once the provider has accepted it,
 * so the status shown here reflects the provider, not the form.
 */
export function SellerPaymentsPage() {
  const { data: account, isLoading } = useSellerPaymentAccount()
  const { data: banksData, isError: banksFailed } = useMarketplaceBanks()
  const { data: txns } = useMarketplaceTransactions()
  const { data: entitlements } = useMyEntitlements()
  const onboard = useOnboardSellerPayments()

  const [form, setForm] = useState({ businessName: '', bankCode: '', accountNumber: '' })
  const banks = banksData?.items ?? []
  const feePercent = entitlements?.features['platform.fee_percent']

  const canSubmit = form.businessName.trim().length > 1 && form.bankCode && /^\d{6,20}$/.test(form.accountNumber)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Money"
        title="Payments & Payouts"
        description="Where your share of each marketplace payment is settled."
        meta={typeof feePercent === 'number' ? `Platform fee ${feePercent}%` : undefined}
        icon={<Banknote size={22} />}
      />

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : account?.readyToReceivePayments ? (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="font-semibold text-primary-dark dark:text-white">Ready to receive payments</p>
                <p className="mt-1 text-sm text-muted dark:text-gray-400">
                  {account.businessName} · {account.bankName} · {account.accountNumberMasked}
                </p>
                {account.accountNameResolved && (
                  <p className="text-xs text-muted dark:text-gray-500">
                    Verified as {account.accountNameResolved}
                  </p>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setForm({ businessName: account.businessName, bankCode: '', accountNumber: '' })}>
              Change payout account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="font-bold text-primary-dark dark:text-white">Set up payouts</h2>
              <p className="mt-1 text-sm text-muted dark:text-gray-400">
                We create a settlement account with our payment provider so your share of each
                payment reaches you directly.
              </p>
            </div>

            {account?.failureReason && (
              <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {account.failureReason}
              </div>
            )}
            {banksFailed && (
              <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                The bank list could not be loaded. Payments are not configured on this environment yet.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Business or legal name" size="small" value={form.businessName}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                select label="Settlement bank" size="small" value={form.bankCode}
                onChange={(e) => setForm((f) => ({ ...f, bankCode: e.target.value }))}
                disabled={banks.length === 0}
                slotProps={{ inputLabel: { shrink: true } }}
              >
                {banks.map((b) => <MenuItem key={b.code} value={b.code}>{b.name}</MenuItem>)}
              </TextField>
              <TextField
                label="Account number" size="small" value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric' } }}
              />
            </div>

            <Button
              disabled={!canSubmit || onboard.isPending}
              onClick={() => {
                const bank = banks.find((b) => b.code === form.bankCode)
                onboard.mutate(
                  { ...form, bankName: bank?.name ?? form.bankCode },
                  {
                    onSuccess: () => toast.success('Payouts are set up'),
                    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not set up payouts'),
                  },
                )
              }}
            >
              {onboard.isPending ? 'Setting up…' : 'Set up payouts'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 font-bold text-primary-dark dark:text-white">Recent payments</h2>
        {!txns || txns.items.length === 0 ? (
          <EmptyState preset="payments" title="No payments yet" description="Marketplace payments to you will appear here with the fee breakdown." compact />
        ) : (
          <div className="space-y-2">
            {txns.items.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-primary-dark dark:text-white">{formatCurrency(t.grossAmount)}</p>
                    <p className="text-xs text-muted dark:text-gray-500">
                      {t.reference} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted dark:text-gray-400">
                      You receive {formatCurrency(t.sellerExpectedAmount)}
                    </p>
                    <p className="text-xs text-muted dark:text-gray-500">
                      Platform fee {t.platformFeePercent}% ({formatCurrency(t.platformFeeAmount)})
                    </p>
                  </div>
                  <Badge variant={t.status === 'paid' ? 'success' : t.status === 'failed' ? 'danger' : 'warning'}>
                    {t.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
