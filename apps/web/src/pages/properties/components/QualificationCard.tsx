import { Card } from '@/components/ui/Card'
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'

/** GET /properties/:id/qualify — the requirements this tenant does not meet. */
export interface PropertyQualification {
  qualified: boolean
  issues: string[]
  propertyId: string
}

export function QualificationCard({ qualification }: { qualification: PropertyQualification }) {
  const issues = qualification.issues ?? []
  return (
    <Card>
      <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 ${issues.length ? 'mb-3' : ''} ${qualification.qualified ? 'bg-emerald-500/10 dark:bg-emerald-500/15' : 'bg-amber-500/10 dark:bg-amber-500/15'}`}>
        {qualification.qualified ? (
          <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
        ) : (
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${qualification.qualified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {qualification.qualified ? 'You meet this landlord’s requirements' : "You don't meet all requirements"}
          </p>
          {!qualification.qualified && (
            <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">
              {issues.length} requirement{issues.length === 1 ? '' : 's'} not met
            </p>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="space-y-2">
          {issues.map((issue) => (
            <div key={issue} className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 bg-red-500/5 dark:bg-red-500/10">
              <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="min-w-0 text-xs font-semibold text-red-700 dark:text-red-400">{issue}</p>
            </div>
          ))}
        </div>
      )}

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
