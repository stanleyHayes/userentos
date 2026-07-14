import { FileText, Image, File, FileSpreadsheet, FileArchive, Shield, Eye } from 'lucide-react'

export const categoryOptions = [
  { value: 'lease', label: 'Lease Agreement' },
  { value: 'identity', label: 'Identity Document' },
  { value: 'receipt', label: 'Payment Receipt' },
  { value: 'inspection', label: 'Inspection Report' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
]

export const CATEGORY_CONFIG: Record<string, { color: string; bg: string; icon: typeof FileText }> = {
  lease: { color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500/10', icon: FileText },
  identity: { color: 'text-violet-500 dark:text-violet-400', bg: 'bg-violet-500/10', icon: Shield },
  receipt: { color: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-500/10', icon: FileText },
  inspection: { color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500/10', icon: Eye },
  correspondence: { color: 'text-cyan-500 dark:text-cyan-400', bg: 'bg-cyan-500/10', icon: FileText },
  other: { color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-500/10', icon: File },
}

export const CATEGORY_BADGE: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  lease: 'default',
  identity: 'warning',
  receipt: 'success',
  inspection: 'warning',
  correspondence: 'default',
  other: 'muted',
}

export function getFileIcon(mimeType: string, size = 20) {
  if (mimeType?.startsWith('image/')) return <Image size={size} className="text-blue-500 dark:text-blue-400" />
  if (mimeType === 'application/pdf') return <FileText size={size} className="text-red-500 dark:text-red-400" />
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('csv')) return <FileSpreadsheet size={size} className="text-green-500 dark:text-green-400" />
  if (mimeType?.includes('zip') || mimeType?.includes('archive')) return <FileArchive size={size} className="text-amber-500 dark:text-amber-400" />
  return <File size={size} className="text-gray-500 dark:text-gray-400" />
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getCategoryGradient(category: string): string {
  const gradients: Record<string, string> = {
    lease: '#3b82f6, #6366f1',
    identity: '#8b5cf6, #a855f7',
    receipt: '#10b981, #06b6d4',
    inspection: '#f59e0b, #ef4444',
    correspondence: '#06b6d4, #3b82f6',
    other: '#6b7280, #9ca3af',
  }
  return gradients[category] ?? gradients.other
}
