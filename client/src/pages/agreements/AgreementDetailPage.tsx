import { useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import TextField from '@mui/material/TextField'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useAgreements, useSignAgreement, useUpdateAgreement, useMoveOuts } from '@/hooks/useApi'
import { accentFromColorClass, formatCurrency, formatDate } from '@/lib/utils'
import { DatePicker } from '@/components/ui/DatePicker'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import type { AgreementStatus } from '@/types'
import {
  ArrowLeft, FileText, CheckCircle, AlertTriangle, PenTool, Shield,
  Calendar, Building2, CreditCard, Clock, User, Edit2, XCircle,
  Download, LogOut,
} from 'lucide-react'

const statusVariant: Record<AgreementStatus, 'muted' | 'warning' | 'success' | 'danger'> = {
  draft: 'muted',
  pending_signatures: 'warning',
  active: 'success',
  expired: 'danger',
  terminated: 'danger',
  disputed: 'danger',
}

const statusColor: Record<AgreementStatus, string> = {
  draft: 'from-gray-400 to-gray-500',
  pending_signatures: 'from-amber-500 to-orange-500',
  active: 'from-emerald-500 to-teal-500',
  expired: 'from-red-500 to-rose-500',
  terminated: 'from-red-600 to-red-700',
  disputed: 'from-red-500 to-orange-500',
}

