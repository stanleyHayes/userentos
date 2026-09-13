import { RENT_LAW } from './rentLaw.js'

export interface AgreementTerms {
  startDate: string
  endDate: string
  advanceMonths: number
  terms: string[]
  specialConditions?: string[]
}

export interface ComplianceFlag {
  type: string
  message: string
  clause?: string
  law?: string
}

function validDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

/** Calendar anniversary, clamped at month end rather than treating a month as 30 days. */
function oneMonthAfter(start: Date): Date {
  const next = new Date(start)
  next.setUTCMonth(next.getUTCMonth() + 1, 1)
  const monthEnd = new Date(next)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0)
  next.setUTCDate(Math.min(start.getUTCDate(), monthEnd.getUTCDate()))
  return next
}

/** Recomputed from the terms; caller-supplied or legacy flags are never authoritative. */
export function checkAgreementCompliance(data: AgreementTerms): ComplianceFlag[] {
  const flags: ComplianceFlag[] = []
  const start = validDate(data.startDate)
  const end = validDate(data.endDate)
  if (!start || !end || end <= start) {
    flags.push({ type: 'violation', message: 'Provide valid tenancy dates with an end date after the start date.' })
  }
  if (!Number.isInteger(data.advanceMonths) || data.advanceMonths < 0) {
    flags.push({ type: 'violation', message: 'Advance months must be a non-negative whole number.' })
  } else if (start && end && end > start && end <= oneMonthAfter(start) && data.advanceMonths > RENT_LAW.monthlyTenancyMaxAdvanceMonths) {
    flags.push({ type: 'violation', message: 'For a tenancy of one calendar month or less, rent advance must not exceed one month.', law: RENT_LAW.monthlyAdvanceCitation })
  } else if (data.advanceMonths > RENT_LAW.maxAdvanceMonths) {
    flags.push({ type: 'violation', message: 'Rent advance exceeds six months.', law: RENT_LAW.advanceCitation })
  }
  for (const term of [...data.terms, ...(data.specialConditions ?? [])]) {
    if (['forfeit deposit', 'no refund', 'waive rights'].some(keyword => term.toLowerCase().includes(keyword))) {
      flags.push({ type: 'warning', message: 'This clause requires legal review; automated checks cannot determine its enforceability.', clause: term })
    }
  }
  return flags
}
