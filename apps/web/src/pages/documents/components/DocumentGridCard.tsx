import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { MoreVertical, HardDrive, Clock, Download } from 'lucide-react'
import type { Document } from '../types'
import { CATEGORY_CONFIG, CATEGORY_BADGE, categoryOptions, getFileIcon, formatFileSize, getCategoryGradient } from '../documentConfig'
import { DocContextMenu } from './DocContextMenu'

interface DocumentGridCardProps {
  doc: Document
  isOwner: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onVersions: () => void
  onAudit: () => void
  onDelete: () => void
  onCloseMenu: () => void
}

export function DocumentGridCard({
  doc,
  isOwner,
  menuOpen,
  onToggleMenu,
  onVersions,
  onAudit,
  onDelete,
  onCloseMenu,
}: DocumentGridCardProps) {
  return (
    <Card
      className="group hover:border-primary/30 dark:hover:border-blue-500/30 hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-black/30 transition-all cursor-default overflow-hidden"
    >
      <CardContent>
        {/* Category color bar */}
        <div className={`-mx-4 -mt-4 mb-4 h-1 ${CATEGORY_CONFIG[doc.category]?.bg ?? 'bg-gray-500/10'}`}
          style={{ background: `linear-gradient(90deg, ${getCategoryGradient(doc.category)})` }}
        />

        <div className="flex items-start justify-between mb-3">
          <div className={`w-11 h-11 rounded-xl ${CATEGORY_CONFIG[doc.category]?.bg ?? 'bg-gray-500/10'} flex items-center justify-center`}>
            {getFileIcon(doc.mimeType)}
          </div>
          <div className="relative">
            <button
              onClick={onToggleMenu}
              className="p-1.5 rounded-lg text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a] hover:text-primary-dark dark:hover:text-white transition-colors"
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <DocContextMenu
                doc={doc}
                isOwner={isOwner}
                onVersions={onVersions}
                onAudit={onAudit}
                onDelete={onDelete}
                onClose={onCloseMenu}
              />
            )}
          </div>
        </div>

        <h3 className="text-sm font-semibold text-primary-dark dark:text-white truncate mb-1" title={doc.name}>
          {doc.name}
        </h3>

        <div className="flex items-center gap-2 mb-3">
          <Badge variant={CATEGORY_BADGE[doc.category] ?? 'muted'} className="text-[10px]">
            {categoryOptions.find((c) => c.value === doc.category)?.label ?? doc.category}
          </Badge>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border/40 dark:border-[#252a3a]/40">
          <div className="flex items-center gap-3 text-[10px] text-muted dark:text-gray-500">
            <span className="flex items-center gap-1"><HardDrive size={10} /> {formatFileSize(doc.fileSize)}</span>
            <span className="flex items-center gap-1"><Clock size={10} /> {formatDate(doc.createdAt)}</span>
          </div>
          {doc.url && (
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-primary dark:text-blue-400 hover:text-primary-dark dark:hover:text-blue-300 transition-colors">
              <Download size={14} />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
