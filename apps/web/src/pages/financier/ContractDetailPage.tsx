import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import {
  useFinancingContract, useSignFinancingContract, useDisburseFinancingContract, useRepayFinancingContract,
} from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Send, FileSignature, CreditCard, ArrowLeft } from 'lucide-react'
import { DetailSkeleton } from '@/components/ui/Skeleton'

export function FinancingContractDetailPage() {
  const { id = '' } = useParams()
  const { data: contract } = useFinancingContract(id)
  const sign = useSignFinancingContract()
  const disburse = useDisburseFinancingContract()
  const repay = useRepayFinancingContract()
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)
  const [signature, setSignature] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [settlementReference, setSettlementReference] = useState('')
  const [repayAmount, setRepayAmount] = useState<string>('')

  if (!contract) {
    return <DetailSkeleton />
  }

  const isApplicant = contract.applicantId === user?.id
  const isFinancier = contract.financierId === user?.id
  const canSign = isApplicant && contract.status === 'pending_disbursement' && !contract.signedByApplicant
  const canDisburse = isFinancier && contract.status === 'pending_disbursement' && contract.signedByApplicant
  const canRepay = isApplicant && ['active', 'in_grace', 'in_arrears'].includes(contract.status)

  return (
    <div className="space-y-4 max-w-4xl">
      <Link to="/financing/contracts" className="inline-flex items-center gap-1.5 text-sm text-muted dark:text-gray-500 hover:text-primary dark:hover:text-blue-400">
        <ArrowLeft size={14} /> Back to contracts
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Contract {contract.id.slice(-6).toUpperCase()}</CardTitle>
              <p className="text-xs text-muted dark:text-gray-500 capitalize mt-1">{contract.productType.replace('_', ' ')} · {contract.tenureMonths} months · {contract.annualInterestRate}% APR</p>
            </div>
            <Badge variant="default" className="text-[10px] capitalize">{contract.status.replace('_', ' ')}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Principal" value={formatCurrency(contract.principal)} />
            <Metric label="Monthly payment" value={formatCurrency(contract.monthlyPayment)} />
            <Metric label="Total repayable" value={formatCurrency(contract.totalRepayable)} />
            <Metric label="Repaid" value={formatCurrency(contract.amountRepaid)} />
          </div>
        </CardContent>
      </Card>

      {canSign && (
        <Card>
          <CardHeader><CardTitle>Sign Contract</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md bg-surface dark:bg-[#0c0e1a] p-3 text-xs space-y-0.5">
              <p>Principal <strong>{formatCurrency(contract.principal)}</strong> · processing fee <strong>{formatCurrency(contract.processingFee)}</strong> · you receive <strong>{formatCurrency(contract.principal - contract.processingFee)}</strong></p>
              <p>Interest <strong>{contract.annualInterestRate}% a year</strong>{contract.apr != null ? <> · APR including fees <strong>{contract.apr}%</strong></> : null}</p>
              <p>Total repayable <strong>{formatCurrency(contract.totalRepayable)}</strong> · total cost of credit <strong>{formatCurrency(contract.totalRepayable - (contract.principal - contract.processingFee))}</strong></p>
            </div>
            <p className="text-xs text-muted dark:text-gray-400">By signing, you authorize the financier to disburse funds and you agree to repay according to the schedule below. Your typed name, the time, and a fingerprint of these exact terms are kept as your signature record.</p>
            <Input id="contract-signature" label="Type your full name to sign" value={signature} onChange={(e) => setSignature(e.target.value)} />
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span className="text-primary-dark dark:text-white">I have read the terms, APR and repayment schedule and accept them</span>
            </label>
            <div className="flex justify-end">
              <Button disabled={signature.trim().length < 3 || !accepted || sign.isPending} onClick={() => sign.mutate({ id: contract.id, signature }, {
                onSuccess: () => addToast('Contract signed', 'success'),
                onError: (e) => addToast((e as Error).message, 'error'),
              })}>
                <FileSignature size={14} /> Sign Contract
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canDisburse && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-primary-dark dark:text-white">Ready to disburse</p>
                <p className="text-xs text-muted dark:text-gray-500">Net of processing fee: {formatCurrency(contract.principal - contract.processingFee)} — debited from your wallet unless you enter the reference of funds you already sent to the platform.</p>
                <Input id="settlement-ref" label="External settlement reference (optional)" value={settlementReference} onChange={(e) => setSettlementReference(e.target.value)} />
              </div>
              <Button onClick={() => disburse.mutate({ id: contract.id, settlementReference: settlementReference.trim() || undefined }, {
                onSuccess: () => addToast('Disbursed', 'success'),
                onError: (e) => addToast((e as Error).message, 'error'),
              })} disabled={disburse.isPending}>
                <Send size={14} /> Disburse Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canRepay && (
        <Card>
          <CardHeader><CardTitle>Make a Repayment</CardTitle></CardHeader>
          <CardContent className="flex items-end gap-3">
            <Input id="repay-amt" type="number" label="Amount (GHS)" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} className="flex-1" />
            <Button disabled={Number(repayAmount) <= 0 || repay.isPending} onClick={() => repay.mutate({ id: contract.id, amount: Number(repayAmount) }, {
              onSuccess: () => { addToast('Repayment applied', 'success'); setRepayAmount('') },
              onError: (e) => addToast((e as Error).message, 'error'),
            })}>
              <CreditCard size={14} /> Pay
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Repayment Schedule</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted dark:text-gray-500 border-b border-border/40 dark:border-[#252a3a]/40">
                  <th className="py-2 font-semibold">#</th>
                  <th className="py-2 font-semibold">Due Date</th>
                  <th className="py-2 font-semibold text-right">Principal</th>
                  <th className="py-2 font-semibold text-right">Interest</th>
                  <th className="py-2 font-semibold text-right">Amount Due</th>
                  <th className="py-2 font-semibold text-right">Paid</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {contract.schedule.map((s) => (
                  <tr key={s.installmentNumber} className="border-b border-border/20 dark:border-[#252a3a]/20">
                    <td className="py-2 font-bold text-primary-dark dark:text-white">{s.installmentNumber}</td>
                    <td className="py-2 text-muted dark:text-gray-400">{formatDate(s.dueDate).split(',')[0]}</td>
                    <td className="py-2 text-right text-primary-dark dark:text-gray-300">{formatCurrency(s.principal)}</td>
                    <td className="py-2 text-right text-muted dark:text-gray-500">{formatCurrency(s.interest)}</td>
                    <td className="py-2 text-right font-semibold text-primary-dark dark:text-white">{formatCurrency(s.amountDue)}</td>
                    <td className="py-2 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(s.amountPaid)}</td>
                    <td className="py-2">
                      <Badge variant={s.status === 'paid' ? 'success' : s.status === 'overdue' ? 'danger' : s.status === 'partial' ? 'warning' : 'muted'} className="text-[9px] capitalize">{s.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted dark:text-gray-500">{label}</p>
      <p className="text-base font-extrabold font-display text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}
