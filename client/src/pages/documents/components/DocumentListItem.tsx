import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { MoreVertical, HardDrive, Clock, Download, History, Shield, Trash2 } from 'lucide-react'
import type { Document } from '../types'
import { CATEGORY_CONFIG, CATEGORY_BADGE, categoryOptions, getFileIcon, formatFileSize, getCategoryGradient } from '../documentConfig'
import { DocContextMenu } from './DocContextMenu'

interface DocumentListItemProps {
  doc: Document
  isOwner: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onVersions: () => void
  onAudit: () => void
  onDelete: () => void
  onCloseMenu: () => void
}

export function DocumentListItem({
  doc,
  isOwner,
  menuOpen,
  onToggleMenu,
  onVersions,
  onAudit,
  onDelete,
  onCloseMenu,
}: DocumentListItemProps) {
  return (
    <Card className="group hover:border-primary/30 dark:hover:border-blue-500/30 transition-colors !p-0 overflow-hidden">
      <div className="flex items-center gap-4 p-3 sm:p-4">
        {/* Category indicator line */}
        <div className="hidden sm:block w-1 self-stretch -my-4 -ml-4 rounded-l-2xl flex-shrink-0"
          style={{ background: `linear-gradient(180deg, ${getCategoryGradient(doc.category)})` }}
        />

        <div className={`flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0 ${CATEGORY_CONFIG[doc.category]?.bg ?? 'bg-gray-500/10'}`}>
          {getFileIcon(doc.mimeType)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-primary-dark dark:text-white truncate">{doc.name}</h3>
            <Badge variant={CATEGORY_BADGE[doc.category] ?? 'muted'} className="text-[10px] hidden sm:inline-flex flex-shrink-0">
              {categoryOptions.find((c) => c.value === doc.category)?.label ?? doc.category}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted dark:text-gray-400">
            <span className="flex items-center gap-1"><HardDrive size={10} /> {formatFileSize(doc.fileSize)}</span>
            <span className="flex items-center gap-1"><Clock size={10} /> {formatDate(doc.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {doc.url && (
            <a href={doc.url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="!p-2"><Download size={14} /></Button>
            </a>
          )}
          <Button variant="outline" size="sm" className="!p-2 hidden sm:flex" onClick={onVersions} title="Version History">
            <History size={14} />
          </Button>
          <Button variant="outline" size="sm" className="!p-2 hidden sm:flex" onClick={onAudit} title="Audit Log">
            <Shield size={14} />
          </Button>
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              className="!p-2 text-danger hidden sm:flex"
              onClick={onDelete}
            >
              <Trash2 size={14} />
            </Button>
          )}
          {/* Mobile menu */}
          <div className="relative sm:hidden">
            <button
              onClick={onToggleMenu}
              className="p-2 rounded-lg text-muted hover:bg-surface dark:hover:bg-[#0c0e1a] transition-colors"
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
      </div>
    </Card>
  )
}
