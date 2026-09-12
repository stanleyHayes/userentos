import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/**
 * How the rent model is actually doing (ML roadmap checklist item 6).
 *
 * The model's own R² is computed against the data it trained on — today that
 * is synthetically generated listings, so it measures how well a linear model
 * recovers the formula that made them. Everything on this page is measured
 * against rents that really happened: what the model predicted, and what the
 * property was then approved or let at.
 */

interface ModelScore {
  modelVersion: string
  scored: number
  mape: number
  medianApe: number
  bias: number
  intervalCoverage: number
  mapeCompleteInputs: number | null
  mapeImputedInputs: number | null
}

interface Evaluation {
  windowDays: number
  summary: { total: number; scored: number; awaitingOutcome: number; coveragePercent: number }
  scores: ModelScore[]
  note?: string
}

interface ValuationRow {
  _id: string
  modelVersion: string
  modelSource: string
  context: string
  input: Record<string, unknown>
  predictedRent: number
  baselineRent?: number
  confidenceLow?: number
  confidenceHigh?: number
  suppliedFields?: number
  totalFields?: number
  imputedFields?: string[]
  propertyId?: string
  observedRent?: number
  observedSource?: string
  createdAt: string
}

const WINDOWS = [30, 90, 365] as const

function formatCurrency(n: number): string {
  return `GHS ${Math.round(n).toLocaleString()}`
}

function Stat({ label, value, hint, tone }: {
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'bad' | 'neutral'
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn(
        'font-display text-2xl font-extrabold',
        tone === 'good' && 'text-green-600 dark:text-green-400',
        tone === 'bad' && 'text-red-600 dark:text-red-400',
        (!tone || tone === 'neutral') && 'text-primary dark:text-sky-300',
      )}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  )
}

function describeInput(input: Record<string, unknown>): string {
  const bits: string[] = []
  if (input.bedrooms !== undefined) bits.push(`${input.bedrooms} bed`)
  if (input.bathrooms !== undefined) bits.push(`${input.bathrooms} bath`)
  if (input.type) bits.push(String(input.type).replace(/_/g, ' '))
  if (input.city) bits.push(String(input.city))
  return bits.join(' · ') || '—'
}

