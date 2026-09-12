import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ACCENT_HEX: Record<string, string> = {
  blue: '#2563eb', primary: '#2563eb',
  emerald: '#059669', green: '#059669',
  amber: '#d97706', yellow: '#d97706', orange: '#d97706',
  red: '#dc2626', rose: '#dc2626',
  purple: '#7c3aed', violet: '#7c3aed',
  indigo: '#4f46e5',
  pink: '#db2777',
  cyan: '#0891b2', teal: '#0891b2',
  slate: '#64748b', gray: '#64748b',
}

/** Map a Tailwind color class or gradient string (e.g. `text-emerald-500`, `from-blue-500 to-indigo-600`) to a single accent hex. */
export function accentFromColorClass(value: string): string {
  const match = value.match(/(?:from|text)-([a-z]+)-/)?.[1]
  return (match && ACCENT_HEX[match]) || '#2563eb'
}

export function formatCurrency(amount: number, currency = 'GHS'): string {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** A bare calendar date from the API, e.g. "2026-09-12". */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'

  /*
   * A date-only string is parsed by JS as UTC midnight, so formatting it in a
   * timezone behind UTC renders the PREVIOUS day — a lease starting on the 1st
   * shows as the 31st. A bare calendar date has no timezone to convert, so it
   * is formatted as-is; a real timestamp still renders in the viewer's zone,
   * which is what they want for "when did this happen".
   */
  const isDateOnly = typeof date === 'string' && DATE_ONLY.test(date)

  return new Intl.DateTimeFormat('en-GH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(isDateOnly ? { timeZone: 'UTC' } : {}),
  }).format(d)
}
