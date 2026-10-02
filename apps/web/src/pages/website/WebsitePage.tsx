import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Globe, ExternalLink, Rocket, EyeOff, Loader2, Trash2, Plus, PenLine, BarChart3, Lock, Newspaper, Copy, CheckCircle2 } from 'lucide-react'
import TextField from '@mui/material/TextField'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ListSkeleton } from '@/components/ui/Skeleton'
import {
  useMyStorefront, useUpdateStorefront, usePublishStorefront, useRemoveGalleryImage, useMyEntitlements,
  type StorefrontRecord, type StorefrontInput,
} from '@/hooks/useApi'
import { isContactBlocked } from '@/lib/contactProtection'
import { ContactBlockedNotice } from '@/components/trust/ContactBlockedNotice'
import type { ContactBlockedError } from '@/lib/contactProtection'
import { ImageSlot, ChipsInput, AiWriteButton } from './fields'
import { websiteUrl } from '@/lib/site'
import { DomainsCard } from './WebsiteDomains'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-5">
        <div>
          <h2 className="text-base font-bold text-primary-dark dark:text-white">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted dark:text-gray-400">{description}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

interface Form {
  name: string; tagline: string; city: string; hours: string
  heroTitle: string; heroSubtitle: string; about: string
  services: string[]; serviceAreas: string[]; primaryColor: string; hideRentosBranding: boolean
}

const formOf = (s: StorefrontRecord): Form => ({
  name: s.name, tagline: s.tagline ?? '', city: s.contact?.city ?? '', hours: s.contact?.hours ?? '',
  heroTitle: s.heroTitle ?? '', heroSubtitle: s.heroSubtitle ?? '', about: s.about ?? '',
  services: s.services ?? [], serviceAreas: s.serviceAreas ?? [],
  primaryColor: s.branding?.primaryColor ?? '', hideRentosBranding: Boolean(s.branding?.hideRentosBranding),
})

