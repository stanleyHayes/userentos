import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowRight, Check, Globe, Loader2, Rocket, Plus, Building2, ExternalLink, X } from 'lucide-react'
import TextField from '@mui/material/TextField'
import { useAuthStore, useAuthRehydrate } from '@/stores/authStore'
import { SplashScreen } from '@/components/ui/SplashScreen'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { Textarea } from '@/components/ui/Textarea'
import { IconWatermark, LogoWatermark } from '@/components/ui/Watermark'
import {
  useMyStorefront, useCreateStorefront, useUpdateStorefront, usePublishStorefront, useSlugAvailability, useProperties, useMyEntitlements,
} from '@/hooks/useApi'
import { isContactBlocked, type ContactBlockedError } from '@/lib/contactProtection'
import { ContactBlockedNotice } from '@/components/trust/ContactBlockedNotice'
import { websiteUrl } from '@/lib/site'
import { ImageSlot, ChipsInput } from './fields'
import { isPropertyProfessional } from '../../../../../packages/shared/productScope'

const noop = () => {}
const STEPS = ['Business', 'Look', 'Properties', 'About', 'Launch'] as const

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

/**
 * Setting up a website (brief §03): business information → logo and images →
 * properties → about → publish. Outside the dashboard so nothing competes with
 * the next step; every step after the first can be skipped and finished later
 * in My website.
 */
export function OnboardingPage() {
  const authReady = useAuthRehydrate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const roles = useAuthStore((s) => s.user?.roles)
  if (!authReady) return <SplashScreen onFinished={noop} />
  if (!isAuthenticated) {
    try { sessionStorage.setItem('postAuthRedirect', '/onboarding') } catch { /* storage blocked */ }
    return <Navigate to="/login" replace />
  }
  // A property website is for landlords and agents (the API refuses anyone else).
  if (!isPropertyProfessional(roles)) return <Navigate to="/dashboard" replace />
  return <Wizard />
}

