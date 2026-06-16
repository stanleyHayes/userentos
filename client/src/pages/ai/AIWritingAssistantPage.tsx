import { useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormGrid } from '@/components/ui/FormGrid'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import {
  Wand2, Type, Languages, CheckCircle, AlertCircle, Loader2,
  Copy, Check, Sparkles, Star, FileText, MessageCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'simple', label: 'Simple' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'student', label: 'Student-friendly' },
  { value: 'family', label: 'Family-friendly' },
  { value: 'commercial', label: 'Commercial' },
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'tw', label: 'Twi' },
  { value: 'ga', label: 'Ga' },
  { value: 'ee', label: 'Ewe' },
]

const AMENITY_OPTIONS = [
  'Air Conditioning', 'Fan', 'Water Heater', 'DSTV', 'WiFi',
  'Generator', 'Security Guard', 'CCTV', 'Paved Compound',
  'Kitchen Cabinet', 'Wardrobe', 'Parking', 'Garden',
  'Swimming Pool', 'Gym', 'Balcony', 'Store Room',
]

const RULE_OPTIONS = [
  'No smoking', 'No pets', 'No loud music after 10pm',
  'Visitor registration required', 'No cooking with gas indoors',
  'Rent due by 1st of month', 'Security deposit required',
]

type Tab = 'listing' | 'formalize' | 'translate' | 'quality'

interface GeneratedListing {
  title: string
  description: string
  shortDescription: string
  socialCaption: string
}

interface QualityResult {
  score: number
  feedback: string[]
  missing: string[]
}

interface AIFormSectionProps {
  title: string
  description: string
  icon: ReactNode
  children: ReactNode
}

function AIFormSection({ title, description, icon, children }: AIFormSectionProps) {
  return (
    <section className="space-y-5 rounded-2xl border border-border/80 bg-surface/50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-300">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-primary-dark dark:text-white">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-500">{description}</p>
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  )
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold uppercase tracking-wide text-muted dark:text-gray-500">{label}</label>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  )
}

const chipClassName = (selected: boolean) => cn(
  'min-h-9 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
  selected
    ? 'border-primary bg-primary text-white shadow-sm dark:border-blue-500 dark:bg-blue-600'
    : 'border-border bg-white text-muted hover:border-primary/40 hover:text-primary dark:border-[#252a3a] dark:bg-white/[0.03] dark:text-gray-400 dark:hover:border-blue-400/40 dark:hover:text-blue-300',
)

