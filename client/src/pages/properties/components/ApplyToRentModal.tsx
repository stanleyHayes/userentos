import type { Dispatch, SetStateAction } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { formatCurrency } from '@/lib/utils'
import TextField from '@mui/material/TextField'
import { User, CreditCard, Phone, FileCheck, Heart, Clock, ShieldCheck, Check } from 'lucide-react'

interface ApplyToRentModalProps {
  open: boolean
  onClose: () => void
  propertyId: string | undefined
  title: string
  rentAmount: number
  sharedSections: string[]
  setSharedSections: Dispatch<SetStateAction<string[]>>
  moveIn: string
  setMoveIn: (value: string) => void
  duration: number
  setDuration: (value: number) => void
  rent: string
  setRent: (value: string) => void
  message: string
  setMessage: (value: string) => void
  onSubmit: (body: Record<string, unknown>) => void
  isPending: boolean
  isError: boolean
  errorMessage?: string
}

export function ApplyToRentModal({
  open, onClose, propertyId, title, rentAmount,
  sharedSections, setSharedSections,
  moveIn, setMoveIn,
  duration, setDuration,
  rent, setRent,
  message, setMessage,
  onSubmit, isPending, isError, errorMessage,
}: ApplyToRentModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Apply to Rent">
      <form
        data-testid="application-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit({
            propertyId,
            sharedSections,
            moveInDate: moveIn,
            duration,
            ...(message ? { message } : {}),
            ...(rent ? { offeredRent: Number(rent) } : {}),
          })
        }}
        className="flex flex-col gap-6"
      >
        <p className="text-xs text-muted dark:text-gray-400">
          Apply for <strong className="text-primary-dark dark:text-white">{title}</strong> at {formatCurrency(rentAmount)}/mo.
          Select which profile sections to share with the landlord.
        </p>

        <TextField
          label="Message to landlord (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Hi, I'm interested in "${title}".`}
          fullWidth
          multiline
          rows={3}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {/* Profile sections to share */}
        <div>
          <p className="text-xs font-semibold text-primary-dark dark:text-white mb-2.5">Share from your profile</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'personal', label: 'Personal Info', icon: <User size={14} /> },
              { key: 'professional', label: 'Employment', icon: <CreditCard size={14} /> },
              { key: 'references', label: 'References', icon: <Phone size={14} /> },
              { key: 'academic', label: 'Education', icon: <FileCheck size={14} /> },
              { key: 'family', label: 'Family & Occupants', icon: <User size={14} /> },
              { key: 'lifestyle', label: 'Lifestyle', icon: <Heart size={14} /> },
              { key: 'history', label: 'Rental History', icon: <Clock size={14} /> },
              { key: 'verification', label: 'Verification', icon: <ShieldCheck size={14} /> },
            ].map((s) => {
              const selected = sharedSections.includes(s.key)
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSharedSections((prev) =>
                    prev.includes(s.key) ? prev.filter((x) => x !== s.key) : [...prev, s.key]
                  )}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                    selected
                      ? 'border-primary dark:border-blue-500 bg-primary/5 dark:bg-blue-500/10 text-primary dark:text-blue-400'
                      : 'border-border/60 dark:border-[#252a3a]/60 text-muted dark:text-gray-400 hover:border-primary/40'
                  }`}
                >
                  {s.icon}
                  {s.label}
                  {selected && <Check size={12} className="ml-auto" />}
                </button>
              )
            })}
          </div>
          {sharedSections.length === 0 && (
            <p className="text-[10px] text-danger mt-1.5">Select at least one section</p>
          )}
        </div>

        <DatePicker
          label="Desired Move-in Date"
          value={moveIn}
          onChange={setMoveIn}
          required
          minDate={new Date().toISOString().slice(0, 10)}
        />

        <TextField
          label="Lease Duration"
          select
          fullWidth
          required
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          slotProps={{ inputLabel: { shrink: true }, select: { native: true } }}
        >
          <option value={6}>6 months</option>
          <option value={12}>12 months</option>
          <option value={18}>18 months</option>
          <option value={24}>24 months</option>
        </TextField>

        <TextField
          label="Offered Rent (optional)"
          type="number"
          fullWidth
          value={rent}
          onChange={(e) => setRent(e.target.value)}
          placeholder={String(rentAmount)}
          helperText="Leave blank to accept the listed rent amount"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {errorMessage}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" data-testid="application-submit" disabled={isPending}>
            {isPending ? 'Submitting...' : 'Submit Application'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
