import { useToastStore } from '@/stores/toastStore'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

const icons = {
  success: <CheckCircle size={18} className="text-accent" />,
  error: <AlertCircle size={18} className="text-danger" />,
  info: <Info size={18} className="text-primary" />,
}

const bgColors = {
  success: 'bg-accent/10 border-accent/20',
  error: 'bg-danger/10 border-danger/20',
  info: 'bg-primary/10 border-primary/20',
}

export function Toaster() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-full border px-5 py-3 shadow-lg bg-white dark:bg-[#161927] dark:border-[#252a3a] ${bgColors[toast.type]} animate-slide-in`}
        >
          {icons[toast.type]}
          <p className="text-sm text-primary-dark flex-1">{toast.message}</p>
          <button onClick={() => removeToast(toast.id)} className="text-muted hover:text-primary-dark">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
