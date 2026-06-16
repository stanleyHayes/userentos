import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import {
  useMyEmployer, useEmployees, useEmployerMandates, usePayrollRuns, useApproveMandate,
} from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Building2, Users, FileSignature, Banknote, Plus, ShieldAlert, CheckCircle2, Calendar } from 'lucide-react'

export function EmployerDashboard() {
  const user = useAuthStore((s) => s.user)
  const { data: employer } = useMyEmployer()
  const { data: employeesData } = useEmployees()
  const { data: mandatesData } = useEmployerMandates()
  const { data: runsData } = usePayrollRuns()
  const approveMandate = useApproveMandate()

  const employees = employeesData?.items ?? []
  const mandates = mandatesData?.items ?? []
  const pendingMandates = mandates.filter((m) => m.status === 'pending')
  const activeMandates = mandates.filter((m) => m.status === 'active')
  const runs = runsData?.items ?? []
  const recentRun = runs[0]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const totalActiveDeductions = activeMandates.reduce((sum, m) => sum + (m.amountType === 'fixed' ? m.amount : 0), 0)

  if (!employer) {
    return (
      <div className="space-y-4 max-w-2xl">
        <DashboardHero
          eyebrow="Employer portal"
          title={`Welcome, ${user?.firstName ?? 'there'}`}
          description="Set up your company profile to start enrolling employees"
          tone="employer"
        />
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 size={28} className="mx-auto text-muted/40 mb-2" />
            <p className="text-sm font-semibold text-primary-dark dark:text-white">Set up your employer profile</p>
            <p className="text-xs text-muted dark:text-gray-500 mt-1 mb-4">Add your TIN, SSNIT number, and payroll cycle to begin</p>
            <Link to="/employer/profile"><Button><Plus size={14} /> Create Employer Profile</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Employer portal"
        title={`${greeting}, ${user?.firstName ?? 'there'}`}
        description={`${employer.legalName} · ${employer.payrollCycle} payroll`}
        tone="employer"
        actions={
          <Badge variant={employer.verificationStatus === 'verified' ? 'success' : 'warning'} className="text-[10px] capitalize">
            {employer.verificationStatus}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <DashboardMetricCard label="Employees" value={String(employees.length)} sub={`${employees.filter((e) => e.status === 'active').length} active`} accent="#3b82f6" icon={<Users size={18} />} href="/employer/employees" />
        <DashboardMetricCard label="Active Mandates" value={String(activeMandates.length)} sub={`${pendingMandates.length} pending`} accent="#10b981" icon={<FileSignature size={18} />} href="/employer/payroll" />
        <DashboardMetricCard label="Monthly Deductions" value={formatCurrency(totalActiveDeductions)} sub="Across all employees" accent="#f59e0b" icon={<Banknote size={18} />} href="/employer/payroll" />
        <DashboardMetricCard label="Last Payroll" value={recentRun ? formatCurrency(recentRun.totalNet) : '-'} sub={recentRun?.periodLabel ?? 'No runs yet'} accent="#8b5cf6" icon={<Calendar size={18} />} href="/employer/payroll" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <div className="lg:col-span-8 space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Pending Deduction Mandates</CardTitle>
                <Badge variant={pendingMandates.length > 0 ? 'warning' : 'muted'} className="text-[10px]">{pendingMandates.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {pendingMandates.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle2 size={24} className="mx-auto text-emerald-500/40 mb-2" />
                  <p className="text-xs text-muted dark:text-gray-500">All clear — no pending mandates</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingMandates.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-primary-dark dark:text-white truncate">{m.employeeName ?? m.employeeId.slice(0, 8)}</p>
                          <Badge variant="warning" className="text-[9px] capitalize">{m.allocationType.replace('_', ' ')}</Badge>
                        </div>
                        <p className="text-[11px] text-muted dark:text-gray-500 mt-0.5">{m.targetLabel}</p>
                        <p className="text-[11px] mt-1">
                          <span className="font-bold text-primary dark:text-blue-400">{m.amountType === 'fixed' ? formatCurrency(m.amount) : `${m.amount}%`}</span>
                          <span className="text-muted dark:text-gray-500"> from {formatDate(m.startDate).split(',')[0]}</span>
                        </p>
                      </div>
                      <Button size="sm" variant="accent" disabled={approveMandate.isPending} onClick={() => approveMandate.mutate(m.id)}>
                        <CheckCircle2 size={12} /> Approve
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Recent Payroll Runs</CardTitle>
                <Link to="/employer/payroll"><span className="text-[11px] text-primary dark:text-blue-400 hover:underline">View all</span></Link>
              </div>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <div className="text-center py-6">
                  <Calendar size={24} className="mx-auto text-muted/40 mb-2" />
                  <p className="text-xs text-muted dark:text-gray-500 mb-3">No payroll runs yet</p>
                  <Link to="/employer/payroll/new"><Button size="sm"><Plus size={12} /> Run Payroll</Button></Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {runs.slice(0, 5).map((r) => (
                    <Link key={r.id} to={`/employer/payroll/${r.id}`} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-surface dark:hover:bg-[#0c0e1a]">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-primary-dark dark:text-white truncate">{r.periodLabel}</p>
                        <p className="text-[11px] text-muted dark:text-gray-500">Pay date {formatDate(r.scheduledPayDate).split(',')[0]} · {r.employeeCount} employees</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-bold text-primary-dark dark:text-white">{formatCurrency(r.totalDeductions)}</span>
                        <Badge variant={r.status === 'processed' ? 'success' : r.status === 'failed' ? 'danger' : 'default'} className="text-[9px] capitalize">{r.status.replace('_', ' ')}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Employees</CardTitle>
                <Link to="/employer/employees"><span className="text-[11px] text-primary dark:text-blue-400 hover:underline">Manage</span></Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {employees.slice(0, 5).map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-primary-dark dark:text-white truncate">{e.employeeName ?? e.userId.slice(0, 8)}</p>
                      <p className="text-[10px] text-muted dark:text-gray-500 truncate">{e.jobTitle ?? e.staffNumber}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-primary-dark dark:text-white">{formatCurrency(e.netMonthlySalary)}</span>
                  </div>
                ))}
                {employees.length === 0 && (
                  <Link to="/employer/employees" className="block text-center py-4">
                    <Plus size={18} className="mx-auto text-muted/40 mb-1" />
                    <p className="text-xs text-primary dark:text-blue-400 font-semibold">Add your first employee</p>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-primary-dark dark:text-white mb-1">Labour Act 2003 (Act 651)</p>
                  <p className="text-[11px] text-muted dark:text-gray-400">All voluntary deductions require the employee's signed mandate. Total deductions are capped at one-third of net pay.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