export function AdminModelPerformancePage() {
  const [days, setDays] = useState<number>(90)
  const [withOutcomeOnly, setWithOutcomeOnly] = useState(false)

  const evaluation = useQuery({
    queryKey: ['model-evaluation', days],
    queryFn: () => api.get<Evaluation>(`/pricing/model-evaluation?days=${days}`),
  })

  const valuations = useQuery({
    queryKey: ['valuations', withOutcomeOnly],
    queryFn: () => api.get<{ items: ValuationRow[]; total: number }>(
      `/pricing/valuations?limit=25&withOutcome=${withOutcomeOnly}`,
    ),
  })

  const summary = evaluation.data?.summary
  const scores = evaluation.data?.scores ?? []

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-primary-dark dark:text-white">
          Pricing model performance
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Measured against rents that actually happened — what the model predicted, and what the
          property was then approved or let at. This is not the model&apos;s self-reported R², which is
          computed against the data it was trained on.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <Button
            key={w}
            size="sm"
            variant={days === w ? 'primary' : 'outline'}
            onClick={() => setDays(w)}
          >
            Last {w} days
          </Button>
        ))}
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Valuations recorded" value={String(summary.total)} />
          <Stat
            label="With a known outcome"
            value={String(summary.scored)}
            hint="Only these can be scored"
          />
          <Stat label="Awaiting an outcome" value={String(summary.awaitingOutcome)} />
          <Stat
            label="Outcome coverage"
            value={`${summary.coveragePercent}%`}
            hint="Listings approved or let since the estimate"
          />
        </div>
      )}

      {evaluation.data?.note && (
        <Card className="border-amber-300/70 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-400/10">
          <p className="text-sm text-amber-800 dark:text-amber-200">{evaluation.data.note}</p>
        </Card>
      )}

      {scores.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border/70 p-4 dark:border-white/10">
            <h2 className="text-sm font-bold text-primary-dark dark:text-white">Accuracy by model version</h2>
            <p className="mt-0.5 text-xs text-muted">
              Two versions scored on real outcomes can be compared directly. A small sample is not
              evidence — check the &ldquo;scored&rdquo; column before drawing a conclusion.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wide text-muted dark:bg-white/[0.03]">
                <tr>
                  <th className="p-3 text-left font-semibold">Model version</th>
                  <th className="p-3 text-right font-semibold">Scored</th>
                  <th className="p-3 text-right font-semibold">Mean error</th>
                  <th className="p-3 text-right font-semibold">Median error</th>
                  <th className="p-3 text-right font-semibold">Bias</th>
                  <th className="p-3 text-right font-semibold">Interval coverage</th>
                  <th className="p-3 text-right font-semibold">Complete inputs</th>
                  <th className="p-3 text-right font-semibold">Imputed inputs</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.modelVersion} className="border-t border-border/60 dark:border-white/10">
                    <td className="p-3 font-mono text-xs">{new Date(s.modelVersion).toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums">{s.scored}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{s.mape}%</td>
                    <td className="p-3 text-right tabular-nums">{s.medianApe}%</td>
                    <td className={cn(
                      'p-3 text-right tabular-nums',
                      s.bias > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400',
                    )}>
                      {s.bias > 0 ? '+' : ''}{s.bias}%
                      <span className="ml-1 text-xs text-muted">
                        {s.bias > 0 ? 'over' : 'under'}
                      </span>
                    </td>
                    <td className={cn(
                      'p-3 text-right tabular-nums',
                      s.intervalCoverage < 50 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
                    )}>
                      {s.intervalCoverage}%
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {s.mapeCompleteInputs === null ? '—' : `${s.mapeCompleteInputs}%`}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {s.mapeImputedInputs === null ? '—' : `${s.mapeImputedInputs}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border/60 p-3 text-xs text-muted dark:border-white/10">
            <strong>Interval coverage</strong> is how often the real rent fell inside the confidence
            range shown to the user. Far below the nominal band means the model is claiming more
            certainty than it has. <strong>Complete</strong> vs <strong>imputed</strong> compares
            estimates where every field was supplied against ones where fields had to be filled in
            from the training average.
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4 dark:border-white/10">
          <div>
            <h2 className="text-sm font-bold text-primary-dark dark:text-white">Recent valuations</h2>
            <p className="mt-0.5 text-xs text-muted">
              Every estimate the platform produced, with its inputs and provenance.
            </p>
          </div>
          <Button
            size="sm"
            variant={withOutcomeOnly ? 'primary' : 'outline'}
            onClick={() => setWithOutcomeOnly((v) => !v)}
          >
            {withOutcomeOnly ? 'Showing scored only' : 'Show scored only'}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wide text-muted dark:bg-white/[0.03]">
              <tr>
                <th className="p-3 text-left font-semibold">When</th>
                <th className="p-3 text-left font-semibold">Property</th>
                <th className="p-3 text-right font-semibold">Predicted</th>
                <th className="p-3 text-right font-semibold">Actual</th>
                <th className="p-3 text-right font-semibold">Error</th>
                <th className="p-3 text-right font-semibold">Inputs</th>
                <th className="p-3 text-left font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {(valuations.data?.items ?? []).map((row) => {
                const error = row.observedRent
                  ? ((row.predictedRent - row.observedRent) / row.observedRent) * 100
                  : null
                return (
                  <tr key={row._id} className="border-t border-border/60 dark:border-white/10">
                    <td className="p-3 whitespace-nowrap text-xs text-muted">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3">{describeInput(row.input)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(row.predictedRent)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {row.observedRent ? formatCurrency(row.observedRent) : <span className="text-muted">pending</span>}
                    </td>
                    <td className={cn(
                      'p-3 text-right tabular-nums font-semibold',
                      error === null ? 'text-muted'
                        : Math.abs(error) < 15 ? 'text-green-600 dark:text-green-400'
                          : Math.abs(error) < 35 ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400',
                    )}>
                      {error === null ? '—' : `${error > 0 ? '+' : ''}${error.toFixed(1)}%`}
                    </td>
                    <td className="p-3 text-right text-xs tabular-nums">
                      <span title={(row.imputedFields ?? []).join(', ') || 'All fields supplied'}>
                        {row.suppliedFields ?? '—'} / {row.totalFields ?? '—'}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {row.modelSource}
                      {row.observedSource && ` · ${row.observedSource.replace(/_/g, ' ')}`}
                    </td>
                  </tr>
                )
              })}
              {valuations.isSuccess && (valuations.data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted">
                    No valuations recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
