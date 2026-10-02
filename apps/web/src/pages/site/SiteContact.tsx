import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { MapPin, Clock, ShieldCheck, Send, CheckCircle2, Lock, Building2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useSite, platformSiteUrl } from '@/lib/site'
import { usePublicListing } from '@/lib/publicListing'
import { isContactBlocked } from '@/lib/contactProtection'
import { ContactBlockedNotice } from '@/components/trust/ContactBlockedNotice'

/**
 * Contact: an enquiry that opens a RentOS conversation with the owner — never
 * an exchange of phone numbers — and lands in their leads with an alert.
 */
export function SiteContact() {
  const { site, onHost, color } = useSite()
  const [params] = useSearchParams()
  const propertyRef = params.get('property') ?? undefined
  const { data: listing } = usePublicListing(propertyRef)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const navigate = useNavigate()
  const location = useLocation()
  const [message, setMessage] = useState(listing ? `Hi, I'm interested in "${listing.title}". Is it still available?` : '')
  const [listingTitle, setListingTitle] = useState(listing?.title)
  // Prefill once the listing loads (render-time adjustment, no effect).
  if (listing && listing.title !== listingTitle) {
    setListingTitle(listing.title)
    if (!message.trim()) setMessage(`Hi, I'm interested in "${listing.title}". Is it still available?`)
  }

  const send = useMutation({
    mutationFn: () => api.post<{ conversationId: string }>(`/storefronts/${site.slug}/enquiries`, { message: message.trim(), ...(propertyRef ? { propertyRef } : {}) }),
  })
  const blocked = isContactBlocked(send.error) ? send.error : null

  function signIn() {
    try { sessionStorage.setItem('postAuthRedirect', `${location.pathname}${location.search}`) } catch { /* storage blocked */ }
    navigate('/login')
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--site-color)] opacity-80">Contact</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">Talk to {site.name}</h1>
      <p className="mt-3 max-w-2xl text-base text-slate-600">Tell us what you are looking for. Your enquiry goes to {site.name} on RentOS, and the reply comes to your RentOS messages.</p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-900/5 md:p-8">
          {listing && (
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#f7f5f2] px-3.5 py-1.5 text-sm font-medium text-slate-700"><Building2 size={15} className="text-[var(--site-color)]" />About: {listing.title}</p>
          )}

          {onHost ? (
            <div>
              <p className="text-base leading-relaxed text-slate-700">Enquiries to {site.name} are made on RentOS, so your conversation, viewing and payment stay protected.</p>
              <a href={platformSiteUrl(site.slug, `/contact${location.search}`)} className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-[var(--site-on-color)]" style={{ background: color }}>
                <Send size={16} /> Write to {site.name} on RentOS
              </a>
            </div>
          ) : send.isSuccess ? (
            <div role="status" className="text-center">
              <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
              <h2 className="mt-4 font-serif text-2xl font-semibold text-slate-900">Message sent</h2>
              <p className="mt-2 text-slate-600">{site.name} will reply in your RentOS messages. We will alert you when they do.</p>
              <Link to={`/messages?conversationId=${send.data.conversationId}`} className="mt-6 inline-flex rounded-full px-6 py-3 text-sm font-semibold text-[var(--site-on-color)]" style={{ background: color }}>Open the conversation</Link>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (isAuthenticated) send.mutate(); else signIn() }}>
              {blocked && <ContactBlockedNotice error={blocked} onDismiss={() => send.reset()} />}
              <label htmlFor="site-enquiry" className="text-sm font-semibold text-slate-900">Your message</label>
              <textarea
                id="site-enquiry"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={1000}
                placeholder="E.g. I'm looking for a 2-bedroom apartment in East Legon from November, up to GH₵ 4,000 a month."
                className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-[#fbfaf8] px-4 py-3 text-base text-slate-900 outline-none transition focus:border-[var(--site-color)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--site-color)_25%,transparent)]"
              />
              {send.isError && !blocked && <p role="alert" className="mt-2 text-sm text-red-600">{(send.error as Error).message}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  disabled={send.isPending || (isAuthenticated && message.trim().length < 5)}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-[var(--site-on-color)] transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: color }}
                >
                  {isAuthenticated ? <><Send size={16} /> {send.isPending ? 'Sending…' : 'Send message'}</> : <><Lock size={15} /> Sign in to send</>}
                </button>
                {!isAuthenticated && <span className="text-sm text-slate-500">New to RentOS? Creating an account takes a minute.</span>}
              </div>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          {(site.contact.city || site.contact.hours) && (
            <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-900/5">
              {site.contact.city && <p className="flex items-center gap-3 text-base text-slate-700"><MapPin size={18} className="text-[var(--site-color)]" />{site.contact.city}</p>}
              {site.contact.hours && <p className="mt-3 flex items-center gap-3 text-base text-slate-700"><Clock size={18} className="text-[var(--site-color)]" />{site.contact.hours}</p>}
            </div>
          )}
          <div className="rounded-3xl bg-slate-900 p-6 text-slate-200">
            <p className="flex items-center gap-2 font-semibold text-white"><ShieldCheck size={18} className="text-emerald-400" /> Protected by RentOS</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
              <li>Your phone number and email stay private.</li>
              <li>Replies arrive in your RentOS messages, with an email if you miss one.</li>
              <li>Keep viewings and payments on RentOS so you are covered if anything goes wrong.</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  )
}
