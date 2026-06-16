export function formatCurrency(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatCompact(amount: number): string {
  if (amount >= 1_000_000) return `GH₵${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`
  if (amount >= 10_000) return `GH₵${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}K`
  if (amount >= 1_000) return `GH₵${amount.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`
  return `GH₵${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