export function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { data, isLoading } = useAgreements()
  const { data: moveOutsData } = useMoveOuts()
  const signAgreement = useSignAgreement()
  const updateAgreement = useUpdateAgreement()

  const agreement = data?.items?.find((a) => a.id === id)
  const existingMoveOut = moveOutsData?.items?.find((m) => m.agreementId === id)

  const [isEditing, setIsEditing] = useState(false)
  const [showSignModal, setShowSignModal] = useState(false)
  const [signatureName, setSignatureName] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [editForm, setEditForm] = useState({
    rentAmount: '',
    securityDeposit: '',
    advanceMonths: '',
    startDate: '',
    endDate: '',
    terms: '',
    specialConditions: '',
  })

  if (isLoading) return <DetailSkeleton />

  if (!agreement) {
    return <EmptyState preset="agreements" title="Agreement not found" description="This agreement doesn't exist or you don't have access." action={{ label: 'Back to Agreements', href: '/agreements' }} />
  }

  const canSign = (
    (user?.id === agreement.landlordId && !agreement.landlordSignature) ||
    (user?.id === agreement.tenantId && !agreement.tenantSignature)
  ) && (agreement.status === 'draft' || agreement.status === 'pending_signatures')

  const canEdit = user?.id === agreement.landlordId && agreement.status === 'draft'

  const months = agreement.startDate && agreement.endDate
    ? Math.max(1, Math.round((new Date(agreement.endDate).getTime() - new Date(agreement.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : null

  const isParty = user?.id === agreement.tenantId || user?.id === agreement.landlordId
  const canDownloadPdf = isParty && agreement.status === 'active'

  // Begin move-out eligibility: within 30 days of endDate OR already past endDate,
  // and no MoveOut row yet.
  const endTs = agreement.endDate ? new Date(agreement.endDate).getTime() : NaN
  const daysUntilEnd = Number.isFinite(endTs)
    // eslint-disable-next-line react-hooks/purity -- Date.now() is intentional here: countdown to lease end is naturally time-dependent and unstable across renders is the desired behavior (refresh shows updated days).
    ? Math.ceil((endTs - Date.now()) / (1000 * 60 * 60 * 24))
    : Infinity
  const canBeginMoveOut =
    isParty &&
    !existingMoveOut &&
    Number.isFinite(endTs) &&
    daysUntilEnd <= 30

  const apiBase = import.meta.env.VITE_API_URL || '/api'

  // Mint a short-lived, download-only token and open the PDF with it — the full
  // session JWT must never appear in a URL (logs, browser history, referers).
  async function handleDownloadPdf() {
    if (!agreement) return
    setDownloadingPdf(true)
    try {
      const { token: downloadToken } = await api.post<{ token: string }>(`/agreements/${agreement.id}/document-link`, {})
      window.open(`${apiBase}/agreements/${agreement.id}/document.pdf?token=${encodeURIComponent(downloadToken)}`, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloadingPdf(false)
    }
  }

  function startEditing() {
    setEditForm({
      rentAmount: String(agreement!.rentAmount),
      securityDeposit: String(agreement!.securityDeposit),
      advanceMonths: String(agreement!.advanceMonths),
      startDate: agreement!.startDate?.slice(0, 10) ?? '',
      endDate: agreement!.endDate?.slice(0, 10) ?? '',
      terms: agreement!.terms.join('\n'),
      specialConditions: agreement!.specialConditions.join('\n'),
    })
    setIsEditing(true)
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault()
    try {
      await updateAgreement.mutateAsync({
        id: agreement!.id,
        rentAmount: Number(editForm.rentAmount),
        securityDeposit: Number(editForm.securityDeposit),
        advanceMonths: Number(editForm.advanceMonths),
        startDate: editForm.startDate,
        endDate: editForm.endDate,
        terms: editForm.terms.split('\n').filter(Boolean),
        specialConditions: editForm.specialConditions.split('\n').filter(Boolean),
      })
      setIsEditing(false)
    } catch {
      // Error is displayed via mutation.isError
    }
  }

  async function handleSign() {
    try {
      await signAgreement.mutateAsync({ id: agreement!.id, signatureName: signatureName.trim() })
      setShowSignModal(false)
      setSignatureName('')
    } catch {
      // Error is displayed via mutation.isError
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/agreements')} className="text-muted hover:text-primary-dark dark:hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${statusColor[agreement.status]} flex items-center justify-center text-white`}>
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
                  Agreement #{agreement.id.slice(0, 8)}
                </h1>
                {agreement.version > 1 && (
                  <span className="text-[10px] text-muted bg-surface dark:bg-[#1e293b] px-1.5 py-0.5 rounded">v{agreement.version}</span>
                )}
              </div>
              <p className="text-xs text-muted dark:text-gray-400">
                Created {formatDate(agreement.createdAt ?? agreement.startDate)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canDownloadPdf && (
            <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf}>
              <Download size={14} /> Download Signed Agreement PDF
            </Button>
          )}
          {existingMoveOut && (
            <Link to={`/agreements/${agreement.id}/move-out`}>
              <Button variant="outline" size="sm">
                <LogOut size={14} /> View Move-out
              </Button>
            </Link>
          )}
          {canEdit && !isEditing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Edit2 size={14} /> Edit
            </Button>
          )}
          {(() => {
            const userHasSigned =
              (user?.id === agreement.tenantId && !!agreement.tenantSignature) ||
              (user?.id === agreement.landlordId && !!agreement.landlordSignature)
            const showSignedBadge = userHasSigned || agreement.status === 'active'
            return (
              <Badge
                variant={statusVariant[agreement.status]}
                className="text-xs px-3 py-1"
                {...(showSignedBadge ? { 'data-testid': 'agreement-signed-badge' } : {})}
              >
                {agreement.status.replace(/_/g, ' ')}
              </Badge>
            )
          })()}
        </div>
      </div>

      {/* Begin move-out banner */}
      {canBeginMoveOut && (
        <div className="rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <LogOut size={20} className="text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-primary-dark dark:text-white">
                {daysUntilEnd <= 0 ? 'Lease has ended' : `Lease ends in ${daysUntilEnd} days`}
              </p>
              <p className="text-xs text-muted dark:text-gray-400">
                Begin the move-out workflow to track inspection and security deposit refund
              </p>
            </div>
          </div>
          <Link to={`/agreements/${agreement.id}/move-out`}>
            <Button>
              Begin Move-out
            </Button>
          </Link>
        </div>
      )}

      {/* Sign banner */}
      {canSign && (
        <div className="rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PenTool size={20} className="text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-primary-dark dark:text-white">Signature Required</p>
              <p className="text-xs text-muted dark:text-gray-400">Review the details below and sign to activate this agreement</p>
            </div>
          </div>
          <Button
            data-testid="agreement-sign-button"
            onClick={() => setShowSignModal(true)}
            disabled={signAgreement.isPending}
          >
            {signAgreement.isPending ? 'Signing...' : 'Sign Agreement'}
          </Button>
        </div>
      )}

      {/* Signature modal */}
      <Modal open={showSignModal} onClose={() => setShowSignModal(false)} title="Sign Agreement">
        <div className="flex flex-col gap-5">
          <p className="text-xs text-muted dark:text-gray-400">
            Type your full legal name below to sign this agreement. Your typed name will be recorded
            as your electronic signature.
          </p>
          <div data-testid="signature-pad">
            <TextField
              label="Your full name"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              placeholder="Full legal name"
              fullWidth
              autoFocus
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </div>
          {signAgreement.isError && (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              {(signAgreement.error as Error).message}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowSignModal(false)}>Cancel</Button>
            <Button
              data-testid="signature-confirm"
              onClick={handleSign}
              disabled={signatureName.trim().length === 0 || signAgreement.isPending}
            >
              {signAgreement.isPending ? 'Signing...' : 'Confirm & Sign'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InfoCard icon={<CreditCard size={16} />} label="Monthly Rent" value={formatCurrency(agreement.rentAmount)} color="text-primary dark:text-blue-400" />
        <InfoCard icon={<Shield size={16} />} label="Security Deposit" value={formatCurrency(agreement.securityDeposit)} color="text-violet-500" />
        <InfoCard icon={<Calendar size={16} />} label="Duration" value={months ? `${months} month${months !== 1 ? 's' : ''}` : 'TBD'} color="text-emerald-500" />
        <InfoCard icon={<Clock size={16} />} label="Advance" value={`${agreement.advanceMonths} month${agreement.advanceMonths !== 1 ? 's' : ''}`} color="text-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dates */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Calendar size={16} className="text-primary dark:text-blue-400" />Contract Period</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-surface/50 dark:bg-[#0f172a]/40 border border-border/30 dark:border-[#334155]/30 p-4">
                  <p className="text-[10px] text-muted dark:text-gray-500 uppercase tracking-wider mb-1">Start Date</p>
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">
                    {agreement.startDate ? formatDate(agreement.startDate) : 'To be determined'}
                  </p>
                </div>
                <div className="rounded-xl bg-surface/50 dark:bg-[#0f172a]/40 border border-border/30 dark:border-[#334155]/30 p-4">
                  <p className="text-[10px] text-muted dark:text-gray-500 uppercase tracking-wider mb-1">End Date</p>
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">
                    {agreement.endDate ? formatDate(agreement.endDate) : 'To be determined'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parties */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><User size={16} className="text-emerald-500" />Parties</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-surface/50 dark:bg-[#0f172a]/40 border border-border/30 dark:border-[#334155]/30 p-4">
                  <p className="text-[10px] text-muted dark:text-gray-500 uppercase tracking-wider mb-1">Landlord</p>
                  <p className="text-xs font-mono text-primary-dark dark:text-white truncate">{agreement.landlordId}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <CheckCircle size={14} className={agreement.landlordSignature ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-600'} />
                    <span className="text-[11px] text-muted">{agreement.landlordSignature ? 'Signed' : 'Pending'}</span>
                  </div>
                </div>
                <div className="rounded-xl bg-surface/50 dark:bg-[#0f172a]/40 border border-border/30 dark:border-[#334155]/30 p-4">
                  <p className="text-[10px] text-muted dark:text-gray-500 uppercase tracking-wider mb-1">Tenant</p>
                  <p className="text-xs font-mono text-primary-dark dark:text-white truncate">{agreement.tenantId}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <CheckCircle size={14} className={agreement.tenantSignature ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-600'} />
                    <span className="text-[11px] text-muted">{agreement.tenantSignature ? 'Signed' : 'Pending'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Terms */}
          {agreement.terms.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileText size={16} className="text-blue-500" />Terms & Conditions</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {agreement.terms.map((t, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400 text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Special Conditions */}
          {agreement.specialConditions?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle size={16} className="text-amber-500" />Special Conditions</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {agreement.specialConditions.map((c, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Edit form */}
          {isEditing && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Edit2 size={16} className="text-primary dark:text-blue-400" />Edit Agreement</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input id="edit-rent" label="Rent (GHS/mo)" type="number" value={editForm.rentAmount} onChange={(e) => setEditForm((f) => ({ ...f, rentAmount: e.target.value }))} required />
                    <Input id="edit-deposit" label="Deposit (GHS)" type="number" value={editForm.securityDeposit} onChange={(e) => setEditForm((f) => ({ ...f, securityDeposit: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DatePicker label="Start Date" value={editForm.startDate} onChange={(v) => setEditForm((f) => ({ ...f, startDate: v }))} />
                    <DatePicker label="End Date" value={editForm.endDate} onChange={(v) => setEditForm((f) => ({ ...f, endDate: v }))} />
                  </div>
                  <Input id="edit-advance" label="Advance (months)" type="number" value={editForm.advanceMonths} onChange={(e) => setEditForm((f) => ({ ...f, advanceMonths: e.target.value }))} min="0" max="6" />
                  <Textarea id="edit-terms" label="Terms (one per line)" value={editForm.terms} onChange={(e) => setEditForm((f) => ({ ...f, terms: e.target.value }))} rows={4} />
                  <Textarea id="edit-conditions" label="Special Conditions (one per line)" value={editForm.specialConditions} onChange={(e) => setEditForm((f) => ({ ...f, specialConditions: e.target.value }))} rows={3} />
                  {updateAgreement.isError && (
                    <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-sm text-danger">{(updateAgreement.error as Error).message}</div>
                  )}
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                    <Button type="submit" disabled={updateAgreement.isPending}>
                      {updateAgreement.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Property */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Building2 size={16} className="text-blue-500" />Property</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs font-mono text-primary-dark dark:text-white break-all">{agreement.propertyId}</p>
              <Link to={`/properties/${agreement.propertyId}`} className="inline-block mt-2">
                <Button variant="outline" size="sm" className="text-xs">View Property</Button>
              </Link>
            </CardContent>
          </Card>

          {/* Signatures */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><PenTool size={16} className="text-emerald-500" />Signatures</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Landlord</span>
                {agreement.landlordSignature ? (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={14} className="text-emerald-500" />
                    <span className="text-xs text-emerald-500 font-medium">Signed</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <XCircle size={14} className="text-gray-400" />
                    <span className="text-xs text-muted">Pending</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Tenant</span>
                {agreement.tenantSignature ? (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={14} className="text-emerald-500" />
                    <span className="text-xs text-emerald-500 font-medium">Signed</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <XCircle size={14} className="text-gray-400" />
                    <span className="text-xs text-muted">Pending</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Compliance */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Shield size={16} className="text-violet-500" />Compliance</CardTitle></CardHeader>
            <CardContent>
              {agreement.complianceFlags.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-emerald-500">
                  <CheckCircle size={14} />
                  <span className="font-medium">All clear — no flags</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {agreement.complianceFlags.map((flag, i) => (
                    <div key={i} className={`rounded-lg p-3 text-xs ${flag.type === 'violation' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-amber-700 dark:text-amber-400'}`}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium">{flag.message}</p>
                          {flag.law && <p className="opacity-70 mt-0.5">Ref: {flag.law}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status info */}
          {agreement.status === 'expired' && (
            <Card>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Clock size={14} />
                  <span>This agreement has expired.</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <DashboardMetricCard
      label={label}
      value={value}
      icon={icon}
      accent={accentFromColorClass(color)}
    />
  )
}
