import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'

interface TenantCreditScoreCardProps {
  creditScore: number
  factors?: Record<string, number>
}

export function TenantCreditScoreCard({ creditScore, factors }: TenantCreditScoreCardProps) {
  /* Credit score ring */
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col items-center text-center">
          <div className="relative w-28 h-28 mb-3">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-border dark:text-[#252a3a]" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(creditScore / 100) * 263.9} 263.9`} className={creditScore >= 80 ? 'text-accent' : creditScore >= 60 ? 'text-blue-500 dark:text-blue-400' : creditScore >= 40 ? 'text-secondary' : 'text-danger'} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-extrabold font-display ${creditScore >= 80 ? 'text-accent' : creditScore >= 60 ? 'text-blue-500 dark:text-blue-400' : creditScore >= 40 ? 'text-secondary' : 'text-danger'}`}>{creditScore}</span>
              <span className="text-[10px] text-muted dark:text-gray-500">out of 100</span>
            </div>
          </div>
          <p className="text-sm font-bold text-primary-dark dark:text-white">Rent Credit Score</p>
          <p className={`text-xs font-semibold ${creditScore >= 80 ? 'text-accent' : creditScore >= 60 ? 'text-blue-500 dark:text-blue-400' : creditScore >= 40 ? 'text-secondary' : 'text-danger'}`}>
            {creditScore >= 80 ? 'Excellent' : creditScore >= 60 ? 'Good' : creditScore >= 40 ? 'Fair' : 'Needs Work'}
          </p>

          {/* Mini factor bars */}
          {factors && (
            <div className="w-full mt-4 space-y-2">
              {[
                { label: 'Payments', key: 'paymentHistory', max: 40 },
                { label: 'Savings', key: 'savingsConsistency', max: 20 },
                { label: 'Compliance', key: 'agreementCompliance', max: 20 },
              ].map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted dark:text-gray-500 w-16 text-left">{f.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500 dark:bg-blue-400" style={{ width: `${((factors[f.key] ?? 0) / f.max) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-primary-dark dark:text-gray-300 w-8 text-right">{factors[f.key] ?? 0}</span>
                </div>
              ))}
            </div>
          )}

          <Link to="/credit-score" className="text-[11px] text-primary dark:text-blue-400 hover:underline mt-3">View full breakdown</Link>
        </div>
      </CardContent>
    </Card>
  )
}
