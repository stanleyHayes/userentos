import { useMemo, useState } from 'react'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import toast from 'react-hot-toast'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { CheckCircle2, Landmark, Smartphone, Trash2, AlertCircle } from 'lucide-react'
import {
  usePayoutAccount, usePayoutDestinations, useSavePayoutAccount, useRemovePayoutAccount,
} from '@/hooks/useApi'

/**
 * Where the user's money goes when they withdraw. Nothing can be paid out
 * without this, so it is the first thing a landlord needs after their first
 * rent payment lands.
 */
export function PayoutTab() {
  const { data: account, isLoading } = usePayoutAccount()
  const { data: destinationData, isLoading: loadingDestinations, isError: destinationsFailed } = usePayoutDestinations()
  const saveAccount = useSavePayoutAccount()
  const removeAccount = useRemovePayoutAccount()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ type: 'mobile_money', bankCode: '', accountNumber: '', accountName: '' })

  const options = useMemo(
    () => (destinationData?.items ?? []).filter((d) => d.type === form.type),
    [destinationData?.items, form.type],
  )

  const canSave = Boolean(form.bankCode && form.accountNumber.trim().length >= 6 && form.accountName.trim().length >= 2)

  function save() {
    saveAccount.mutate(
      { type: form.type, bankCode: form.bankCode, accountNumber: form.accountNumber.trim(), accountName: form.accountName.trim() },
      {
        onSuccess: (saved) => {
          toast.success(`Verified as ${saved.accountName}`)
          setEditing(false)
        },
        // The server returns 422 when the provider cannot resolve the account,
        // which is the common case — a wrong digit or the wrong network.
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not verify that account'),
      },
    )
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5">
          <div>
            <h2 className="text-base font-bold text-primary-dark dark:text-white">Payout account</h2>
            <p className="mt-1 text-xs text-muted dark:text-gray-500">
              Where your withdrawals are sent. Rent you receive lands in your RentOS wallet first, then you withdraw it here.
            </p>
          </div>

          {account && !editing ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-2xl bg-surface/60 p-4 dark:bg-white/[0.03]">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400">
                    {account.type === 'mobile_money' ? <Smartphone size={18} /> : <Landmark size={18} />}
                  </span>
                  <div>
                    <p className="font-semibold text-primary-dark dark:text-white">{account.accountName}</p>
                    <p className="text-sm text-muted dark:text-gray-400">
                      {account.bankName} · {account.accountNumber}
                    </p>
                    {account.verified && (
                      <Badge variant="success" className="mt-2">
                        <CheckCircle2 size={12} /> Verified
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => {
                  setForm({
                    type: account.type,
                    bankCode: account.bankCode,
                    accountNumber: account.accountNumber,
                    accountName: account.accountName,
                  })
                  setEditing(true)
                }}>
                  Change account
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!confirm('Remove this payout account? You will not be able to withdraw until you add another.')) return
                    removeAccount.mutate(undefined, {
                      onSuccess: () => toast.success('Payout account removed'),
                      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not remove it'),
                    })
                  }}
                  disabled={removeAccount.isPending}
                >
                  <Trash2 size={14} /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {destinationsFailed && (
                <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  The list of networks and banks could not be loaded. Try again shortly.
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  select label="Payout to" size="small" value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, bankCode: '' }))}
                  slotProps={{ inputLabel: { shrink: true } }}
                >
                  <MenuItem value="mobile_money">Mobile money</MenuItem>
                  <MenuItem value="ghipss">Bank account</MenuItem>
                </TextField>

                <TextField
                  select label={form.type === 'mobile_money' ? 'Network' : 'Bank'} size="small"
                  value={form.bankCode}
                  onChange={(e) => setForm((f) => ({ ...f, bankCode: e.target.value }))}
                  disabled={loadingDestinations || options.length === 0}
                  helperText={loadingDestinations ? 'Loading…' : ' '}
                  slotProps={{ inputLabel: { shrink: true } }}
                >
                  {options.map((d) => (
                    <MenuItem key={d.code} value={d.code}>{d.name}</MenuItem>
                  ))}
                </TextField>

                <TextField
                  label={form.type === 'mobile_money' ? 'Mobile money number' : 'Account number'}
                  size="small" value={form.accountNumber}
                  onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                  placeholder={form.type === 'mobile_money' ? '024 123 4567' : '0123456789'}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric' } }}
                />

                <TextField
                  label="Account name" size="small" value={form.accountName}
                  onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                  placeholder="As registered with your provider"
                  helperText="We confirm this with your provider before saving"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={save} disabled={!canSave || saveAccount.isPending}>
                  {saveAccount.isPending ? 'Verifying…' : 'Verify and save'}
                </Button>
                {account && (
                  <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
