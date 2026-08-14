import { Download, History, Shield, Trash2 } from 'lucide-react'
import type { Document } from '../types'

interface DocContextMenuProps {
  doc: Document
  isOwner: boolean
  onVersions: () => void
  onAudit: () => void
  onDelete: () => void
  onClose: () => void
}

export function DocContextMenu({ doc, isOwner, onVersions, onAudit, onDelete, onClose }: DocContextMenuProps) {
  return (
    <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] shadow-xl dark:shadow-black/40 z-40 overflow-hidden py-1">
      {doc.url && (
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2 text-xs text-primary-dark dark:text-gray-300 hover:bg-surface dark:hover:bg-[#0c0e1a] transition-colors"
          onClick={onClose}
        >
          <Download size={14} /> Download
        </a>
      )}
      <button onClick={onVersions} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-primary-dark dark:text-gray-300 hover:bg-surface dark:hover:bg-[#0c0e1a] transition-colors">
        <History size={14} /> Version History
      </button>
      <button onClick={onAudit} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-primary-dark dark:text-gray-300 hover:bg-surface dark:hover:bg-[#0c0e1a] transition-colors">
        <Shield size={14} /> Audit Log
      </button>
      {isOwner && (
        <>
          <div className="my-1 border-t border-border/40 dark:border-[#252a3a]/40" />
          <button onClick={onDelete} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-danger hover:bg-danger/5 transition-colors">
            <Trash2 size={14} /> Delete
          </button>
        </>
      )}
    </div>
  )
}
