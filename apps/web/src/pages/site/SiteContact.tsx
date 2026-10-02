import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { MapPin, Clock, ShieldCheck, Send, CheckCircle2, Lock, Building2, MessagesSquare } from 'lucide-react'
import { Textarea } from '@/components/ui/Textarea'
import { IconWatermark } from '@/components/ui/Watermark'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useSite, platformSiteUrl } from '@/lib/site'
import { usePublicListing } from '@/lib/publicListing'
import { isContactBlocked } from '@/lib/contactProtection'
import { ContactBlockedNotice } from '@/components/trust/ContactBlockedNotice'
import { BrandButton, BrandLink, Chip, PageIntro } from './parts'

/**
 * Contact: an enquiry that opens a RentOS conversation with the owner — never
 * an exchange of phone numbers — and lands in their leads with an alert.
 */
export function SiteContact() {
  const { site, onHost } = useSite()
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
      <PageIntro eyebrow="Contact" title={`Talk to ${site.name}`}>
        Tell us what you are looking for. Your enquiry goes to {site.name} on RentOS, and the reply comes to your RentOS messages.
      </PageIntro>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="surface-card relative overflow-hidden rounded-3xl border p-6 md:p-8">
          <IconWatermark icon={MessagesSquare} className="-bottom-12 -right-10 size-56 rotate-[-10deg]" />
          {listing && (
            <Chip icon={<Building2 size={15} className="site-accent" />} className="relative mb-5">About: {listing.title}</Chip>
          )}

          {onHost ? (
            <div className="relative">
              <p className="text-base leading-relaxed text-primary-dark/80 dark:text-gray-300">Enquiries to {site.name} are made on RentOS, so your conversation, viewing and payment stay protected.</p>
              <BrandLink href={platformSiteUrl(site.slug, `/contact${location.search}`)} className="mt-6">
                <Send size={16} /> Write to {site.name} on RentOS
              </BrandLink>
            </div>
          ) : send.isSuccess ? (
            <div role="status" className="relative text-center">
              <span className="neumorphic-icon mx-auto grid h-16 w-16 place-items-center rounded-2xl text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={30} /></span>
              <h2 className="mt-4 font-display text-2xl font-extrabold text-primary-dark dark:text-white">Message sent</h2>
              <p className="mt-2 text-muted dark:text-gray-400">{site.name} will reply in your RentOS messages. We will alert you when they do.</p>
              <BrandLink to={`/messages?conversationId=${send.data.conversationId}`} className="mt-6">Open the conversation</BrandLink>
            </div>
          ) : (
            <form className="relative" onSubmit={(e) => { e.preventDefault(); if (isAuthenticated) send.mutate(); else signIn() }}>
              {blocked && <ContactBlockedNotice error={blocked} onDismiss={() => send.reset()} />}
              <Textarea
                id="site-enquiry"
                label="Your message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                rows={6}
                placeholder="E.g. I'm looking for a 2-bedroom apartment in East Legon from November, up to GH₵ 4,000 a month."
              />
              {send.isError && !blocked && <p role="alert" className="mt-2 text-sm text-danger">{(send.error as Error).message}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <BrandButton type="submit" disabled={send.isPending || (isAuthenticated && message.trim().length < 5)}>
                  {isAuthenticated ? <><Send size={16} /> {send.isPending ? 'Sending…' : 'Send message'}</> : <><Lock size={15} /> Sign in to send</>}
                </BrandButton>
                {!isAuthenticated && <span className="text-sm text-muted dark:text-gray-400">New to RentOS? Creating an account takes a minute.</span>}
              </div>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          {(site.contact.city || site.contact.hours) && (
            <div className="surface-card rounded-3xl border p-6">
              {site.contact.city && <p className="flex items-center gap-3 text-base text-primary-dark dark:text-gray-200"><MapPin size={18} className="site-accent" />{site.contact.city}</p>}
              {site.contact.hours && <p className="mt-3 flex items-center gap-3 text-base text-primary-dark dark:text-gray-200"><Clock size={18} className="site-accent" />{site.contact.hours}</p>}
            </div>
          )}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0f1f33] p-6 text-white shadow-[0_18px_56px_rgba(15,31,51,0.16)]">
            <IconWatermark icon={ShieldCheck} tone="brand" className="-bottom-8 -right-6 size-40 rotate-[-8deg]" />
            <p className="relative flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-emerald-400" /> Protected by RentOS</p>
            <ul className="relative mt-3 space-y-2 text-sm leading-relaxed text-white/60">
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
