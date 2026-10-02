import { useId, useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useUploadStorefrontImage, useAIGenerate, type StorefrontImagePurpose } from '@/hooks/useApi'
import { isContactBlocked } from '@/lib/contactProtection'
import { cn } from '@/lib/utils'

/** One picture on the website: upload, see it, replace it. Uploads save straight away. */
export function ImageSlot({ purpose, url, label, hint, aspect = 'aspect-[16/9]', round = false, compact = false }: {
  purpose: StorefrontImagePurpose
  url?: string
  label: string
  hint?: string
  aspect?: string
  round?: boolean
  /** A bare square tile (the gallery's "add" button); the label is only for screen readers. */
  compact?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadStorefrontImage()
  const choose = () => input.current?.click()

  return (
    <div>
      {!compact && <p className="mb-1.5 text-sm font-semibold text-primary-dark dark:text-white">{label}</p>}
      <button
        type="button"
        onClick={choose}
        disabled={upload.isPending}
        aria-label={compact ? label : undefined}
        className={cn(
          'group relative flex w-full items-center justify-center overflow-hidden border-2 border-dashed border-border bg-surface/70 text-muted transition hover:border-primary/50 hover:text-primary dark:border-[#2a3042] dark:bg-white/[0.03]',
          round ? 'aspect-square max-w-[140px] rounded-2xl' : compact ? 'aspect-square rounded-xl' : `${aspect} rounded-2xl`,
        )}
      >
        {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <span className={cn('relative z-10 flex flex-col items-center gap-1.5 text-xs font-semibold', url && 'rounded-xl bg-black/55 px-3 py-2 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100')}>
          {upload.isPending ? <Loader2 size={20} className="animate-spin" /> : url ? <RefreshCw size={18} /> : <ImagePlus size={22} />}
          {upload.isPending ? 'Uploading…' : url ? 'Replace' : 'Upload'}
        </span>
      </button>
      {hint && <p className="mt-1.5 text-xs text-muted dark:text-gray-500">{hint}</p>}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          if (file.size > 8 * 1024 * 1024) { toast.error('Choose an image under 8 MB'); return }
          upload.mutate({ file, purpose }, {
            onSuccess: () => toast.success(`${label} updated`),
            onError: (err) => toast.error(err instanceof Error ? err.message : 'Upload failed'),
          })
        }}
      />
    </div>
  )
}

/** Short items (services, areas): type and press Enter, remove with ×. */
export function ChipsInput({ label, values, onChange, placeholder, max = 12 }: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder: string
  max?: number
}) {
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const add = () => {
    const value = draft.trim().slice(0, 60)
    if (!value || values.some((v) => v.toLowerCase() === value.toLowerCase()) || values.length >= max) { setDraft(''); return }
    onChange([...values, value])
    setDraft('')
  }
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-primary-dark dark:text-white">{label}</label>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-2 dark:border-[#2a3042] dark:bg-[#0c0e1a]">
        {values.map((value) => (
          <span key={value} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1.5 text-sm font-medium text-primary dark:bg-blue-500/15 dark:text-blue-300">
            {value}
            <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((v) => v !== value))} className="rounded-full p-0.5 hover:bg-primary/15"><X size={13} /></button>
          </span>
        ))}
        {values.length < max && (
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
            onBlur={add}
            placeholder={values.length ? 'Add another' : placeholder}
            className="min-w-[10rem] flex-1 bg-transparent px-1.5 py-1 text-sm text-primary-dark outline-none placeholder:text-muted dark:text-white"
          />
        )}
      </div>
    </div>
  )
}

/**
 * "Help me write": turns the owner's notes into polished copy they can edit
 * before saving. Contact details in the result are stopped when it is saved,
 * like anything else on the website.
 */
export function AiWriteButton({ notes, context, onResult, children }: {
  notes: string
  context: string
  onResult: (text: string) => void
  children?: ReactNode
}) {
  const generate = useAIGenerate()
  return (
    <button
      type="button"
      disabled={generate.isPending || notes.trim().length < 3}
      title={notes.trim().length < 3 ? 'Write a few notes first, then let RentOS polish them' : undefined}
      onClick={() => generate.mutate({ prompt: notes.trim(), context }, {
        onSuccess: ({ text }) => onResult(text.trim()),
        onError: (err) => { if (isContactBlocked(err)) toast.error(err.message) },
      })}
      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
    >
      {generate.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
      {generate.isPending ? 'Writing…' : children ?? 'Help me write'}
    </button>
  )
}
