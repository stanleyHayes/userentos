import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { MarkdownEditor } from '@/components/ui/MarkdownEditor'
import { api } from '@/lib/api'
import { ArrowLeft, Save, Send, Loader2 } from 'lucide-react'
import { FormSkeleton } from '@/components/ui/Skeleton'
import TextField from '@mui/material/TextField'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  author: string
  coverImage?: string
  tags: string[]
  status?: 'draft' | 'published'
  createdAt: string
}

export function BlogEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditing = Boolean(id)

  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')

  // Load existing post when editing
  const { data: existingPost, isLoading } = useQuery({
    queryKey: ['blog-post', id],
    queryFn: () => api.get<BlogPost>(`/blog/${id}`),
    enabled: isEditing,
  })

  // Hydrate form fields from the loaded post on initial fetch.
  // React's "reset state on identity change" pattern — runs during render only when id changes.
  const [hydratedFromId, setHydratedFromId] = useState<string | null>(null)
  if (existingPost && hydratedFromId !== existingPost.id) {
    setHydratedFromId(existingPost.id)
    setTitle(existingPost.title)
    setExcerpt(existingPost.excerpt)
    setContent(existingPost.content)
    setTags(existingPost.tags?.join(', ') ?? '')
    setCoverImage(existingPost.coverImage ?? '')
    setStatus(existingPost.status ?? 'published')
  }

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (isEditing) {
        return api.patch(`/blog/${id}`, payload)
      }
      return api.post('/blog', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog'] })
      queryClient.invalidateQueries({ queryKey: ['blog-post', id] })
      navigate('/blog')
    },
  })

  const handleSave = (publishStatus: 'draft' | 'published') => {
    const payload = {
      title: title.trim(),
      excerpt: excerpt.trim(),
      content,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      coverImage: coverImage.trim() || undefined,
      status: publishStatus,
    }
    saveMutation.mutate(payload)
  }

  if (isEditing && isLoading) {
    return <FormSkeleton fields={5} />
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/blog"
            className="flex items-center gap-2 text-sm text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft size={16} /> Back to Blog
          </Link>
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
            {isEditing ? 'Edit Post' : 'New Blog Post'}
          </h1>
        </div>
      </div>

      {/* Form */}
      <Card className="p-6 flex flex-col gap-5">
        {/* Title */}
        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          fullWidth
          placeholder="Enter post title"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {/* Excerpt */}
        <TextField
          label="Excerpt"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          fullWidth
          multiline
          rows={2}
          placeholder="Brief summary of the post"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {/* Content - Markdown Editor */}
        <div>
          <label className="block text-sm font-medium text-primary-dark dark:text-white mb-1.5">
            Content
          </label>
          <MarkdownEditor value={content} onChange={setContent} minRows={16} aiContext="blog post" />
        </div>

        {/* Tags */}
        <TextField
          label="Tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          fullWidth
          placeholder="housing, ghana, tips (comma-separated)"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {/* Cover image */}
        <TextField
          label="Cover Image URL"
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
          fullWidth
          placeholder="https://example.com/image.jpg"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {/* Status toggle */}
        <div>
          <label className="block text-sm font-medium text-primary-dark dark:text-white mb-1.5">
            Status
          </label>
          <div className="flex items-center border border-border dark:border-[#252a3a] rounded-md overflow-hidden w-fit text-sm font-medium">
            <button
              type="button"
              onClick={() => setStatus('draft')}
              className={`px-4 py-2 transition-colors ${
                status === 'draft'
                  ? 'bg-amber-500 text-white'
                  : 'text-muted dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#252a3a]'
              }`}
            >
              Draft
            </button>
            <button
              type="button"
              onClick={() => setStatus('published')}
              className={`px-4 py-2 transition-colors ${
                status === 'published'
                  ? 'bg-green-600 text-white'
                  : 'text-muted dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#252a3a]'
              }`}
            >
              Published
            </button>
          </div>
        </div>

        {/* Error */}
        {saveMutation.isError && (
          <p className="text-sm text-danger">
            {(saveMutation.error as Error)?.message || 'Failed to save post.'}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          {isEditing ? (
            <Button
              onClick={() => handleSave(status)}
              disabled={!title.trim() || !content.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Update Post
            </Button>
          ) : (
            <>
              <Button
                onClick={() => handleSave('published')}
                disabled={!title.trim() || !content.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Publish
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSave('draft')}
                disabled={!title.trim() || !content.trim() || saveMutation.isPending}
              >
                <Save size={14} /> Save Draft
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => navigate('/blog')}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  )
}
