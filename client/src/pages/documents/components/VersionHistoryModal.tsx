import { useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/utils'
import { Upload, Download, History } from 'lucide-react'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Document, DocumentVersion } from '../types'
import { CATEGORY_CONFIG, getFileIcon } from '../documentConfig'

interface VersionHistoryModalProps {
  doc: Document
  onClose: () => void
}

export function VersionHistoryModal({ doc, onClose }: VersionHistoryModalProps) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: versions, isLoading } = useQuery({
    queryKey: ['document-versions', doc.id],
    queryFn: () => api.get<DocumentVersion[]>(`/documents/${doc.id}/versions`),
  })

  const uploadVersion = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.upload(`/documents/${doc.id}/version`, formData)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-versions', doc.id] })
      qc.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  return (
    <Modal open onClose={onClose} title={`Version History`} className="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border/30 dark:border-[#252a3a]/30">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${CATEGORY_CONFIG[doc.category]?.bg ?? 'bg-gray-500/10'} flex items-center justify-center`}>
              {getFileIcon(doc.mimeType, 16)}
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-dark dark:text-white truncate">{doc.name}</p>
              <p className="text-xs text-muted dark:text-gray-400">Track changes across versions</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadVersion.mutate(f)
              e.target.value = ''
            }}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadVersion.isPending}>
            <Upload size={14} /> {uploadVersion.isPending ? 'Uploading...' : 'New Version'}
          </Button>
        </div>

        {uploadVersion.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(uploadVersion.error as Error).message}</div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-surface dark:bg-[#0c0e1a] animate-pulse" />)}
          </div>
        ) : (versions?.length ?? 0) === 0 ? (
          <EmptyState preset="general" icon={<History size={40} />} title="No version history available." compact />
        ) : (
          <div className="space-y-2">
            {(versions ?? []).map((v, i) => (
              <div key={v.id ?? i} className="flex items-center justify-between rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border/30 dark:border-[#252a3a]/30 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-blue-500/15 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary dark:text-blue-400">v{v.version ?? i + 1}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary-dark dark:text-white">Version {v.version ?? i + 1}</p>
                    <p className="text-xs text-muted dark:text-gray-400">{formatDate(v.createdAt)}</p>
                  </div>
                </div>
                {v.fileUrl && (
                  <a href={v.fileUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm"><Download size={14} /></Button>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
