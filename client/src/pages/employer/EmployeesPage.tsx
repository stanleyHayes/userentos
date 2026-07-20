import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useEmployees, useAddEmployee, useUpdateEmployee, useBulkImportEmployees, type BulkImportRow, type BulkImportResult } from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, UserMinus, UserCheck, Upload } from 'lucide-react'
import TextField from '@mui/material/TextField'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

const CSV_HEADERS = ['email', 'netMonthlySalary', 'startDate', 'staffNumber', 'jobTitle'] as const

interface ParsedRow {
  rowNumber: number
  raw: string
  data?: BulkImportRow
  error?: string
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return []

  // Detect optional header line
  let startIdx = 0
  const first = lines[0].toLowerCase()
  if (first.includes('email') && first.includes('salary')) {
    startIdx = 1
  }

  const out: ParsedRow[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i]
    const parts = raw.split(',').map((s) => s.trim())
    const rowNumber = i - startIdx + 1
    const [email, netMonthlySalary, startDate, staffNumber, jobTitle] = parts
    if (!email || !netMonthlySalary || !startDate) {
      out.push({ rowNumber, raw, error: 'Missing required column (email, netMonthlySalary, or startDate)' })
      continue
    }
    const salary = Number(netMonthlySalary)
    if (Number.isNaN(salary) || salary < 0) {
      out.push({ rowNumber, raw, error: 'netMonthlySalary must be a non-negative number' })
      continue
    }
    out.push({
      rowNumber,
      raw,
      data: {
        email,
        netMonthlySalary: salary,
        startDate,
        staffNumber: staffNumber || undefined,
        jobTitle: jobTitle || undefined,
      },
    })
  }
  return out
}

