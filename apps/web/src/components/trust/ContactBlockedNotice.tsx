import { useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import { appealDecision, type ContactBlockedError } from '@/lib/contactProtection'

/**
 * Why a message was not sent, shown above the composer with the text still in
 * it. One tap asks a person to review a mistake; the explanation never says
 * which pattern matched (that would teach people how to get round it).
 */
export function ContactBlockedNotice({ error, onDismiss }: { error: ContactBlockedError; onDismiss: () => void }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [answer, setAnswer] = useState('')

  async function appeal() {
    if (!error.decisionId) return
    setState('sending')
    try {
      await appealDecision(error.decisionId)
      setState('sent')
    } catch (err) {
      setAnswer(err instanceof Error ? err.message : 'Could not send the review request.')
      setState('failed')
    }
  }

  return (
    <div role="alert" className="mb-2 flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-3.5 py-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
      <ShieldAlert size={18} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="leading-relaxed">{error.message}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-amber-800/80 dark:text-amber-200/70">Edit your message and try again.</span>
          {error.decisionId && state === 'idle' && (
            <button type="button" onClick={appeal} className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700 dark:text-amber-100">
              Was this a mistake? Ask for a review
            </button>
          )}
          {state === 'sending' && <span>Sending…</span>}
          {state === 'sent' && <span className="font-medium">Thanks — a person will review it. If it was stopped by mistake, you can send the same text.</span>}
          {state === 'failed' && <span className="font-medium">{answer}</span>}
        </div>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded-md p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-400/10">
        <X size={14} />
      </button>
    </div>
  )
}
