import { Card } from '@/components/ui/Card'
import { Search, X, Filter, ChevronDown, Grid3X3, List } from 'lucide-react'
import { categoryOptions } from '../documentConfig'

interface DocumentsToolbarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  filterCategory: string
  onFilterCategoryChange: (value: string) => void
  showFilters: boolean
  onToggleFilters: () => void
  viewMode: 'list' | 'grid'
  onViewModeChange: (mode: 'list' | 'grid') => void
  categoryCounts: Record<string, number>
  totalCount: number
}

export function DocumentsToolbar({
  searchQuery,
  onSearchChange,
  filterCategory,
  onFilterCategoryChange,
  showFilters,
  onToggleFilters,
  viewMode,
  onViewModeChange,
  categoryCounts,
  totalCount,
}: DocumentsToolbarProps) {
  return (
    <Card className="!p-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted dark:text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border/60 dark:border-[#252a3a]/60 bg-surface dark:bg-[#0c0e1a] text-primary-dark dark:text-white placeholder:text-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 dark:focus:ring-blue-500/30 transition-all"
          />
          {searchQuery && (
            <button onClick={() => onSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary-dark dark:hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Category Filter */}
          <button
            onClick={onToggleFilters}
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
              onClick={() => onViewModeChange('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400' : 'text-muted dark:text-gray-500 hover:bg-surface dark:hover:bg-[#0c0e1a]'}`}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => onViewModeChange('grid')}
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
            onClick={() => onFilterCategoryChange('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filterCategory === 'all'
                ? 'bg-primary dark:bg-blue-500 text-white'
                : 'bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white border border-border/40 dark:border-[#252a3a]/40'
            }`}
          >
            All ({totalCount})
          </button>
          {categoryOptions.map((cat) => {
            const count = categoryCounts[cat.value] ?? 0
            if (count === 0) return null
            return (
              <button
                key={cat.value}
                onClick={() => onFilterCategoryChange(cat.value)}
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
  )
}