export function EmployerEmployeesPage() {
  const { data, isLoading } = useEmployees()
  const add = useAddEmployee()
  const update = useUpdateEmployee()
  const bulkImport = useBulkImportEmployees()
  const addToast = useToastStore((s) => s.addToast)
  const [open, setOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null)
  const [form, setForm] = useState({ email: '', netMonthlySalary: '', startDate: new Date().toISOString().slice(0, 10), staffNumber: '', jobTitle: '' })

  const employees = data?.items ?? []

  const parsedRows = useMemo(() => parseCsv(csvText), [csvText])
  const validRows = useMemo(() => parsedRows.filter((r) => r.data), [parsedRows])
  const previewRows = parsedRows.slice(0, 5)

  function submit() {
    add.mutate({
      email: form.email,
      netMonthlySalary: Number(form.netMonthlySalary),
      startDate: form.startDate,
      staffNumber: form.staffNumber || undefined,
      jobTitle: form.jobTitle || undefined,
    }, {
      onSuccess: () => {
        addToast('Employee added', 'success')
        setOpen(false)
        setForm({ email: '', netMonthlySalary: '', startDate: new Date().toISOString().slice(0, 10), staffNumber: '', jobTitle: '' })
      },
      onError: (e) => addToast((e as Error).message, 'error'),
    })
  }

  function resetBulk() {
    setBulkOpen(false)
    setCsvText('')
    setBulkResult(null)
  }

  async function handleFileUpload(file: File) {
    try {
      const text = await file.text()
      setCsvText(text)
      setBulkResult(null)
    } catch {
      addToast('Could not read the selected file', 'error')
    }
  }

  function submitBulk() {
    if (validRows.length === 0) {
      addToast('No valid rows to import', 'error')
      return
    }
    if (validRows.length > 500) {
      addToast('Bulk import is limited to 500 rows per request', 'error')
      return
    }
    const rows: BulkImportRow[] = validRows.map((r) => r.data!)
    bulkImport.mutate(rows, {
      onSuccess: (result) => {
        setBulkResult(result)
        addToast(`Imported ${result.created} of ${rows.length}`, result.errors.length === 0 ? 'success' : 'info')
      },
      onError: (e) => addToast((e as Error).message, 'error'),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">Employees</h1>
          <p className="text-sm text-muted dark:text-gray-500">{employees.length} on payroll</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}><Upload size={14} /> Bulk Import (CSV)</Button>
          <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Add Employee</Button>
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : employees.length === 0 ? (
        <EmptyState preset="general" title="No employees yet" description="Add employees to link them to payroll and rent deductions." action={{ label: 'Add First Employee', onClick: () => setOpen(true) }} />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted dark:text-gray-500 border-b border-border/40 dark:border-[#252a3a]/40">
                  <th className="py-3 px-4 font-semibold">Employee</th>
                  <th className="py-3 px-4 font-semibold">Staff #</th>
                  <th className="py-3 px-4 font-semibold">Title</th>
                  <th className="py-3 px-4 font-semibold text-right">Net Salary</th>
                  <th className="py-3 px-4 font-semibold">Start</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b border-border/20 dark:border-[#252a3a]/20">
                    <td className="py-3 px-4 font-bold text-primary-dark dark:text-white">{e.employeeName ?? e.userId.slice(0, 8)}</td>
                    <td className="py-3 px-4 text-muted dark:text-gray-400">{e.staffNumber ?? '—'}</td>
                    <td className="py-3 px-4 text-muted dark:text-gray-400">{e.jobTitle ?? '—'}</td>
                    <td className="py-3 px-4 text-right font-semibold text-primary-dark dark:text-white">{formatCurrency(e.netMonthlySalary)}</td>
                    <td className="py-3 px-4 text-muted dark:text-gray-400">{formatDate(e.startDate).split(',')[0]}</td>
                    <td className="py-3 px-4">
                      <Badge variant={e.status === 'active' ? 'success' : e.status === 'terminated' ? 'danger' : 'muted'} className="text-[10px] capitalize">{e.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      {e.status === 'active' ? (
                        <Button size="sm" variant="outline" onClick={() => update.mutate({ id: e.id, status: 'terminated', endDate: new Date().toISOString().slice(0, 10) })}>
                          <UserMinus size={12} /> Terminate
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => update.mutate({ id: e.id, status: 'active' })}>
                          <UserCheck size={12} /> Reactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Employee">
        <div className="space-y-4">
          <p className="text-xs text-muted dark:text-gray-500">The employee must already have a RentOS account. Use their registered email.</p>
          <Input id="add-emp-email" label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input id="add-emp-staff" label="Staff number (optional)" value={form.staffNumber} onChange={(e) => setForm((f) => ({ ...f, staffNumber: e.target.value }))} />
          <Input id="add-emp-title" label="Job title (optional)" value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} />
          <Input id="add-emp-salary" type="number" label="Net monthly salary (GHS)" value={form.netMonthlySalary} onChange={(e) => setForm((f) => ({ ...f, netMonthlySalary: e.target.value }))} />
          <Input id="add-emp-start" type="date" label="Start date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={add.isPending || !form.email || !form.netMonthlySalary}>{add.isPending ? 'Adding…' : 'Add Employee'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulkOpen} onClose={resetBulk} title="Bulk Import Employees" className="max-w-2xl">
        <div className="space-y-4">
          <div className="text-xs text-muted dark:text-gray-500 space-y-1">
            <p>Paste CSV or upload a file. Columns: <code className="font-mono text-[11px]">{CSV_HEADERS.join(',')}</code> — header row optional.</p>
            <p>Each employee must already have a RentOS account. Hard cap: 500 rows per import.</p>
          </div>

          <div>
            <input
              id="bulk-import-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFileUpload(file)
              }}
              className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:text-white file:px-3 file:py-1.5 file:text-xs file:cursor-pointer"
            />
          </div>

          <TextField
            id="bulk-import-csv"
            label="CSV content"
            placeholder={`${CSV_HEADERS.join(',')}\njane@example.com,3500,2025-01-15,EMP-001,Engineer`}
            multiline
            minRows={6}
            maxRows={12}
            fullWidth
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setBulkResult(null) }}
            slotProps={{ inputLabel: { shrink: true }, input: { style: { fontFamily: 'monospace', fontSize: 12 } } }}
          />

          {parsedRows.length > 0 && !bulkResult && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted dark:text-gray-500">
                  Detected {parsedRows.length} row{parsedRows.length === 1 ? '' : 's'} ({validRows.length} valid, {parsedRows.length - validRows.length} invalid)
                </span>
                {parsedRows.length > 500 && <Badge variant="danger" className="text-[10px]">Exceeds 500-row cap</Badge>}
              </div>
              <div className="rounded-lg border border-border/40 dark:border-[#252a3a]/40 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-surface dark:bg-[#0c0e1a]">
                    <tr className="text-left text-muted dark:text-gray-500">
                      <th className="py-2 px-3 font-semibold">#</th>
                      <th className="py-2 px-3 font-semibold">Email</th>
                      <th className="py-2 px-3 font-semibold">Salary</th>
                      <th className="py-2 px-3 font-semibold">Start</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => (
                      <tr key={r.rowNumber} className="border-t border-border/20 dark:border-[#252a3a]/20">
                        <td className="py-2 px-3 text-muted">{r.rowNumber}</td>
                        <td className="py-2 px-3 font-mono">{r.data?.email ?? r.raw.slice(0, 30)}</td>
                        <td className="py-2 px-3">{r.data ? formatCurrency(r.data.netMonthlySalary) : '—'}</td>
                        <td className="py-2 px-3">{r.data?.startDate ?? '—'}</td>
                        <td className="py-2 px-3">
                          {r.error ? (
                            <Badge variant="danger" className="text-[10px]">{r.error}</Badge>
                          ) : (
                            <Badge variant="success" className="text-[10px]">Ready</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 5 && (
                  <p className="px-3 py-2 text-[11px] text-muted dark:text-gray-500 border-t border-border/20 dark:border-[#252a3a]/20">
                    Showing first 5 of {parsedRows.length} rows.
                  </p>
                )}
              </div>
            </div>
          )}

          {bulkResult && (
            <div className="space-y-2 rounded-lg border border-border/40 dark:border-[#252a3a]/40 p-3">
              <p className="text-sm font-semibold text-primary-dark dark:text-white">Import complete</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
                  <p className="text-lg font-bold text-emerald-500">{bulkResult.created}</p>
                  <p className="text-[10px] text-muted">Created</p>
                </div>
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
                  <p className="text-lg font-bold text-amber-500">{bulkResult.skipped}</p>
                  <p className="text-[10px] text-muted">Skipped</p>
                </div>
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
                  <p className="text-lg font-bold text-red-500">{bulkResult.errors.length}</p>
                  <p className="text-[10px] text-muted">Errors</p>
                </div>
              </div>
              {bulkResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/40 dark:border-[#252a3a]/40">
                  <table className="w-full text-xs">
                    <thead className="bg-surface dark:bg-[#0c0e1a] sticky top-0">
                      <tr className="text-left text-muted">
                        <th className="py-1.5 px-3 font-semibold">Row</th>
                        <th className="py-1.5 px-3 font-semibold">Email</th>
                        <th className="py-1.5 px-3 font-semibold">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResult.errors.map((err, i) => (
                        <tr key={`${err.row}-${i}`} className="border-t border-border/20 dark:border-[#252a3a]/20">
                          <td className="py-1.5 px-3">{err.row}</td>
                          <td className="py-1.5 px-3 font-mono">{err.email ?? '—'}</td>
                          <td className="py-1.5 px-3 text-red-500">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetBulk}>{bulkResult ? 'Close' : 'Cancel'}</Button>
            {!bulkResult && (
              <Button
                onClick={submitBulk}
                disabled={bulkImport.isPending || validRows.length === 0 || parsedRows.length > 500}
              >
                {bulkImport.isPending ? 'Importing…' : `Import ${validRows.length} row${validRows.length === 1 ? '' : 's'}`}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
