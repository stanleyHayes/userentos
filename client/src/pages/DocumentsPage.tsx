import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ListSkeleton } from '@/components/ui/Skeleton'
import {
  Plus, FileText, Trash2, Clock, HardDrive,
  FolderOpen, Search,
} from 'lucide-react'
import { DoodleStars } from '@/components/ui/Doodles'
import { IconWatermark } from '@/components/ui/Watermark'
import type { Document, DocumentsResponse } from './documents/types'
import { formatFileSize } from './documents/documentConfig'
import { StatCard } from './documents/components/StatCard'
import { DocumentsToolbar } from './documents/components/DocumentsToolbar'
import { DocumentGridCard } from './documents/components/DocumentGridCard'
import { DocumentListItem } from './documents/components/DocumentListItem'
import { UploadModal } from './documents/components/UploadModal'
import { VersionHistoryModal } from './documents/components/VersionHistoryModal'
import { AuditLogModal } from './documents/components/AuditLogModal'

export function DocumentsPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [showUpload, setShowUpload] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [versionTarget, setVersionTarget] = useState<Document | null>(null)
  const [auditTarget, setAuditTarget] = useState<Document | null>(null)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const perPage = 12

  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<DocumentsResponse>('/documents'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      setDeleteTarget(null)
    },
  })

  const allDocuments = useMemo(() => data?.items ?? [], [data?.items])

  const filtered = useMemo(() => {
    let docs = allDocuments
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      docs = docs.filter((d) => d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
    }
    if (filterCategory !== 'all') {
      docs = docs.filter((d) => d.category === filterCategory)
    }
    return docs
  }, [allDocuments, searchQuery, filterCategory])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  // Category stats
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    allDocuments.forEach((d) => {
      counts[d.category] = (counts[d.category] ?? 0) + 1
    })
    return counts
  }, [allDocuments])

  const totalSize = useMemo(() => allDocuments.reduce((sum, d) => sum + (d.fileSize || 0), 0), [allDocuments])

  const recentCount = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- "now" is intentionally captured at memo time
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return allDocuments.filter((d) => new Date(d.createdAt).getTime() >= cutoff).length
  }, [allDocuments])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white">
            <FolderOpen size={20} />
          </div>
          <div className="relative overflow-hidden">
            <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
            <IconWatermark icon={FileText} className="right-10 top-1/2 size-28 -translate-y-1/2 rotate-[-8deg]" />
            <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
              Documents
            </h1>
            <p className="text-xs text-muted dark:text-gray-400">Manage your rental documents and files</p>
          </div>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Plus size={16} />
          Upload
        </Button>
      </div>

      {/* Stats Strip */}
      {allDocuments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Documents"
            value={String(allDocuments.length)}
            icon={<FileText size={16} />}
            color="text-blue-500 dark:text-blue-400"
            bg="bg-blue-500/10"
          />
          <StatCard
            label="Storage Used"
            value={formatFileSize(totalSize)}
            icon={<HardDrive size={16} />}
            color="text-emerald-500"
            bg="bg-emerald-500/10"
          />
          <StatCard
            label="Categories"
            value={String(Object.keys(categoryCounts).length)}
            icon={<FolderOpen size={16} />}
            color="text-amber-500"
            bg="bg-amber-500/10"
          />
          <StatCard
            label="Recent (7d)"
            value={String(recentCount)}
            icon={<Clock size={16} />}
            color="text-violet-500"
            bg="bg-violet-500/10"
          />
        </div>
      )}

      {isLoading ? (
        <ListSkeleton />
      ) : allDocuments.length === 0 ? (
        <EmptyState
          preset="general"
          title="No documents yet"
          description="Upload your rental documents, receipts, and agreements to keep them organized and accessible."
          icon={<FileText size={40} />}
          action={{ label: 'Upload Document', onClick: () => setShowUpload(true) }}
        />
      ) : (
        <>
          {/* Toolbar */}
          <DocumentsToolbar
            searchQuery={searchQuery}
            onSearchChange={(value) => { setSearchQuery(value); setPage(1) }}
            filterCategory={filterCategory}
            onFilterCategoryChange={(value) => { setFilterCategory(value); setPage(1) }}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(!showFilters)}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            categoryCounts={categoryCounts}
            totalCount={allDocuments.length}
          />

          {/* Results info */}
          {(searchQuery || filterCategory !== 'all') && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted dark:text-gray-400">
                {filtered.length} {filtered.length === 1 ? 'document' : 'documents'} found
                {searchQuery && <> matching "<span className="font-medium text-primary-dark dark:text-white">{searchQuery}</span>"</>}
              </p>
              {(searchQuery || filterCategory !== 'all') && (
                <button
                  onClick={() => { setSearchQuery(''); setFilterCategory('all'); setPage(1) }}
                  className="text-xs text-primary dark:text-blue-400 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <Card className="!py-12">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-xl bg-surface dark:bg-[#0c0e1a] flex items-center justify-center mb-3">
                  <Search size={20} className="text-muted dark:text-gray-500" />
                </div>
                <p className="text-sm font-semibold text-primary-dark dark:text-white">No documents match your search</p>
                <p className="text-xs text-muted dark:text-gray-400 mt-1">Try a different keyword or remove filters</p>
              </div>
            </Card>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginated.map((doc) => (
                <DocumentGridCard
                  key={doc.id}
                  doc={doc}
                  isOwner={doc.userId === user?.id}
                  menuOpen={activeMenu === doc.id}
                  onToggleMenu={() => setActiveMenu(activeMenu === doc.id ? null : doc.id)}
                  onVersions={() => { setVersionTarget(doc); setActiveMenu(null) }}
                  onAudit={() => { setAuditTarget(doc); setActiveMenu(null) }}
                  onDelete={() => { setDeleteTarget(doc); setActiveMenu(null) }}
                  onCloseMenu={() => setActiveMenu(null)}
                />
              ))}
            </div>
          ) : (
            /* List View */
            <div className="space-y-2">
              {paginated.map((doc) => (
                <DocumentListItem
                  key={doc.id}
                  doc={doc}
                  isOwner={doc.userId === user?.id}
                  menuOpen={activeMenu === doc.id}
                  onToggleMenu={() => setActiveMenu(activeMenu === doc.id ? null : doc.id)}
                  onVersions={() => { setVersionTarget(doc); setActiveMenu(null) }}
                  onAudit={() => { setAuditTarget(doc); setActiveMenu(null) }}
                  onDelete={() => { setDeleteTarget(doc); setActiveMenu(null) }}
                  onCloseMenu={() => setActiveMenu(null)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted dark:text-gray-400">
                Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                          page === p
                            ? 'bg-primary dark:bg-blue-500 text-white'
                            : 'text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#0c0e1a]'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} />

      {versionTarget && (
        <VersionHistoryModal doc={versionTarget} onClose={() => setVersionTarget(null)} />
      )}

      {auditTarget && (
        <AuditLogModal doc={auditTarget} onClose={() => setAuditTarget(null)} />
      )}

      {deleteTarget && (
        <Modal open onClose={() => setDeleteTarget(null)} title="Delete Document">
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-danger/5 border border-danger/20">
              <div className="w-10 h-10 rounded-lg bg-danger/10 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-danger" />
              </div>
              <div>
                <p className="text-sm font-semibold text-primary-dark dark:text-white">{deleteTarget.name}</p>
                <p className="text-xs text-muted dark:text-gray-400">{formatFileSize(deleteTarget.fileSize)}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            {deleteMutation.isError && (
              <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
                {(deleteMutation.error as Error).message}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Backdrop for closing context menus */}
      {activeMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setActiveMenu(null)} />
      )}
    </div>
  )
}
