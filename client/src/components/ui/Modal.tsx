import { type ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className={cn('relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-[#161927] shadow-xl dark:shadow-black/40 mx-4 max-h-[90vh] overflow-y-auto border border-transparent dark:border-[#252a3a]', className)}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 pt-5 pb-4 bg-white dark:bg-[#161927] border-b border-border/30 dark:border-[#252a3a]/30">
          <h2 className="text-lg font-bold text-primary-dark dark:text-[#e2e8f0]">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary-dark dark:hover:text-white transition-colors rounded-lg p-1 hover:bg-surface dark:hover:bg-[#0c0e1a]">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}
