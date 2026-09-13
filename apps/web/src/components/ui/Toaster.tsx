import toast, { Toaster as HotToaster, ToastBar } from 'react-hot-toast'
import { X } from 'lucide-react'

export function Toaster() {
  return (
    <HotToaster
      position="bottom-right"
      containerStyle={{ zIndex: 10000 }}
      toastOptions={{
        duration: 4000,
        error: { duration: Infinity },
        className: '!bg-white !text-primary-dark dark:!bg-[#161927] dark:!text-white',
      }}
    >
      {(item) => <ToastBar toast={item.type === 'error' ? { ...item, ariaProps: { role: 'alert', 'aria-live': 'assertive' } } : item}>
        {({ icon, message }) => <>
          {icon}
          {message}
          {item.type !== 'loading' && <button aria-label="Dismiss notification" onClick={() => toast.dismiss(item.id)} className="shrink-0 rounded p-1 focus-visible:outline focus-visible:outline-2"><X size={16} /></button>}
        </>}
      </ToastBar>}
    </HotToaster>
  )
}
