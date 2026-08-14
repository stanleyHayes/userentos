import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/utils'
import { Shield } from 'lucide-react'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import type { Document, AuditLog } from '../types'
import { CATEGORY_CONFIG, getFileIcon } from '../documentConfig'

interface AuditLogModalProps {
  doc: Document
  onClose: () => void
}

export function AuditLogModal({ doc, onClose }: AuditLogModalProps) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['document-audit', doc.id],
    queryFn: () => api.get<AuditLog[]>(`/documents/${doc.id}/audit`),
  })

  return (
    <Modal open onClose={onClose} title={`Audit Log`} className="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border/30 dark:border-[#252a3a]/30">
          <div className={`w-9 h-9 rounded-lg ${CATEGORY_CONFIG[doc.category]?.bg ?? 'bg-gray-500/10'} flex items-center justify-center`}>
            {getFileIcon(doc.mimeType, 16)}
          </div>
          <div>
            <p className="text-sm font-semibold text-primary-dark dark:text-white truncate">{doc.name}</p>
            <p className="text-xs text-muted dark:text-gray-400">All recorded activity</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-surface dark:bg-[#0c0e1a] animate-pulse" />)}
          </div>
        ) : (logs?.length ?? 0) === 0 ? (
          <EmptyState preset="general" icon={<Shield size={40} />} title="No audit entries found." compact />
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[18px] top-3 bottom-3 w-px bg-border/60 dark:border-[#252a3a]/60" />
            <div className="space-y-3">
              {(logs ?? []).map((log, i) => (
                <div key={log.id ?? i} className="flex gap-3 relative">
                  <div className="w-9 h-9 rounded-full bg-surface dark:bg-[#0c0e1a] border-2 border-border/60 dark:border-[#252a3a]/60 flex items-center justify-center flex-shrink-0 z-10">
                    <div className="w-2 h-2 rounded-full bg-primary dark:bg-blue-400" />
                  </div>
                  <div className="flex-1 rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border/30 dark:border-[#252a3a]/30 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-primary-dark dark:text-white capitalize">{log.action}</p>
                      <p className="text-[10px] text-muted dark:text-gray-500">{formatDate(log.createdAt)}</p>
                    </div>
                    {log.details && <p className="text-xs text-muted dark:text-gray-400 mt-1">{log.details}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
