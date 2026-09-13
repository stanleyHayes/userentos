import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { fetchRentReceipt } from '@/lib/rentReceipt'

export function RentReceiptControl({ paymentId }: { paymentId: string }) {
  const token = useAuthStore(s => s.token)
  const request = useRef<AbortController | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [copy, setCopy] = useState<{ html: string; token: string | null } | null>(null)
  const [loadingToken, setLoadingToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => request.current?.abort(), [paymentId, token])
  const html = copy?.token === token ? copy.html : null
  const loading = token !== null && loadingToken === token
  async function open() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoadingToken(token); setError(''); setReady(false); setCopy(null)
    try {
      const html = await fetchRentReceipt(paymentId, controller.signal)
      if (!controller.signal.aborted) setCopy({ html, token })
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not retrieve the receipt.')
    } finally {
      if (!controller.signal.aborted) setLoadingToken(null)
    }
  }
  return <section className="space-y-3" aria-label="Rent receipt">
    <Button variant="outline" className="w-full" disabled={loading} onClick={() => void open()}>{loading ? 'Loading receipt…' : html ? 'Refresh receipt status' : 'View rent receipt'}</Button>
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {html && <>
      <Button disabled={!ready} className="w-full" onClick={() => frame.current?.contentWindow?.print()}>Print or save PDF</Button>
      <p className="text-xs text-muted">Use your browser’s print dialog to print or save a PDF. Refresh the receipt to check for later payment changes.</p>
      <iframe ref={frame} title="Rent payment receipt" srcDoc={html} sandbox="allow-same-origin allow-modals" referrerPolicy="no-referrer" onLoad={() => setReady(true)} className="w-full h-[480px] border border-border rounded-lg bg-white" />
    </>}
  </section>
}
