import { useRef, useState } from 'react'
import { ImagePlus, Link2, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { POST_IMAGE_ACCEPT, uploadPostImage } from '@/hooks/useAuthoring'

/** A post's cover picture: on every news card and at the top of the article. */
export function CoverImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [showLink, setShowLink] = useState(false)

  async function upload(file: File) {
    setUploading(true)
    try {
      onChange(await uploadPostImage(file))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The picture did not upload. Try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-primary-dark dark:text-[#cbd5e1]">Cover picture</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          className="group relative grid aspect-[16/9] w-full shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-surface/70 text-muted transition hover:border-primary/50 hover:text-primary sm:w-60 dark:border-[#2a3042] dark:bg-white/[0.03]"
        >
          {value && <img src={value} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <span className={`relative z-10 flex flex-col items-center gap-1.5 text-xs font-semibold ${value ? 'rounded-lg bg-black/55 px-3 py-2 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100' : ''}`}>
            {uploading ? <Loader2 size={20} className="animate-spin" /> : value ? <RefreshCw size={18} /> : <ImagePlus size={22} />}
            {uploading ? 'Uploading…' : value ? 'Replace picture' : 'Upload a picture'}
          </span>
        </button>
        <div className="min-w-0 flex-1 space-y-2 text-[11px] leading-relaxed text-muted dark:text-gray-500">
          <p>Shown on news cards and at the top of the post. Wide pictures work best. JPEG, PNG, WebP or GIF, up to 8 MB.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {value && (
              <button type="button" onClick={() => onChange('')} className="inline-flex items-center gap-1 font-semibold text-danger hover:underline">
                <Trash2 size={12} /> Remove picture
              </button>
            )}
            {!showLink && (
              <button type="button" onClick={() => setShowLink(true)} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline dark:text-blue-400">
                <Link2 size={12} /> Use a picture link instead
              </button>
            )}
          </div>
          {showLink && (
            <input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://…"
              aria-label="Cover picture link"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-primary-dark outline-none focus:border-primary dark:border-[#2a3042] dark:bg-[#0c0e1a] dark:text-white"
            />
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={POST_IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
        }}
      />
    </div>
  )
}
