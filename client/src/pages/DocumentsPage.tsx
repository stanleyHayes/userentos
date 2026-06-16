import { useState, useRef, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  Plus, FileText, Image, File, Trash2, Download, Upload,
  FileSpreadsheet, FileArchive, Clock, HardDrive, History, Shield,
  FolderOpen, Search, Grid3X3, List, Filter, ChevronDown,
  MoreVertical, Eye, X,
} from 'lucide-react'
import { DoodleStars } from '@/components/ui/Doodles'

interface Document {
  id: string
  userId: string
  name: string
  type: string
  mimeType: string
  fileSize: number
  url: string
  category: string
  createdAt: string
}

interface DocumentsResponse {
  items: Document[]
  total: number
}

interface DocumentVersion {
  id: string
  version?: number
  createdAt: string
  fileUrl?: string
}

interface AuditLog {
  id: string
  action: string
  createdAt: string
  details?: string
}

const categoryOptions = [
  { value: 'lease', label: 'Lease Agreement' },
  { value: 'identity', label: 'Identity Document' },
  { value: 'receipt', label: 'Payment Receipt' },
  { value: 'inspection', label: 'Inspection Report' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; icon: typeof FileText }> = {
  lease: { color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500/10', icon: FileText },
  identity: { color: 'text-violet-500 dark:text-violet-400', bg: 'bg-violet-500/10', icon: Shield },
  receipt: { color: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-500/10', icon: FileText },
  inspection: { color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500/10', icon: Eye },
  correspondence: { color: 'text-cyan-500 dark:text-cyan-400', bg: 'bg-cyan-500/10', icon: FileText },
  other: { color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-500/10', icon: File },
}

const CATEGORY_BADGE: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  lease: 'default',
  identity: 'warning',
  receipt: 'success',
  inspection: 'warning',
  correspondence: 'default',
  other: 'muted',
}

function getFileIcon(mimeType: string, size = 20) {
  if (mimeType?.startsWith('image/')) return <Image size={size} className="text-blue-500 dark:text-blue-400" />
  if (mimeType === 'application/pdf') return <FileText size={size} className="text-red-500 dark:text-red-400" />
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('csv')) return <FileSpreadsheet size={size} className="text-green-500 dark:text-green-400" />
  if (mimeType?.includes('zip') || mimeType?.includes('archive')) return <FileArchive size={size} className="text-amber-500 dark:text-amber-400" />
  return <File size={size} className="text-gray-500 dark:text-gray-400" />
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
          <div className="relative">
            <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
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
          <Card className="!p-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted dark:text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                  placeholder="Search documents..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border/60 dark:border-[#252a3a]/60 bg-surface dark:bg-[#0c0e1a] text-primary-dark dark:text-white placeholder:text-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 dark:focus:ring-blue-500/30 transition-all"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setPage(1) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary-dark dark:hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Category Filter */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    filterCategory !== 'all'
                      ? 'border-primary/40 dark:border-blue-500/40 bg-primary/5 dark:bg-blue-500/10 text-primary dark:text-blue-400'
                      : 'border-border/60 dark:border-[#252a3a]/60 text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#0c0e1a]'
                  }`}
                >
                  <Filter size={14} />
                  {filterCategory !== 'all' ? categoryOptions.find((c) => c.value === filterCategory)?.label : 'Filter'}
                  <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>

                {/* View Toggle */}
                <div className="flex items-center rounded-lg border border-border/60 dark:border-[#252a3a]/60 overflow-hidden">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400' : 'text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a]'}`}
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400' : 'text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a]'}`}
                  >
                    <Grid3X3 size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Chips */}
            {showFilters && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/40 dark:border-[#252a3a]/40">
                <button
                  onClick={() => { setFilterCategory('all'); setPage(1) }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    filterCategory === 'all'
                      ? 'bg-primary dark:bg-blue-500 text-white'
                      : 'bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white border border-border/40 dark:border-[#252a3a]/40'
                  }`}
                >
                  All ({allDocuments.length})
                </button>
                {categoryOptions.map((cat) => {
                  const count = categoryCounts[cat.value] ?? 0
                  if (count === 0) return null
                  return (
                    <button
                      key={cat.value}
                      onClick={() => { setFilterCategory(cat.value); setPage(1) }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                        filterCategory === cat.value
                          ? 'bg-primary dark:bg-blue-500 text-white'
                          : 'bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white border border-border/40 dark:border-[#252a3a]/40'
                      }`}
                    >
                      {cat.label} ({count})
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

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
                <Card
                  key={doc.id}
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
                          onClick={() => setActiveMenu(activeMenu === doc.id ? null : doc.id)}
                          className="p-1.5 rounded-lg text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a] hover:text-primary-dark dark:hover:text-white transition-colors"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {activeMenu === doc.id && (
                          <DocContextMenu
                            doc={doc}
                            isOwner={doc.userId === user?.id}
                            onVersions={() => { setVersionTarget(doc); setActiveMenu(null) }}
                            onAudit={() => { setAuditTarget(doc); setActiveMenu(null) }}
                            onDelete={() => { setDeleteTarget(doc); setActiveMenu(null) }}
                            onClose={() => setActiveMenu(null)}
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
              ))}
            </div>
          ) : (
            /* List View */
            <div className="space-y-2">
              {paginated.map((doc) => (
                <Card key={doc.id} className="group hover:border-primary/30 dark:hover:border-blue-500/30 transition-colors !p-0 overflow-hidden">
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
                      <Button variant="outline" size="sm" className="!p-2 hidden sm:flex" onClick={() => setVersionTarget(doc)} title="Version History">
                        <History size={14} />
                      </Button>
                      <Button variant="outline" size="sm" className="!p-2 hidden sm:flex" onClick={() => setAuditTarget(doc)} title="Audit Log">
                        <Shield size={14} />
                      </Button>
                      {doc.userId === user?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!p-2 text-danger hidden sm:flex"
                          onClick={() => setDeleteTarget(doc)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                      {/* Mobile menu */}
                      <div className="relative sm:hidden">
                        <button
                          onClick={() => setActiveMenu(activeMenu === doc.id ? null : doc.id)}
                          className="p-2 rounded-lg text-muted hover:bg-surface dark:hover:bg-[#0c0e1a] transition-colors"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {activeMenu === doc.id && (
                          <DocContextMenu
                            doc={doc}
                            isOwner={doc.userId === user?.id}
                            onVersions={() => { setVersionTarget(doc); setActiveMenu(null) }}
                            onAudit={() => { setAuditTarget(doc); setActiveMenu(null) }}
                            onDelete={() => { setDeleteTarget(doc); setActiveMenu(null) }}
                            onClose={() => setActiveMenu(null)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
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

function getCategoryGradient(category: string): string {
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

function StatCard({ label, value, icon, color, bg }: {
  label: string; value: string; icon: React.ReactNode; color: string; bg: string
}) {
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center ${color} flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white truncate">{value}</p>
          <p className="text-[10px] text-muted dark:text-gray-500">{label}</p>
        </div>
      </div>
    </Card>
  )
}

function DocContextMenu({ doc, isOwner, onVersions, onAudit, onDelete, onClose }: {
  doc: Document; isOwner: boolean
  onVersions: () => void; onAudit: () => void; onDelete: () => void; onClose: () => void
}) {
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

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('other')
  const [name, setName] = useState('')
  const [dragActive, setDragActive] = useState(false)

  const uploadMutation = useMutation({
    mutationFn: async (payload: { file: File; name: string; category: string }) => {
      // Server route uses multer (upload.single('file')) and reads `type` from the
      // body — sending JSON made req.file undefined ("No file uploaded"). Use multipart.
      const formData = new FormData()
      formData.append('file', payload.file)
      formData.append('name', payload.name)
      formData.append('type', payload.category)
      return api.upload<Document>('/documents', formData)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      resetAndClose()
    },
  })

  function resetAndClose() {
    setFile(null)
    setCategory('other')
    setName('')
    setDragActive(false)
    onClose()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      if (!name) setName(f.name)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (f) {
      setFile(f)
      if (!name) setName(f.name)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    uploadMutation.mutate({ file, name: name || file.name, category })
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Upload Document">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Drop zone */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xls,.xlsx,.csv,.zip"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`w-full flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all cursor-pointer ${
              dragActive
                ? 'border-primary dark:border-blue-500 bg-primary/5 dark:bg-blue-500/10 scale-[1.01]'
                : file
                  ? 'border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/5'
                  : 'border-border dark:border-[#252a3a] bg-surface dark:bg-[#0c0e1a] hover:border-primary/50 dark:hover:border-blue-500/50'
            }`}
          >
            {file ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
                  {getFileIcon(file.type, 24)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">{file.name}</p>
                  <p className="text-xs text-muted dark:text-gray-400 mt-0.5">{formatFileSize(file.size)}</p>
                </div>
                <span className="text-[10px] text-primary dark:text-blue-400 font-medium">Click to change file</span>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 dark:bg-blue-500/15">
                  <Upload size={24} className="text-primary dark:text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">
                    {dragActive ? 'Drop your file here' : 'Drag & drop or click to browse'}
                  </p>
                  <p className="text-xs text-muted dark:text-gray-400 mt-0.5">PDF, images, documents, spreadsheets up to 10MB</p>
                </div>
              </>
            )}
          </button>
        </div>

        <div className="space-y-4">
          <Input
            id="doc-name"
            label="Document Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lease Agreement - January 2026"
            required
          />

          <Select
            id="doc-category"
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categoryOptions}
          />
        </div>

        {uploadMutation.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {(uploadMutation.error as Error).message}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button type="submit" disabled={!file || uploadMutation.isPending}>
            <Upload size={14} />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload Document'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function VersionHistoryModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
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
          <div className="flex flex-col items-center py-8 text-center">
            <History size={24} className="text-muted dark:text-gray-600 mb-2" />
            <p className="text-sm text-muted dark:text-gray-500">No version history available.</p>
          </div>
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

function AuditLogModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
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
          <div className="flex flex-col items-center py-8 text-center">
            <Shield size={24} className="text-muted dark:text-gray-600 mb-2" />
            <p className="text-sm text-muted dark:text-gray-500">No audit entries found.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[18px] top-3 bottom-3 w-px bg-border/60 dark:bg-[#252a3a]/60" />
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
