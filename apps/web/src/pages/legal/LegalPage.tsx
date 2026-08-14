import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { LegalAssistant } from './LegalAssistant'
import { useLegalArticles } from '@/hooks/useApi'
import { formatDate } from '@/lib/utils'
import { Scale, Search, BookOpen, MessageSquare } from 'lucide-react'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { LegalArticle } from '@/types'
import { DoodleUnderline } from '@/components/ui/Doodles'

const categories = [
  { name: 'Rent Control Act', icon: <Scale size={20} /> },
  { name: 'Tenant Rights', icon: <BookOpen size={20} /> },
  { name: 'Landlord Obligations', icon: <BookOpen size={20} /> },
  { name: 'Eviction Laws', icon: <Scale size={20} /> },
  { name: 'Rent Advance Limits', icon: <Scale size={20} /> },
  { name: 'Dispute Resolution', icon: <MessageSquare size={20} /> },
]

export function LegalPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>()
  const [selectedArticle, setSelectedArticle] = useState<LegalArticle | null>(null)
  const [showAssistant, setShowAssistant] = useState(false)

  const { data, isLoading } = useLegalArticles({
    search: search || undefined,
    category,
  })
  const articles = data?.items ?? []

  if (showAssistant) {
    return <LegalAssistant onBack={() => setShowAssistant(false)} />
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative">
          <DoodleUnderline className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
          <h1 className="text-2xl font-bold text-primary-dark dark:text-white">Rental Laws</h1>
          <p className="text-sm text-muted mt-1">Ghana's complete rental law repository</p>
        </div>
        <Button variant="secondary" onClick={() => setShowAssistant(true)} className="w-full sm:w-auto">
          <MessageSquare size={16} />
          AI Legal Assistant
        </Button>
      </div>

      <TextField
        type="text"
        placeholder="Search rental laws, regulations, FAQs..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> }, inputLabel: { shrink: true } }}
        fullWidth
      />

      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide lg:grid lg:grid-cols-6 lg:overflow-visible">
        {categories.map((cat) => (
          <Card
            key={cat.name}
            className={`shrink-0 w-36 lg:w-auto cursor-pointer transition-colors ${category === cat.name ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
            onClick={() => setCategory(category === cat.name ? undefined : cat.name)}
          >
            <CardContent className="text-center">
              <div className="flex justify-center text-primary dark:text-blue-400 mb-2">{cat.icon}</div>
              <p className="text-xs font-medium text-primary-dark dark:text-white">{cat.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {category ? `${category} Articles` : 'All Articles'}
            {category && (
              <button onClick={() => setCategory(undefined)} className="ml-2 text-xs text-muted hover:text-primary dark:hover:text-blue-400 font-normal">
                (clear filter)
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : articles.length === 0 ? (
            <EmptyState preset="search" title="No articles found" description="Try a different search or category." />
          ) : (
            <div className="space-y-3">
              {articles.map((article) => (
                <div
                  key={article.id}
                  className="flex items-center justify-between py-3 border-b border-border dark:border-[#252a3a] last:border-0 cursor-pointer hover:bg-surface dark:hover:bg-[#0c0e1a] -mx-2 px-2 rounded"
                  onClick={() => setSelectedArticle(article)}
                >
                  <div>
                    <h3 className="text-sm font-medium text-primary-dark dark:text-white">{article.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="default">{article.category}</Badge>
                      <span className="text-xs text-muted">{article.lawReference}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="muted">{article.language === 'en' ? 'English' : article.language}</Badge>
                    <p className="text-xs text-muted mt-1">{formatDate(article.effectiveDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedArticle && (
        <Modal open onClose={() => setSelectedArticle(null)} title={selectedArticle.title} className="max-w-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="default">{selectedArticle.category}</Badge>
              <Badge variant="muted">{selectedArticle.lawReference}</Badge>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-primary-dark dark:text-white mb-2">Simplified Explanation</h3>
              <div className="rounded-md bg-accent/5 dark:bg-accent/10 border border-accent/20 p-4 text-sm text-gray-700 dark:text-gray-200">
                {selectedArticle.simplifiedContent}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-primary-dark dark:text-white mb-2">Full Text</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{selectedArticle.content}</p>
            </div>

            <div className="flex flex-wrap gap-1">
              {selectedArticle.tags.map((tag) => (
                <Badge key={tag} variant="muted" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