function Editor({ storefront }: { storefront: StorefrontRecord }) {
  const { data: entitlements } = useMyEntitlements()
  const features = entitlements?.features ?? {}
  const canBrand = features['storefront.custom_branding'] === true
  const canHideBranding = features['storefront.remove_rentos_branding'] === true
  const canUseDomain = features['storefront.custom_domain'] === true
  const update = useUpdateStorefront()
  const publish = usePublishStorefront()
  const removeImage = useRemoveGalleryImage()
  const [form, setForm] = useState<Form>(() => formOf(storefront))
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(formOf(storefront)))
  const [blocked, setBlocked] = useState<ContactBlockedError | null>(null)
  const dirty = JSON.stringify(form) !== savedSnapshot
  const live = storefront.published !== false && storefront.status === 'active'
  const url = websiteUrl(storefront)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  function save() {
    setBlocked(null)
    const body: StorefrontInput = {
      name: form.name.trim(), tagline: form.tagline.trim(), about: form.about.trim(),
      heroTitle: form.heroTitle.trim(), heroSubtitle: form.heroSubtitle.trim(),
      services: form.services, serviceAreas: form.serviceAreas,
      contact: { city: form.city.trim(), hours: form.hours.trim() },
      ...(canBrand || canHideBranding ? { branding: {
        ...(canBrand ? { primaryColor: form.primaryColor.trim() || undefined } : {}),
        ...(canHideBranding ? { hideRentosBranding: form.hideRentosBranding } : {}),
      } } : {}),
    }
    update.mutate(body, {
      onSuccess: () => { setSavedSnapshot(JSON.stringify(form)); toast.success('Website saved') },
      onError: (err) => { if (isContactBlocked(err)) { setBlocked(err); window.scrollTo({ top: 0, behavior: 'smooth' }) } else toast.error(err instanceof Error ? err.message : 'Could not save') },
    })
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Status */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <span className={`grid h-12 w-12 place-items-center rounded-2xl ${live ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}`}>{live ? <Globe size={22} /> : <EyeOff size={22} />}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-primary-dark dark:text-white">{storefront.name}</p>
              <Badge variant={storefront.status !== 'active' ? 'danger' : live ? 'success' : 'warning'}>{storefront.status !== 'active' ? 'Suspended' : live ? 'Live' : 'Draft'}</Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
              <a href={url} target="_blank" rel="noreferrer" className="truncate font-mono text-primary hover:underline dark:text-blue-400">{url.replace('https://', '')}</a>
              <button type="button" aria-label="Copy website address" onClick={() => { void navigator.clipboard.writeText(url); toast.success('Address copied — share it anywhere') }} className="rounded p-1 text-muted hover:text-primary"><Copy size={13} /></button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/s/${storefront.slug}`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><ExternalLink size={14} /> Preview</Button></a>
            {storefront.status === 'active' && (live ? (
              <Button variant="outline" size="sm" disabled={publish.isPending} onClick={() => publish.mutate(false, { onSuccess: () => toast.success('Your website is back to a draft') })}><EyeOff size={14} /> Take offline</Button>
            ) : (
              <Button size="sm" disabled={publish.isPending} onClick={() => publish.mutate(true, { onSuccess: () => toast.success('Your website is live!'), onError: (err) => toast.error((err as Error).message) })}>
                {publish.isPending ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />} Launch website
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {blocked && <ContactBlockedNotice error={blocked} onDismiss={() => setBlocked(null)} />}

      <Section title="Business" description="Who you are. Enquiries reach you through RentOS messages with an SMS alert, so there is no phone number or email here.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Business name" size="small" value={form.name} onChange={(e) => set('name', e.target.value)} slotProps={{ htmlInput: { maxLength: 80 }, inputLabel: { shrink: true } }} />
          <TextField label="Tagline" size="small" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Family homes across Greater Accra" slotProps={{ htmlInput: { maxLength: 160 }, inputLabel: { shrink: true } }} />
          <TextField label="City" size="small" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Accra" slotProps={{ htmlInput: { maxLength: 60 }, inputLabel: { shrink: true } }} />
          <TextField label="Office hours" size="small" value={form.hours} onChange={(e) => set('hours', e.target.value)} placeholder="Mon–Sat, 8am–6pm" slotProps={{ htmlInput: { maxLength: 120 }, inputLabel: { shrink: true } }} />
        </div>
        <ChipsInput label="Services" values={form.services} onChange={(v) => set('services', v)} placeholder="e.g. Lettings, Sales, Property management" />
        <ChipsInput label="Areas you cover" values={form.serviceAreas} onChange={(v) => set('serviceAreas', v)} placeholder="e.g. East Legon, Spintex, Tema" />
      </Section>

      <Section title="Home page" description="The first thing visitors see: your best photo and one clear line about what you offer.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Headline" size="small" value={form.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} placeholder={form.name} slotProps={{ htmlInput: { maxLength: 90 }, inputLabel: { shrink: true } }} />
          <TextField label="Supporting line" size="small" value={form.heroSubtitle} onChange={(e) => set('heroSubtitle', e.target.value)} placeholder="Verified homes to rent and buy in Accra" slotProps={{ htmlInput: { maxLength: 200 }, inputLabel: { shrink: true } }} />
        </div>
        <ImageSlot purpose="cover" url={storefront.branding?.coverUrl} label="Cover photo" hint="A wide photo of a property or your team. At least 1600 px wide looks best." aspect="aspect-[21/9]" />
      </Section>

      <Section title="Logo and colours">
        <div className="grid gap-6 sm:grid-cols-[160px_1fr]">
          <ImageSlot purpose="logo" url={storefront.branding?.logoUrl} label="Logo" round />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input type="color" aria-label="Brand colour" value={/^#[0-9a-f]{6}$/i.test(form.primaryColor) ? form.primaryColor : '#1e3a5f'} disabled={!canBrand} onChange={(e) => set('primaryColor', e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-transparent disabled:cursor-not-allowed disabled:opacity-50" />
              <div>
                <p className="text-sm font-semibold text-primary-dark dark:text-white">Brand colour</p>
                <p className="text-xs text-muted dark:text-gray-500">{canBrand ? 'Used for buttons and highlights across your website.' : 'Your own colours come with the Professional plan. Your website uses RentOS navy until then.'}</p>
              </div>
            </div>
            <label className={`flex items-center gap-3 text-sm ${canHideBranding ? 'text-primary-dark dark:text-white' : 'text-muted'}`}>
              <input type="checkbox" checked={form.hideRentosBranding} disabled={!canHideBranding} onChange={(e) => set('hideRentosBranding', e.target.checked)} className="h-4 w-4 rounded" />
              Hide "Website by RentOS" in the footer {!canHideBranding && <span className="inline-flex items-center gap-1 text-xs"><Lock size={11} /> Professional</span>}
            </label>
            {(!canBrand || !canHideBranding) && <Link to="/subscription" className="inline-block text-sm font-semibold text-primary hover:underline dark:text-blue-400">See the Professional plan</Link>}
          </div>
        </div>
      </Section>

      <Section title="About us" description="Your story in a few short paragraphs: who you are, what you do, and why people choose you.">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="about" className="text-sm font-semibold text-primary-dark dark:text-white">About text</label>
            <AiWriteButton notes={form.about} context="business description (an agency's About Us page)" onResult={(text) => set('about', text)} />
          </div>
          <textarea id="about" value={form.about} onChange={(e) => set('about', e.target.value)} rows={7} maxLength={4000} placeholder="Jot down a few notes — founded 2018, lettings and sales in East Legon and Spintex, known for fast viewings — then tap Help me write." className="w-full rounded-xl border border-border bg-white px-3.5 py-3 text-sm text-primary-dark outline-none focus:border-primary dark:border-[#2a3042] dark:bg-[#0c0e1a] dark:text-white" />
        </div>
        <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
          <ImageSlot purpose="about" url={storefront.aboutImageUrl} label="About photo" hint="You, your team or your office." aspect="aspect-[4/3]" />
          <div>
            <p className="mb-1.5 text-sm font-semibold text-primary-dark dark:text-white">Gallery <span className="font-normal text-muted">({storefront.gallery?.length ?? 0}/12)</span></p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(storefront.gallery ?? []).map((photo) => (
                <div key={photo} className="group relative aspect-square overflow-hidden rounded-xl">
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                  <button type="button" aria-label="Remove photo" disabled={removeImage.isPending} onClick={() => removeImage.mutate(photo)} className="absolute right-1 top-1 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"><Trash2 size={13} /></button>
                </div>
              ))}
              {(storefront.gallery?.length ?? 0) < 12 && <ImageSlot purpose="gallery" label="Add photo" compact />}
            </div>
          </div>
        </div>
      </Section>

      <Section title="News" description="Post market updates, new listings and advice. Posts appear on your website and in RentOS Real Estate News, credited to you.">
        <div className="flex flex-wrap gap-2">
          <Link to="/storefront/posts?new=1"><Button size="sm"><PenLine size={14} /> Write a post</Button></Link>
          <Link to="/storefront/posts"><Button size="sm" variant="outline"><Newspaper size={14} /> Manage posts</Button></Link>
          <Link to="/storefront/analytics"><Button size="sm" variant="ghost"><BarChart3 size={14} /> Visitors</Button></Link>
        </div>
      </Section>

      <DomainsCard storefront={storefront} canUseDomain={canUseDomain} />

      {/* Save bar */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,31,51,0.08)] backdrop-blur dark:border-[#252a3a] dark:bg-[#111422]/95">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <p className="text-sm text-muted dark:text-gray-400">You have unsaved changes.</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setForm(JSON.parse(savedSnapshot) as Form)}>Discard</Button>
              <Button size="sm" disabled={update.isPending || form.name.trim().length < 2} onClick={save}>{update.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save changes</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * "My website" (brief §03): the owner fills in RentOS's fixed structure —
 * business details, home page, look, about, news — and launches it.
 */
export function WebsitePage() {
  const { data: storefront, isLoading } = useMyStorefront()
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Your business" title="My website" description="Your own property website on RentOS. You add the content; RentOS keeps it looking professional." icon={<Globe size={22} />} />
      {isLoading ? <ListSkeleton rows={4} /> : storefront ? (
        <Editor storefront={storefront} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-300"><Globe size={26} /></span>
            <div className="flex-1">
              <p className="font-bold text-primary-dark dark:text-white">Set up your website</p>
              <p className="mt-1 text-sm text-muted dark:text-gray-400">Get yourname.userentos.com with your listings, about page, news and an enquiry form — in about five minutes.</p>
            </div>
            <Link to="/onboarding"><Button><Plus size={16} /> Get started</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
