import { Card } from '@/components/ui/Card'
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'

export interface PropertyQualification {
  qualified: boolean
  checks: { requirement: string; met: boolean; detail: string }[]
  passedCount: number
  totalCount: number
}

export function QualificationCard({ qualification }: { qualification: PropertyQualification }) {
  return (
    <Card>
      <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 mb-3 ${qualification.qualified ? 'bg-emerald-500/10 dark:bg-emerald-500/15' : 'bg-amber-500/10 dark:bg-amber-500/15'}`}>
        {qualification.qualified ? (
          <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
        ) : (
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${qualification.qualified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {qualification.qualified ? 'You qualify for this property!' : "You don't meet all requirements"}
          </p>
          <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">
            {qualification.passedCount} of {qualification.totalCount} requirements met
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-[#252a3a] mb-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${qualification.qualified ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${qualification.totalCount > 0 ? (qualification.passedCount / qualification.totalCount) * 100 : 0}%` }}
        />
      </div>

      {/* Individual checks */}
      <div className="space-y-2">
        {qualification.checks.map((check, i) => (
          <div key={i} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${check.met ? 'bg-emerald-500/5 dark:bg-emerald-500/10' : 'bg-red-500/5 dark:bg-red-500/10'}`}>
            {check.met ? (
              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className={`text-xs font-semibold ${check.met ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {check.requirement}
              </p>
              <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {!qualification.qualified && (
        <div className="flex items-start gap-2 mt-3 rounded-lg bg-surface dark:bg-[#0c0e1a] px-3 py-2.5">
          <Info size={12} className="text-muted dark:text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted dark:text-gray-500">
            You can still apply. The landlord will review your application and make the final decision.
          </p>
        </div>
      )}
    </Card>
  )
}
