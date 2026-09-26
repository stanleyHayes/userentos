import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  AdminPagination,
  AdminStatCard,
  AdminStatGrid,
  AdminTableCard,
  AdminToolbar,
} from '@/components/admin/AdminPagePrimitives'
import { adminTableClassName } from '@/components/admin/adminPageUtils'
import { useAdminEmployers } from '@/hooks/useApi'
import { Building2, CheckCircle2, FileSearch, Repeat2, ShieldAlert } from 'lucide-react'
import type { EmployerVerificationStatus } from '@/types'

const verificationVariant: Record<EmployerVerificationStatus, 'success' | 'warning' | 'danger'> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'danger',
}

function label(value: string) {
  return value.replaceAll('_', ' ')
}

export function AdminEmployersPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Search and paging run on the server (a page holds 50 employers), so wait
  // for the typist to stop before querying.
  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return
    const timer = window.setTimeout(() => {
      setSearch(next)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput, search])

  const params = useMemo(() => ({ page, q: search }), [page, search])
  const { data, isLoading } = useAdminEmployers(params)
  const filtered = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  // KPIs come from the server's platform-wide summary, not the loaded page.
  const stats = {
    verified: data?.summary?.verified ?? 0,
    needsReview: data?.summary?.needsReview ?? 0,
    activeEmployees: data?.summary?.activeEmployees ?? 0,
    activeMandates: data?.summary?.activeMandates ?? 0,
  }

  const total = data?.summary?.employers ?? data?.total ?? 0
  const matching = data?.total ?? filtered.length

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform admin"
        title="Employer Network"
        description="Review employer verification, payroll readiness, employee coverage, and active deduction mandates from one workspace."
        icon={<Building2 size={22} />}
        accent="#60a5fa"
        meta={`${total.toLocaleString()} employers platform-wide`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="Total employers"
          value={total.toLocaleString()}
          description={`${matching.toLocaleString()} employers match the current search.`}
          icon={<Building2 size={18} />}
          accent="#60a5fa"
        />
        <AdminStatCard
          label="Verified"
          value={stats.verified.toLocaleString()}
          description="Employers cleared for payroll deduction workflows."
          icon={<CheckCircle2 size={18} />}
          accent="#10b981"
        />
        <AdminStatCard
          label="Needs review"
          value={stats.needsReview.toLocaleString()}
          description="Pending or rejected employers that still need operator attention."
          icon={<ShieldAlert size={18} />}
          accent="#f59e0b"
        />
        <AdminStatCard
          label="Active mandates"
          value={stats.activeMandates.toLocaleString()}
          description={`${stats.activeEmployees.toLocaleString()} employees are active across registered employers.`}
          icon={<Repeat2 size={18} />}
          accent="#8b5cf6"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Employer search"
        description="Search by legal name, trading name, TIN, or contact email."
        resultLabel={`${filtered.length.toLocaleString()} shown`}
      >
        <div className="w-full sm:w-80">
          <Input
            id="employer-search"
            placeholder="Search employers"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading employers" description="Checking verification and payroll coverage across employers." />
      ) : filtered.length === 0 ? (
        <AdminEmptyState
          title="No employers found"
          description={search ? 'Try a different name, TIN, or email.' : 'No employers have been registered yet.'}
          icon={<FileSearch size={22} />}
        />
      ) : (
        <AdminTableCard
          title="Employer registry"
          description="Verification, payroll cycle, workforce size, and mandate coverage in a scan-friendly table."
        >
          <table className={adminTableClassName('min-w-[940px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Employer</th>
                <th className="px-4 py-3 font-bold">Registration</th>
                <th className="px-4 py-3 font-bold">Verification</th>
                <th className="px-4 py-3 text-right font-bold">Employees</th>
                <th className="px-4 py-3 text-right font-bold">Mandates</th>
                <th className="px-4 py-3 font-bold">Payroll</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {filtered.map((e) => {
                const location = [e.address?.city, e.address?.region].filter(Boolean).join(', ')

                return (
                  <tr key={e.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-4">
                      <div className="font-bold text-primary-dark dark:text-white">{e.legalName}</div>
                      {e.tradingName && <div className="mt-1 text-[11px] text-muted dark:text-gray-500">Trading as {e.tradingName}</div>}
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{e.contactEmail}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-mono text-xs font-bold text-primary-dark dark:text-white">{e.tin}</div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{e.industry ?? 'Industry not set'}</div>
                      {location && <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{location}</div>}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={verificationVariant[e.verificationStatus]} className="text-[10px] capitalize">{label(e.verificationStatus)}</Badge>
                      <div className="mt-2 text-[11px] text-muted dark:text-gray-500">{e.verifiedAt ? 'Verified record on file' : 'Verification record pending'}</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-primary-dark dark:text-white">{e.activeEmployees.toLocaleString()}</div>
                      <div className="text-[11px] text-muted dark:text-gray-500">{e.totalEmployees.toLocaleString()} total</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-primary-dark dark:text-white">{e.activeMandates.toLocaleString()}</div>
                      <div className="text-[11px] text-muted dark:text-gray-500">active deductions</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold capitalize text-primary-dark dark:text-white">{label(e.payrollCycle)}</div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{e.paydayDayOfMonth ? `Payday ${e.paydayDayOfMonth}` : 'Payday not set'}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </AdminTableCard>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />
    </div>
  )
}
