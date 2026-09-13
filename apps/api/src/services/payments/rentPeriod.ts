export interface RentPeriod { startDate: string; endDate: string }
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
/** Inclusive dates explicitly selected by the payer; no inference from amount or paidAt. */
export function rentPeriodError(period: RentPeriod, agreement?: RentPeriod): string | null {
  if (!validDate(period.startDate) || !validDate(period.endDate) || period.endDate < period.startDate) return 'Choose valid rent-period dates, with the end on or after the start.'
  if (agreement && (!validDate(agreement.startDate) || !validDate(agreement.endDate) || period.startDate < agreement.startDate || period.endDate > agreement.endDate)) return 'The rent period must fall within the agreement dates.'
  return null
}
