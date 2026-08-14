import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import type { PayrollRun, PayrollDeductionRecord, PayrollDeductionStatus } from '@/types'

// ─────────────────────────────────────────────
// EMPLOYER PAYROLL REPORTS — per-run breakdown, per-employee history, CSV export
// Shapes mirror server/src/routes/employers.ts "PAYROLL REPORTS" section.
// ─────────────────────────────────────────────

export interface PayrollRunReportEmployee {
  employeeId: string
  employeeName: string
  total: number
  lines: PayrollDeductionRecord[]
}

export interface PayrollRunReportResponse {
  run: PayrollRun
  employees: PayrollRunReportEmployee[]
  statusBreakdown: Record<PayrollDeductionStatus, number>
}

export interface DeductionsReportEmployee {
  employeeId: string
  employeeName: string
  totalDeducted: number
  runs: number
  byType: Record<string, number>
}

export interface DeductionsReportResponse {
  months: number
  runsIncluded: number
  grandTotal: number
  employees: DeductionsReportEmployee[]
}

/** GET /employers/reports/deductions?months=N — per-employee deduction history across runs */
export function useDeductionsReport(months: number) {
  return useQuery({
    queryKey: ['employer-reports', 'deductions', months],
    queryFn: () => api.get<DeductionsReportResponse>(`/employers/reports/deductions?months=${months}`),
  })
}

/** GET /employers/payroll/runs/:id/report — the run with deductions grouped per employee */
export function usePayrollRunReport(runId: string | null) {
  return useQuery({
    queryKey: ['employer-reports', 'run-report', runId],
    queryFn: () => api.get<PayrollRunReportResponse>(`/employers/payroll/runs/${runId}/report`),
    enabled: Boolean(runId),
  })
}

/**
 * GET /employers/payroll/runs/:id/export — CSV download.
 * The api client is JSON-oriented, so this uses a direct authenticated fetch,
 * then blob → object URL → anchor download. Filename comes from the server's
 * Content-Disposition header when present.
 */
export async function downloadPayrollRunCsv(runId: string): Promise<void> {
  const token = useAuthStore.getState().token
  const baseUrl = import.meta.env.VITE_API_URL || '/api'
  const res = await fetch(`${baseUrl}/employers/payroll/runs/${runId}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    let message = `Export failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      // Non-JSON error body — keep the status-based message
    }
    throw new Error(message)
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? `payroll-run-${runId}.csv`

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
