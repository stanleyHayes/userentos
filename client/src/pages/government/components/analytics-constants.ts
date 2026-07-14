export const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6']

export const STATUS_COLORS: Record<string, string> = {
  filed: '#f59e0b', under_mediation: '#3b82f6', escalated: '#ef4444', resolved: '#10b981', closed: '#6b7280',
  pending: '#f59e0b', processing: '#3b82f6', completed: '#10b981', failed: '#ef4444', refunded: '#8b5cf6',
  active: '#10b981', approved: '#3b82f6', rejected: '#ef4444', withdrawn: '#6b7280',
  draft: '#94a3b8', pending_signatures: '#f59e0b', expired: '#6b7280', terminated: '#ef4444', disputed: '#f97316',
  available: '#10b981', occupied: '#3b82f6', under_dispute: '#ef4444', maintenance_required: '#f59e0b',
  pending_review: '#f59e0b', matured: '#10b981', repaid: '#10b981', defaulted: '#ef4444',
  paused: '#94a3b8', cancelled: '#6b7280', accepted: '#10b981', revoked: '#ef4444',
}

export const tooltipStyle = { background: '#161927', border: '1px solid #252a3a', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }

export function num(v: unknown): string {
  return Number(v ?? 0).toLocaleString()
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}