function Wizard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { data: storefront, isLoading } = useMyStorefront()
  const { data: entitlements } = useMyEntitlements()
  const properties = useProperties({ mine: true })
  const create = useCreateStorefront()
  const update = useUpdateStorefront()
  const publish = usePublishStorefront()
  const [step, setStep] = useState(0)
  const [blocked, setBlocked] = useState<ContactBlockedError | null>(null)
  const [business, setBusiness] = useState({ name: '', slug: '', city: '' })
  const [slugTouched, setSlugTouched] = useState(false)
  const [about, setAbout] = useState({ about: '', services: [] as string[], serviceAreas: [] as string[] })
  const [seeded, setSeeded] = useState(false)

  // Start from what is already saved (render-time adjustment, no effect).
  if (storefront && !seeded) {
    setSeeded(true)
    setBusiness({ name: storefront.name, slug: storefront.slug, city: storefront.contact?.city ?? '' })
    setAbout({ about: storefront.about ?? '', services: storefront.services ?? [], serviceAreas: storefront.serviceAreas ?? [] })
  }
  if (!storefront && !seeded && !isLoading && user) {
    setSeeded(true)
    setBusiness((b) => ({ ...b, name: b.name || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() }))
  }

  const slug = slugTouched ? business.slug : storefront?.slug ?? slugify(business.name)
  const availability = useSlugAvailability(storefront ? '' : slug)
  const slugOk = Boolean(storefront) || (slug.length >= 3 && availability.data?.available === true)
  const entitled = entitlements ? entitlements.features['storefront.enabled'] === true : true
  const listingCount = properties.data?.total ?? properties.data?.items?.length ?? 0
  const failed = (err: unknown) => { if (isContactBlocked(err)) setBlocked(err); else toast.error(err instanceof Error ? err.message : 'Something went wrong') }

  async function saveBusiness() {
    setBlocked(null)
    try {
      if (storefront) await update.mutateAsync({ name: business.name.trim(), contact: { city: business.city.trim(), hours: storefront.contact?.hours } })
      else await create.mutateAsync({ slug, name: business.name.trim(), contact: { city: business.city.trim() } })
      setStep(1)
    } catch (err) { failed(err) }
  }

  async function saveAbout() {
    setBlocked(null)
    try {
      await update.mutateAsync({ about: about.about.trim(), services: about.services, serviceAreas: about.serviceAreas })
      setStep(4)
    } catch (err) { failed(err) }
  }

  async function launch(live: boolean) {
    try {
      if (live) await publish.mutateAsync(true)
      toast.success(live ? 'Your website is live!' : 'Saved as a draft. Launch it from My website whenever you are ready.')
      navigate('/website')
    } catch (err) { failed(err) }
  }

  if (isLoading) return <SplashScreen onFinished={noop} />

  return (
    <div className="public-shell-bg relative min-h-screen overflow-hidden">
      <IconWatermark icon={Globe} className="-left-16 top-24 size-64 rotate-[-12deg]" />
      <LogoWatermark className="-bottom-20 -right-10 size-72 rotate-12" />
      <header className="relative">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Logo size={30} theme="dark" />
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:bg-white/60 hover:text-primary dark:hover:bg-white/5"><X size={14} /> Finish later</Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-4 py-8">
        {/* Progress */}
        <ol className="mb-8 grid grid-cols-5 gap-2 animate-fade-down" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label} className="text-center">
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-primary dark:bg-blue-500' : 'bg-border dark:bg-[#252a3a]'}`} />
              <p className={`mt-2 text-[11px] font-semibold uppercase tracking-wider ${i === step ? 'text-primary-dark dark:text-white' : 'text-muted'}`}>{i + 1}. {label}</p>
            </li>
          ))}
        </ol>

        {blocked && <ContactBlockedNotice error={blocked} onDismiss={() => setBlocked(null)} />}

        <div className="surface-card page-enter rounded-[2rem] border p-5 sm:p-7">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-extrabold text-primary-dark dark:text-white">Let's set up your website</h1>
                <p className="mt-1 text-sm text-muted dark:text-gray-400">Your own property website on RentOS, with your listings, about page, news and an enquiry form. Start with your business name.</p>
              </div>
              {!entitled && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">Websites are not included in your current plan. <Link to="/subscription" className="font-semibold underline">See plans</Link></p>
              )}
              <TextField label="Business name" fullWidth value={business.name} onChange={(e) => setBusiness((b) => ({ ...b, name: e.target.value }))} placeholder="ABC Properties" slotProps={{ htmlInput: { maxLength: 80 }, inputLabel: { shrink: true } }} />
              <div>
                <TextField
                  label="Website address"
                  fullWidth
                  value={slug}
                  disabled={Boolean(storefront)}
                  onChange={(e) => { setSlugTouched(true); setBusiness((b) => ({ ...b, slug: slugify(e.target.value) })) }}
                  helperText={storefront ? 'Your address is set.' : slug.length < 3 ? 'At least 3 letters or numbers.' : availability.isFetching ? 'Checking…' : availability.data?.available ? 'Available' : availability.data?.reason ?? ''}
                  error={!storefront && slug.length >= 3 && availability.data?.available === false}
                  slotProps={{ input: { endAdornment: <span className="whitespace-nowrap pl-2 font-mono text-sm text-muted">.userentos.com</span> }, inputLabel: { shrink: true } }}
                />
              </div>
              <TextField label="City" fullWidth value={business.city} onChange={(e) => setBusiness((b) => ({ ...b, city: e.target.value }))} placeholder="Accra" slotProps={{ htmlInput: { maxLength: 60 }, inputLabel: { shrink: true } }} />
              <div className="flex justify-end">
                <Button disabled={!entitled || business.name.trim().length < 2 || !slugOk || create.isPending || update.isPending} onClick={() => void saveBusiness()}>
                  {create.isPending || update.isPending ? <Loader2 size={16} className="animate-spin" /> : null} Continue <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {step === 1 && storefront && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-extrabold text-primary-dark dark:text-white">Add your logo and a cover photo</h1>
                <p className="mt-1 text-sm text-muted dark:text-gray-400">Photos make the website feel like yours. You can change them any time.</p>
              </div>
              <div className="grid gap-6 sm:grid-cols-[160px_1fr]">
                <ImageSlot purpose="logo" url={storefront.branding?.logoUrl} label="Logo" round />
                <ImageSlot purpose="cover" url={storefront.branding?.coverUrl} label="Cover photo" hint="A wide photo of a property or your team." aspect="aspect-[21/9]" />
              </div>
              <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextLabel={storefront.branding?.logoUrl || storefront.branding?.coverUrl ? 'Continue' : 'Skip for now'} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-extrabold text-primary-dark dark:text-white">Your properties</h1>
                <p className="mt-1 text-sm text-muted dark:text-gray-400">Every property you list appears on your website and in the RentOS Registry, from the same listing — never twice.</p>
              </div>
              <div className="neumorphic-inset flex flex-wrap items-center gap-4 rounded-2xl p-4">
                <span className="neumorphic-icon grid h-12 w-12 place-items-center rounded-2xl text-primary dark:text-cyan-300"><Building2 size={22} /></span>
                <p className="min-w-0 flex-1 text-sm text-primary-dark dark:text-white">{listingCount ? `You have ${listingCount} ${listingCount === 1 ? 'listing' : 'listings'}. Published ones show on your website.` : 'No listings yet. Add your first property; it takes a few minutes.'}</p>
                <a href="/properties/new" target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}><Plus size={14} /> Add a property</a>
              </div>
              <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel={listingCount ? 'Continue' : 'Skip for now'} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-extrabold text-primary-dark dark:text-white">Tell people about you</h1>
                <p className="mt-1 text-sm text-muted dark:text-gray-400">A few notes are enough — let RentOS write them up, then edit as you like.</p>
              </div>
              <Textarea
                id="ob-about"
                label="About your business"
                value={about.about}
                onChange={(e) => setAbout((a) => ({ ...a, about: e.target.value.slice(0, 4000) }))}
                rows={6}
                placeholder="e.g. Founded 2018. Lettings and sales in East Legon and Spintex. Known for quick viewings and honest advice."
                aiContext="business description (an agency's About Us page)"
              />
              <ChipsInput label="Services" values={about.services} onChange={(services) => setAbout((a) => ({ ...a, services }))} placeholder="e.g. Lettings, Sales, Property management" />
              <ChipsInput label="Areas you cover" values={about.serviceAreas} onChange={(serviceAreas) => setAbout((a) => ({ ...a, serviceAreas }))} placeholder="e.g. East Legon, Spintex" />
              <Nav onBack={() => setStep(2)} onNext={() => void saveAbout()} busy={update.isPending} nextLabel="Continue" />
            </div>
          )}

          {step === 4 && storefront && (
            <div className="space-y-6 text-center">
              <span className="neumorphic-icon mx-auto grid h-16 w-16 place-items-center rounded-2xl text-emerald-600 dark:text-emerald-400"><Check size={30} /></span>
              <div>
                <h1 className="font-display text-2xl font-extrabold text-primary-dark dark:text-white">Your website is ready</h1>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted dark:text-gray-400">Have a look, then launch it. Share the address on WhatsApp, Instagram and Facebook — enquiries come to your RentOS leads with an SMS alert.</p>
              </div>
              <p className="neumorphic-inset inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-sm text-primary dark:text-blue-300"><Globe size={15} />{websiteUrl(storefront).replace('https://', '')}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href={`/s/${storefront.slug}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline' })}><ExternalLink size={16} /> Preview</a>
                <Button disabled={publish.isPending} onClick={() => void launch(true)}>{publish.isPending ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />} Launch website</Button>
              </div>
              <button type="button" onClick={() => void launch(false)} className="text-sm font-semibold text-muted hover:text-primary-dark dark:hover:text-white">Save as draft and finish later</button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function Nav({ onBack, onNext, nextLabel, busy }: { onBack: () => void; onNext: () => void; nextLabel: string; busy?: boolean }) {
  return (
    <div className="flex items-center justify-between pt-2">
      <Button variant="ghost" onClick={onBack}><ArrowLeft size={16} /> Back</Button>
      <Button disabled={busy} onClick={onNext}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}{nextLabel} <ArrowRight size={16} /></Button>
    </div>
  )
}
