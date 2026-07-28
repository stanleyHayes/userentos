import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { GridSkeleton, ListSkeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { usePayrollRuns } from '@/hooks/useApi'
import { useDeductionsReport, usePayrollRunReport, downloadPayrollRunCsv } from '@/hooks/useEmployerReports'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { PayrollDeductionStatus, PayrollRun } from '@/types'
import { BarChart3, Banknote, Users, Calendar, Download, AlertTriangle } from 'lucide-react'

const MONTH_OPTIONS = [3, 6, 12] as const

const TYPE_LABELS: Record<string, string> = {
  rent: 'Rent',
  savings: 'Savings',
  loan_repayment: 'Loan repayment',
  wallet_topup: 'Wallet top-up',
}

function typeLabel(type: string) {
  return TYPE_LABELS[type] ?? type.replace(/_/g, ' ')
}

function runStatusVariant(status: PayrollRun['status']) {
  if (status === 'processed') return 'success' as const
  if (status === 'failed') return 'danger' as const
  if (status === 'cancelled') return 'muted' as const
  return 'default' as const
}

function lineStatusVariant(status: PayrollDeductionStatus) {
  if (status === 'disbursed') return 'success' as const
  if (status === 'failed') return 'danger' as const
  if (status === 'skipped') return 'muted' as const
  return 'warning' as const
}

export function PayrollReportsPage() {
  const [months, setMonths] = useState<number>(6)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const { data: deductionsData, isLoading: deductionsLoading } = useDeductionsReport(months)
  const { data: runsData, isLoading: runsLoading } = usePayrollRuns()
  const { data: report, isLoading: reportLoading } = usePayrollRunReport(selectedRunId)

  const runs = runsData?.items ?? []
  const employees = deductionsData?.employees ?? []

  const handleExport = async (runId: string) => {
    setExporting(true)
    try {
      await downloadPayrollRunCsv(runId)
      addToast('CSV downloaded', 'success')
    } catch (e) {
      addToast((e as Error).message, 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Employer portal"
        title="Payroll Reports"
        description="Deduction history, per-run breakdowns, and CSV exports"
        tone="employer"
        watermarkIcon={BarChart3}
        actions={
          <div className="flex items-center gap-1.5">
            {MONTH_OPTIONS.map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  months === m
                    ? 'bg-primary text-white'
                    : 'bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-400 hover:text-primary dark:hover:text-blue-400'
                }`}
              >
                {m} months
              </button>
            ))}
          </div>
        }
      />

      {/* Summary stat cards */}
      {deductionsLoading ? (
        <GridSkeleton cols={3} count={3} />
      ) : (
        <div className="stagger-3d grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <DashboardMetricCard
            label="Total Deducted"
            value={formatCurrency(deductionsData?.grandTotal ?? 0)}
            sub={`Last ${deductionsData?.months ?? months} months`}
            accent="#f59e0b"
            icon={<Banknote size={18} />}
          />
          <DashboardMetricCard
            label="Payroll Runs Included"
            value={String(deductionsData?.runsIncluded ?? 0)}
            sub="Approved or processed"
            accent="#8b5cf6"
            icon={<Calendar size={18} />}
          />
          <DashboardMetricCard
            label="Employees with Deductions"
            value={String(employees.length)}
            sub="Disbursed deductions only"
            accent="#10b981"
            icon={<Users size={18} />}
          />
        </div>
      )}

      {/* Per-employee deduction history */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Deduction History by Employee</CardTitle>
            <Badge variant="muted" className="text-[10px]">{employees.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {deductionsLoading ? (
            <div className="p-4"><TableSkeleton rows={4} cols={4} /></div>
          ) : employees.length === 0 ? (
            <div className="p-4">
              <EmptyState
                preset="payments"
                title="No deductions in this period"
                description={`No disbursed deductions in the last ${months} months. Widen the window or run payroll first.`}
                compact
              />
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted dark:text-gray-500 border-b border-border/40 dark:border-[#252a3a]/40">
                  <th className="py-2 px-3 font-semibold">Employee</th>
                  <th className="py-2 px-3 font-semibold">Runs</th>
                  <th className="py-2 px-3 font-semibold">By Type</th>
                  <th className="py-2 px-3 font-semibold text-right">Total Deducted</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.employeeId} className="border-b border-border/20 dark:border-[#252a3a]/20 align-top">
                    <td className="py-2.5 px-3 font-bold text-primary-dark dark:text-white">{e.employeeName}</td>
                    <td className="py-2.5 px-3 text-muted dark:text-gray-400">{e.runs}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(e.byType).map(([type, amount]) => (
                          <span key={type} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface dark:bg-[#0c0e1a] text-[10px]">
                            <span className="text-muted dark:text-gray-500">{typeLabel(type)}</span>
                            <span className="font-bold text-primary-dark dark:text-white">{formatCurrency(amount)}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-primary-dark dark:text-white">{formatCurrency(e.totalDeducted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Run selector + per-run report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <div className="lg:col-span-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Payroll Runs</CardTitle></CardHeader>
            <CardContent>
              {runsLoading ? (
                <ListSkeleton rows={4} />
              ) : runs.length === 0 ? (
                <EmptyState
                  preset="payments"
                  title="No payroll runs yet"
                  description="Run your first payroll to see reports."
                  action={{ label: 'Run Payroll', href: '/employer/payroll' }}
                  compact
                />
              ) : (
                <div className="space-y-1.5">
                  {runs.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRunId(r.id)}
                      className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg text-left transition-colors ${
                        selectedRunId === r.id
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-surface dark:hover:bg-[#0c0e1a] border border-transparent'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-primary-dark dark:text-white truncate">{r.periodLabel}</p>
                        <p className="text-[11px] text-muted dark:text-gray-500">
                          Pay date {formatDate(r.scheduledPayDate).split(',')[0]} · {r.employeeCount} employees
                        </p>
                        <p className="text-[11px] text-muted dark:text-gray-500">Deductions {formatCurrency(r.totalDeductions)}</p>
                      </div>
                      <Badge variant={runStatusVariant(r.status)} className="text-[9px] capitalize flex-shrink-0">{r.status.replace('_', ' ')}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm">
                    {report ? `${report.run.periodLabel} — Breakdown` : 'Run Breakdown'}
                  </CardTitle>
                  {report && (
                    <p className="text-[11px] text-muted dark:text-gray-500 mt-1">
                      Gross {formatCurrency(report.run.totalGross)} · Deductions {formatCurrency(report.run.totalDeductions)} · Net {formatCurrency(report.run.totalNet)}
                    </p>
                  )}
                </div>
                {selectedRunId && (
                  <Button size="sm" variant="accent" disabled={exporting} onClick={() => handleExport(selectedRunId)}>
                    <Download size={12} /> {exporting ? 'Exporting…' : 'Export CSV'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedRunId ? (
                <div className="text-center py-8">
                  <BarChart3 size={24} className="mx-auto text-muted/40 mb-2" />
                  <p className="text-xs text-muted dark:text-gray-500">Select a payroll run to see its deduction breakdown</p>
                </div>
              ) : reportLoading || !report ? (
                <ListSkeleton rows={4} />
              ) : (
                <div className="space-y-4">
                  {/* Status breakdown chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {(['disbursed', 'queued', 'failed', 'skipped'] as const).map((s) => (
                      <span key={s} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface dark:bg-[#0c0e1a] text-[11px]">
                        <span className="capitalize text-muted dark:text-gray-500">{s}</span>
                        <span className="font-bold text-primary-dark dark:text-white">{report.statusBreakdown[s]}</span>
                      </span>
                    ))}
                  </div>

                  {report.employees.length === 0 ? (
                    <p className="text-xs text-muted dark:text-gray-500 text-center py-4">No deduction lines in this run</p>
                  ) : (
                    <div className="space-y-2">
                      {report.employees.map((e) => (
                        <div key={e.employeeId} className="p-3 rounded-xl border border-border/40 dark:border-[#252a3a]/40">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <p className="text-sm font-bold text-primary-dark dark:text-white truncate">{e.employeeName}</p>
                            <span className="text-sm font-bold text-primary dark:text-blue-400 flex-shrink-0">{formatCurrency(e.total)}</span>
                          </div>
                          <div className="space-y-1">
                            {e.lines.map((line, i) => (
                              <div key={`${line.mandateId}-${i}`} className="flex items-start justify-between gap-3 text-[11px]">
                                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                  <Badge variant={lineStatusVariant(line.status)} className="text-[9px] capitalize">{line.status}</Badge>
                                  <span className="capitalize text-muted dark:text-gray-400">{line.allocationType.replace('_', ' ')}</span>
                                  {line.status === 'failed' && line.failureReason && (
                                    <span className="inline-flex items-center gap-1 text-danger">
                                      <AlertTriangle size={10} /> {line.failureReason}
                                    </span>
                                  )}
                                  {line.disbursementReference && (
                                    <span className="text-muted dark:text-gray-500">ref {line.disbursementReference}</span>
                                  )}
                                </div>
                                <span className="font-semibold text-primary-dark dark:text-white flex-shrink-0">{formatCurrency(line.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
