export function formatCurrency(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatCompact(amount: number): string {
  if (amount >= 1_000_000) return `GH₵${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`
  if (amount >= 10_000) return `GH₵${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}K`
  if (amount >= 1_000) return `GH₵${amount.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`
  return `GH₵${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** A bare calendar date from the API, e.g. "2026-09-12". */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function formatDate(date: string | undefined | null): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'

  /*
   * A date-only string is parsed as UTC midnight, so rendering it in the
   * device's timezone shows the PREVIOUS day west of UTC — a lease starting on
   * the 1st reads as the 31st. It matters more here than on the web: a phone
   * travels. A bare calendar date has no timezone to convert; a real timestamp
   * still renders locally, which is what "when did this happen" wants.
   */
  return d.toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(DATE_ONLY.test(date) ? { timeZone: 'UTC' } : {}),
  })
}
