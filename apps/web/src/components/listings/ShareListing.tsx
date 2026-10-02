import { useState } from 'react'
import toast from 'react-hot-toast'
import { Share2, Copy, Check, Mail, MessageSquare, Send } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface ShareTarget {
  url: string
  title: string
  /** e.g. "2 bed · East Legon · GHS 2,500/month" */
  summary?: string
}

function WhatsAppGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.84 9.84 0 0 0 12.04 2Zm5.8 14.1c-.24.68-1.42 1.3-1.95 1.35-.5.05-1.13.07-1.83-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.58.82 2.01.89 2.16.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.59.17.29.74 1.22 1.59 1.97 1.09.97 2.01 1.27 2.3 1.41.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.65-.14.26.1 1.68.79 1.97.94.29.14.48.21.55.33.07.12.07.7-.17 1.38Z" />
    </svg>
  )
}

function FacebookGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M13.5 21v-7.5h2.53l.38-2.94H13.5V8.69c0-.85.24-1.43 1.46-1.43h1.56V4.63a20.9 20.9 0 0 0-2.27-.12c-2.25 0-3.79 1.37-3.79 3.89v2.16H7.92v2.94h2.54V21h3.04Z" />
    </svg>
  )
}

function XGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z" />
    </svg>
  )
}

/** Every way an agent markets a listing (brief §04): social apps, SMS, email, or a copied link. */
function shareLinks({ url, title, summary }: ShareTarget) {
  const message = [title, summary, url].filter(Boolean).join('\n')
  const encodedUrl = encodeURIComponent(url)
  return [
    { key: 'whatsapp', label: 'WhatsApp', icon: <WhatsAppGlyph />, href: `https://wa.me/?text=${encodeURIComponent(message)}`, className: 'bg-[#25D366]/12 text-[#128C4B] dark:text-[#4ADE80]' },
    { key: 'facebook', label: 'Facebook', icon: <FacebookGlyph />, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, className: 'bg-[#1877F2]/12 text-[#1877F2]' },
    { key: 'x', label: 'X', icon: <XGlyph />, href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(title)}`, className: 'bg-black/8 text-black dark:bg-white/10 dark:text-white' },
    { key: 'telegram', label: 'Telegram', icon: <Send size={16} />, href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(title)}`, className: 'bg-[#229ED9]/12 text-[#229ED9]' },
    { key: 'sms', label: 'SMS', icon: <MessageSquare size={16} />, href: `sms:?&body=${encodeURIComponent(message)}`, className: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
    { key: 'email', label: 'Email', icon: <Mail size={16} />, href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`, className: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' },
  ]
}

/** The share options laid out inline, with the link and a copy button. */
export function ShareListingPanel(target: ShareTarget) {
  const [copied, setCopied] = useState(false)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(target.url)
      setCopied(true)
      toast.success('Link copied. Paste it into Instagram, Facebook or any chat.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy the link. Select it and copy it instead.')
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: target.title, text: target.summary ?? target.title, url: target.url })
    } catch { /* the visitor closed the share sheet */ }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {shareLinks(target).map((link) => (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition-transform hover:-translate-y-0.5 focus-ring"
          >
            <span className={`grid h-11 w-11 place-items-center rounded-full ${link.className}`}>{link.icon}</span>
            <span className="text-[11px] font-semibold text-primary-dark dark:text-gray-300">{link.label}</span>
          </a>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/60 p-1.5 pl-3 dark:border-[#252a3a] dark:bg-white/[0.03]">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted dark:text-gray-400" title={target.url}>{target.url}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()} aria-label="Copy link">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
        </Button>
        {canNativeShare && (
          <Button type="button" size="sm" onClick={() => void nativeShare()} aria-label="More sharing options">
            <Share2 size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}

/** A button that opens the share options in a dialog. */
export function ShareListingButton({ label = 'Share', variant = 'outline', size = 'sm', ...target }: ShareTarget & { label?: string; variant?: 'outline' | 'primary'; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        <Share2 size={14} /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Share this listing">
        <p className="mb-4 text-sm text-muted dark:text-gray-400">{target.title}</p>
        <ShareListingPanel {...target} />
      </Modal>
    </>
  )
}