export function AIWritingAssistantPage() {
  const [tab, setTab] = useState<Tab>('listing')

  // Listing generation state
  const [listingInput, setListingInput] = useState({
    propertyType: 'apartment',
    location: '',
    bedrooms: 2,
    bathrooms: 1,
    amenities: [] as string[],
    price: 0,
    rules: [] as string[],
    nearby: '',
    targetTenant: '',
    furnished: false,
    parking: false,
    water: false,
    electricity: false,
    security: false,
    sizeSqm: undefined as number | undefined,
    floor: undefined as number | undefined,
    tone: 'professional' as string,
    language: 'en' as string,
  })
  const [generated, setGenerated] = useState<GeneratedListing | null>(null)
  const [generating, setGenerating] = useState(false)

  // Formalize state
  const [informalText, setInformalText] = useState('')
  const [formalizedText, setFormalizedText] = useState('')
  const [formalizing, setFormalizing] = useState(false)

  // Translate state
  const [sourceText, setSourceText] = useState('')
  const [targetLang, setTargetLang] = useState('tw')
  const [translatedText, setTranslatedText] = useState('')
  const [translating, setTranslating] = useState(false)

  // Quality state
  const [qualityInput, setQualityInput] = useState({
    title: '',
    description: '',
    propertyType: '',
    location: '',
    bedrooms: undefined as number | undefined,
    bathrooms: undefined as number | undefined,
    amenities: [] as string[],
    price: undefined as number | undefined,
    rules: [] as string[],
    nearby: '',
  })
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null)
  const [scoring, setScoring] = useState(false)

  const [copied, setCopied] = useState<string | null>(null)

  async function handleGenerate() {
    if (!listingInput.location || !listingInput.price) {
      toast.error('Please enter location and price')
      return
    }
    setGenerating(true)
    try {
      const result = await api.post<GeneratedListing>('/ai/listing', listingInput)
      setGenerated(result)
      toast.success('Listing generated!')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleFormalize() {
    if (!informalText.trim()) { toast.error('Please enter text to formalize'); return }
    setFormalizing(true)
    try {
      const result = await api.post<{ text: string }>('/ai/formalize', { text: informalText, language: 'en' })
      setFormalizedText(result.text)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setFormalizing(false)
    }
  }

  async function handleTranslate() {
    if (!sourceText.trim()) { toast.error('Please enter text to translate'); return }
    setTranslating(true)
    try {
      const result = await api.post<{ text: string }>('/ai/translate', { text: sourceText, targetLanguage: targetLang })
      setTranslatedText(result.text)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTranslating(false)
    }
  }

  async function handleScore() {
    setScoring(true)
    try {
      const result = await api.post<QualityResult>('/ai/listing-quality', qualityInput)
      setQualityResult(result)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setScoring(false)
    }
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      // navigator.clipboard is undefined in insecure contexts and can throw
      // synchronously, so guard then await the write before flagging success.
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  function toggleAmenity(amenity: string) {
    setListingInput(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity],
    }))
  }

  function toggleRule(rule: string) {
    setListingInput(prev => ({
      ...prev,
      rules: prev.rules.includes(rule)
        ? prev.rules.filter(r => r !== rule)
        : [...prev.rules, rule],
    }))
  }

  const tabs = [
    { key: 'listing' as Tab, label: 'Generate Listing', icon: <Wand2 size={16} /> },
    { key: 'formalize' as Tab, label: 'Formalize', icon: <Type size={16} /> },
    { key: 'translate' as Tab, label: 'Translate', icon: <Languages size={16} /> },
    { key: 'quality' as Tab, label: 'Quality Score', icon: <Star size={16} /> },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 overflow-hidden rounded-2xl border border-border/60 bg-white p-5 shadow-sm dark:border-[#252a3a]/60 dark:bg-[#161927] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-primary-dark dark:text-white">
              <Sparkles className="text-primary" size={24} />
              AI Writing Assistant
            </h1>
            <p className="mt-1 text-sm text-muted">Generate, polish, translate, and score your property listings with AI.</p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary dark:text-blue-400">Listing</span>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400">Translate</span>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-400">Quality</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-white/70 p-2 [-webkit-overflow-scrolling:touch] dark:border-[#252a3a]/80 dark:bg-white/[0.03]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors',
              tab === t.key
                ? 'bg-primary text-white shadow-sm dark:bg-blue-600'
                : 'text-muted hover:bg-surface hover:text-primary-dark dark:hover:bg-white/[0.06] dark:hover:text-white'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Generate Listing Tab */}
      {tab === 'listing' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <Card className="space-y-6 p-5 sm:p-6">
            <AIFormSection title="Property basics" description="Start with the facts a renter uses to decide whether the listing is relevant." icon={<Wand2 size={18} />}>
              <FormGrid columns={2}>
                <Select id="prop-type" label="Property Type" value={listingInput.propertyType} onChange={e => setListingInput(p => ({ ...p, propertyType: e.target.value }))}
                  options={[
                    { value: 'apartment', label: 'Apartment' },
                    { value: 'house', label: 'House' },
                    { value: 'room', label: 'Room' },
                    { value: 'studio', label: 'Studio' },
                    { value: 'townhouse', label: 'Townhouse' },
                    { value: 'commercial', label: 'Commercial' },
                    { value: 'warehouse', label: 'Warehouse' },
                    { value: 'hostel', label: 'Hostel' },
                  ]}
                />
                <Input id="location" label="Location (City/Area)" value={listingInput.location} onChange={e => setListingInput(p => ({ ...p, location: e.target.value }))} placeholder="e.g. East Legon, Accra" />
              </FormGrid>

              <FormGrid columns={3}>
                <Input id="bedrooms" label="Bedrooms" type="number" value={String(listingInput.bedrooms)} onChange={e => setListingInput(p => ({ ...p, bedrooms: Number.isNaN(Number(e.target.value)) ? 0 : Number(e.target.value) }))} />
                <Input id="bathrooms" label="Bathrooms" type="number" value={String(listingInput.bathrooms)} onChange={e => setListingInput(p => ({ ...p, bathrooms: Number.isNaN(Number(e.target.value)) ? 0 : Number(e.target.value) }))} />
                <Input id="price" label="Price (GHS/month)" type="number" value={String(listingInput.price || '')} onChange={e => setListingInput(p => ({ ...p, price: Number(e.target.value) }))} />
              </FormGrid>

              <FormGrid columns={2}>
                <Input id="floor-area" label="Floor Area (sqm)" type="number" value={String(listingInput.sizeSqm ?? '')} onChange={e => setListingInput(p => ({ ...p, sizeSqm: e.target.value ? Number(e.target.value) : undefined }))} />
                <Input id="floor" label="Floor" type="number" value={String(listingInput.floor ?? '')} onChange={e => setListingInput(p => ({ ...p, floor: e.target.value ? Number(e.target.value) : undefined }))} />
              </FormGrid>
            </AIFormSection>

            <AIFormSection title="Audience and context" description="Give the assistant the location cues and renter profile that make the copy specific." icon={<MessageCircle size={18} />}>
              <FormGrid columns={2}>
                <Input id="nearby" label="Nearby Landmarks" value={listingInput.nearby} onChange={e => setListingInput(p => ({ ...p, nearby: e.target.value }))} placeholder="e.g. Accra Mall, University of Ghana" />
                <Input id="target-tenant" label="Target Tenant" value={listingInput.targetTenant} onChange={e => setListingInput(p => ({ ...p, targetTenant: e.target.value }))} placeholder="e.g. Students, Young professionals" />
              </FormGrid>
            </AIFormSection>

            <AIFormSection title="Listing details" description="Select the proof points and house rules that should appear in the generated copy." icon={<CheckCircle size={18} />}>
              <ChipGroup label="Amenities">
                {AMENITY_OPTIONS.map(a => (
                  <button key={a} onClick={() => toggleAmenity(a)} className={chipClassName(listingInput.amenities.includes(a))}>
                    {a}
                  </button>
                ))}
              </ChipGroup>

              <ChipGroup label="Rules">
                {RULE_OPTIONS.map(r => (
                  <button key={r} onClick={() => toggleRule(r)} className={chipClassName(listingInput.rules.includes(r))}>
                    {r}
                  </button>
                ))}
              </ChipGroup>
            </AIFormSection>

            <AIFormSection title="Voice" description="Choose the tone and language before generating the listing." icon={<Languages size={18} />}>
              <FormGrid columns={2}>
                <Select id="tone" label="Tone" value={listingInput.tone} onChange={e => setListingInput(p => ({ ...p, tone: e.target.value }))} options={TONES} />
                <Select id="language" label="Language" value={listingInput.language} onChange={e => setListingInput(p => ({ ...p, language: e.target.value }))} options={LANGUAGES} />
              </FormGrid>
            </AIFormSection>

            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? <><Loader2 size={16} className="animate-spin mr-2" /> Generating...</> : <><Wand2 size={16} className="mr-2" /> Generate Listing</>}
            </Button>
          </Card>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {generated ? (
              <>
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-primary-dark dark:text-white text-sm">Title</h3>
                    <button onClick={() => copyToClipboard(generated.title, 'title')} className="text-muted hover:text-primary text-xs flex items-center gap-1">
                      {copied === 'title' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                  <p className="text-primary-dark dark:text-white font-medium">{generated.title}</p>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-primary-dark dark:text-white text-sm">Short Description</h3>
                    <button onClick={() => copyToClipboard(generated.shortDescription, 'short')} className="text-muted hover:text-primary text-xs flex items-center gap-1">
                      {copied === 'short' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                  <p className="text-muted text-sm">{generated.shortDescription}</p>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-primary-dark dark:text-white text-sm">Full Description</h3>
                    <button onClick={() => copyToClipboard(generated.description, 'desc')} className="text-muted hover:text-primary text-xs flex items-center gap-1">
                      {copied === 'desc' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                  <p className="text-muted text-sm whitespace-pre-wrap">{generated.description}</p>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-primary-dark dark:text-white text-sm flex items-center gap-1"><MessageCircle size={14} /> Social Media Caption</h3>
                    <button onClick={() => copyToClipboard(generated.socialCaption, 'social')} className="text-muted hover:text-primary text-xs flex items-center gap-1">
                      {copied === 'social' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                  <p className="text-muted text-sm whitespace-pre-wrap">{generated.socialCaption}</p>
                </Card>
              </>
            ) : (
              <Card className="p-10 flex flex-col items-center justify-center text-center">
                <Sparkles className="text-muted mb-3" size={40} />
                <p className="text-muted text-sm">Fill in your property details and click Generate to create your listing.</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Formalize Tab */}
      {tab === 'formalize' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-6 p-5 sm:p-6">
            <AIFormSection title="Informal text" description="Paste rough notes, WhatsApp-style copy, or a draft listing that needs a cleaner rental-market voice." icon={<Type size={18} />}>
              <Textarea id="informal-text"
                value={informalText}
                onChange={e => setInformalText(e.target.value)}
                placeholder="Paste your rough property description here. E.g. 'Nice 2bedroom house at East Legon, got water n light, close to mall'"
                rows={12}
              />
            </AIFormSection>
            <Button onClick={handleFormalize} disabled={formalizing} className="w-full">
              {formalizing ? <><Loader2 size={16} className="animate-spin mr-2" /> Polishing...</> : <><Sparkles size={16} className="mr-2" /> Formalize</>}
            </Button>
          </Card>

          <Card className="min-h-[360px] space-y-5 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary-dark dark:text-white">
                <FileText size={18} /> Polished Result
              </h2>
              {formalizedText && (
                <button onClick={() => copyToClipboard(formalizedText, 'formal')} className="text-muted hover:text-primary text-xs flex items-center gap-1">
                  {copied === 'formal' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              )}
            </div>
            {formalizedText ? (
              <div className="text-sm text-primary-dark dark:text-white whitespace-pre-wrap leading-relaxed">
                {formalizedText}
              </div>
            ) : (
              <div className="text-muted text-sm text-center py-10">Your polished text will appear here.</div>
            )}
          </Card>
        </div>
      )}

      {/* Translate Tab */}
      {tab === 'translate' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <Card className="space-y-5 p-5 sm:p-6 xl:sticky xl:top-24 xl:self-start">
            <AIFormSection title="Source text" description="Translate property copy into a local language while keeping the rental terms intact." icon={<Languages size={18} />}>
              <Textarea id="source-text"
                value={sourceText}
                onChange={e => setSourceText(e.target.value)}
                placeholder="Enter property description in English..."
                rows={12}
              />
              <div className="max-w-sm">
                <Select id="target-lang" label="Target Language" value={targetLang} onChange={e => setTargetLang(e.target.value)} options={LANGUAGES.filter(l => l.value !== 'en')} />
              </div>
            </AIFormSection>
            <Button onClick={handleTranslate} disabled={translating} className="w-full">
              {translating ? <><Loader2 size={16} className="animate-spin mr-2" /> Translating...</> : <><Languages size={16} className="mr-2" /> Translate</>}
            </Button>
          </Card>

          <Card className="min-h-[360px] space-y-5 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary-dark dark:text-white">
                <CheckCircle size={18} /> Translation
              </h2>
              {translatedText && (
                <button onClick={() => copyToClipboard(translatedText, 'trans')} className="text-muted hover:text-primary text-xs flex items-center gap-1">
                  {copied === 'trans' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              )}
            </div>
            {translatedText ? (
              <div className="text-sm text-primary-dark dark:text-white whitespace-pre-wrap leading-relaxed">
                {translatedText}
              </div>
            ) : (
              <div className="text-muted text-sm text-center py-10">Translation will appear here.</div>
            )}
          </Card>
        </div>
      )}

      {/* Quality Score Tab */}
      {tab === 'quality' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.86fr)]">
          <Card className="space-y-6 p-5 sm:p-6">
            <AIFormSection title="Listing copy" description="Paste the current title and description so the score can judge both structure and detail." icon={<Star size={18} />}>
              <Input id="quality-title" label="Title" value={qualityInput.title} onChange={e => setQualityInput(p => ({ ...p, title: e.target.value }))} placeholder="Listing title" />
              <Textarea id="quality-desc" label="Description" value={qualityInput.description} onChange={e => setQualityInput(p => ({ ...p, description: e.target.value }))} placeholder="Property description" rows={5} />
            </AIFormSection>

            <AIFormSection title="Property facts" description="Add the factual fields that renters expect to see before they inquire." icon={<FileText size={18} />}>
              <FormGrid columns={2}>
                <Input id="quality-type" label="Property Type" value={qualityInput.propertyType} onChange={e => setQualityInput(p => ({ ...p, propertyType: e.target.value }))} />
                <Input id="quality-location" label="Location" value={qualityInput.location} onChange={e => setQualityInput(p => ({ ...p, location: e.target.value }))} />
              </FormGrid>
              <FormGrid columns={2}>
                <Input id="quality-bedrooms" label="Bedrooms" type="number" value={String(qualityInput.bedrooms ?? '')} onChange={e => setQualityInput(p => ({ ...p, bedrooms: e.target.value ? Number(e.target.value) : undefined }))} />
                <Input id="quality-bathrooms" label="Bathrooms" type="number" value={String(qualityInput.bathrooms ?? '')} onChange={e => setQualityInput(p => ({ ...p, bathrooms: e.target.value ? Number(e.target.value) : undefined }))} />
                <Input id="quality-price" label="Price (GHS)" type="number" value={String(qualityInput.price ?? '')} onChange={e => setQualityInput(p => ({ ...p, price: e.target.value ? Number(e.target.value) : undefined }))} />
              </FormGrid>
              <Input id="quality-nearby" label="Nearby Landmarks" value={qualityInput.nearby} onChange={e => setQualityInput(p => ({ ...p, nearby: e.target.value }))} />
            </AIFormSection>

            <AIFormSection title="Amenity coverage" description="Mark what is already included so the score can spot missing selling points." icon={<CheckCircle size={18} />}>
              <ChipGroup label="Amenities">
                {AMENITY_OPTIONS.map(a => (
                  <button key={a} onClick={() => setQualityInput(p => ({
                    ...p,
                    amenities: p.amenities.includes(a) ? p.amenities.filter(x => x !== a) : [...p.amenities, a],
                  }))}
                    className={chipClassName(qualityInput.amenities.includes(a))}
                  >
                    {a}
                  </button>
                ))}
              </ChipGroup>
            </AIFormSection>
            <Button onClick={handleScore} disabled={scoring} className="w-full">
              {scoring ? <><Loader2 size={16} className="animate-spin mr-2" /> Scoring...</> : <><Star size={16} className="mr-2" /> Check Quality</>}
            </Button>
          </Card>

          <div className="lg:sticky lg:top-6 lg:self-start">
            {qualityResult ? (
              <Card className="p-5 space-y-5">
                <div className="text-center">
                  <div className={cn(
                    'inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold mb-2',
                    qualityResult.score >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : qualityResult.score >= 60 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  )}>
                    {qualityResult.score}
                  </div>
                  <p className="text-sm text-muted">Listing Quality Score</p>
                </div>

                {qualityResult.missing.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                      <AlertCircle size={14} /> Missing
                    </h3>
                    <ul className="space-y-1">
                      {qualityResult.missing.map((m, i) => (
                        <li key={i} className="text-sm text-muted flex items-start gap-2">
                          <span className="text-red-400 mt-1">•</span> {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-primary-dark dark:text-white mb-2 flex items-center gap-1">
                    <CheckCircle size={14} /> Feedback
                  </h3>
                  <ul className="space-y-1">
                    {qualityResult.feedback.map((f, i) => (
                      <li key={i} className="text-sm text-muted flex items-start gap-2">
                        <span className="text-primary mt-1">•</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ) : (
              <Card className="p-10 flex flex-col items-center justify-center text-center">
                <Star className="text-muted mb-3" size={40} />
                <p className="text-muted text-sm">Enter your listing details and click Check Quality to get a score.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
