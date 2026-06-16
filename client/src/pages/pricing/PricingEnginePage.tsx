import { useState, useEffect, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { FormGrid } from '@/components/ui/FormGrid'
import { cn } from '@/lib/utils'
import {
  TrendingUp, BarChart3, Search, Loader2, MapPin,
  CheckCircle, AlertTriangle, DollarSign, Activity,
  BrainCircuit, Info,
} from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'analysis' | 'trends' | 'fairprice' | 'mlpredict'

interface ComparableProperty {
  id: string
  title: string
  rentAmount: number
  bedrooms: number
  bathrooms: number
  floorArea?: number
  furnished: boolean
  type: string
  city: string
  neighborhood?: string
  amenities: string[]
  images: string[]
  distance: number
}

interface PricingAnalysis {
  suggestedRent: number
  marketMedian: number
  marketAverage: number
  marketMin: number
  marketMax: number
  comparableCount: number
  confidence: 'high' | 'medium' | 'low'
  factors: { factor: string; adjustment: number; direction: 'up' | 'down' | 'neutral' }[]
  comparableProperties: ComparableProperty[]
}

interface RentTrend {
  month: string
  averageRent: number
  medianRent: number
  listingCount: number
}

interface FairPriceResult {
  isFair: boolean
  verdict: string
  suggestedRange: { min: number; max: number }
  comparableCount: number
  factors: { factor: string; impact: string }[]
}

interface MLPredictionResult {
  predictedRent: number
  confidenceInterval: { low: number; high: number }
  featureContributions: { feature: string; contribution: number }[]
  modelVersion: string
  r2Score: number
  sampleCount: number
}

interface ModelStatus {
  isTrained: boolean
  trainedAt: string
  sampleCount: number
  r2Score: number
  epochs: number
  finalLoss: number
}

const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'room', label: 'Room' },
  { value: 'studio', label: 'Studio' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'hostel', label: 'Hostel' },
]

interface PricingFormSectionProps {
  title: string
  icon: ReactNode
  children: ReactNode
  className?: string
}

function PricingFormSection({ title, icon, children, className }: PricingFormSectionProps) {
  return (
    <section className={cn('space-y-5 rounded-2xl border border-border/80 bg-surface/50 p-5 dark:border-white/10 dark:bg-white/[0.03]', className)}>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary dark:bg-sky-400/10 dark:text-sky-300">
          {icon}
        </span>
        <h2 className="text-sm font-bold text-primary-dark dark:text-white">{title}</h2>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  )
}

interface ToggleFieldProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleField({ label, description, checked, onChange }: ToggleFieldProps) {
  return (
    <label className="flex min-h-[64px] cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/80 bg-white/70 px-4 py-3 transition-colors hover:border-primary/40 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-sky-300/35">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-primary-dark dark:text-white">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 rounded border-border accent-primary"
      />
    </label>
  )
}

function PricingEmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex min-h-[280px] flex-col items-center justify-center p-10 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary dark:bg-sky-400/10 dark:text-sky-300">
        {icon}
      </div>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{children}</p>
    </Card>
  )
}

export function PricingEnginePage() {
  const [tab, setTab] = useState<Tab>('analysis')

  // Analysis state
  const [analysisInput, setAnalysisInput] = useState({
    city: '',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    furnished: false,
    amenities: [] as string[],
    floorArea: undefined as number | undefined,
  })
  const [analysisResult, setAnalysisResult] = useState<PricingAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  // Trends state
  const [trendsInput, setTrendsInput] = useState({
    city: '',
    type: '' as string,
    bedrooms: undefined as number | undefined,
    months: 6,
  })
  const [trendsResult, setTrendsResult] = useState<RentTrend[] | null>(null)
  const [loadingTrends, setLoadingTrends] = useState(false)

  // Fair price state
  const [fairPriceInput, setFairPriceInput] = useState({
    price: 0,
    city: '',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    furnished: false,
    amenities: [] as string[],
    floorArea: undefined as number | undefined,
  })
  const [fairPriceResult, setFairPriceResult] = useState<FairPriceResult | null>(null)
  const [checkingFair, setCheckingFair] = useState(false)

  // ML prediction state
  const [mlInput, setMlInput] = useState({
    city: '',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    floorArea: undefined as number | undefined,
    furnished: false,
    parkingSpaces: 0,
    advanceMonths: 1,
    amenities: [] as string[],
    region: '',
    floor: undefined as number | undefined,
    yearBuilt: undefined as number | undefined,
    stayType: 'long_stay' as string,
  })
  const [mlResult, setMlResult] = useState<MLPredictionResult | null>(null)
  const [mlLoading, setMlLoading] = useState(false)
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null)
  const [mlError, setMlError] = useState<string | null>(null)

  // Load model status on mount, independent of any prediction, so the status card
  // always renders (even when the model isn't trained and predict-ml returns 503).
  useEffect(() => {
    api.get<ModelStatus>('/pricing/model-status')
      .then(setModelStatus)
      .catch(() => { /* non-fatal: the status card just won't show */ })
  }, [])

  async function handleAnalyze() {
    if (!analysisInput.city) { toast.error('Please enter a city'); return }
    setAnalyzing(true)
    try {
      const params = new URLSearchParams()
      params.set('city', analysisInput.city)
      params.set('type', analysisInput.type)
      params.set('bedrooms', String(analysisInput.bedrooms))
      params.set('bathrooms', String(analysisInput.bathrooms))
      params.set('furnished', String(analysisInput.furnished))
      if (analysisInput.floorArea) params.set('floorArea', String(analysisInput.floorArea))
      const result = await api.get<PricingAnalysis>(`/pricing/comparables?${params.toString()}`)
      setAnalysisResult(result)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleTrends() {
    if (!trendsInput.city) { toast.error('Please enter a city'); return }
    setLoadingTrends(true)
    try {
      const params = new URLSearchParams()
      params.set('city', trendsInput.city)
      if (trendsInput.type) params.set('type', trendsInput.type)
      if (trendsInput.bedrooms !== undefined) params.set('bedrooms', String(trendsInput.bedrooms))
      params.set('months', String(trendsInput.months))
      const result = await api.get<{ trends: RentTrend[] }>(`/pricing/trends?${params.toString()}`)
      setTrendsResult(result.trends)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoadingTrends(false)
    }
  }

  async function handleFairPrice() {
    if (!fairPriceInput.city || !fairPriceInput.price) {
      toast.error('Please enter city and price')
      return
    }
    setCheckingFair(true)
    try {
      const result = await api.post<FairPriceResult>('/pricing/fair-price', fairPriceInput)
      setFairPriceResult(result)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCheckingFair(false)
    }
  }

  async function handleMLPredict() {
    if (!mlInput.city) { toast.error('Please enter a city'); return }
    setMlLoading(true)
    setMlError(null)
    // Fetch prediction and status independently — a 503 "model not trained" from
    // predict-ml must not discard the status card the user needs to see why.
    const [predResult, statusResult] = await Promise.allSettled([
      api.post<MLPredictionResult>('/pricing/predict-ml', mlInput),
      api.get<ModelStatus>('/pricing/model-status'),
    ])
    if (statusResult.status === 'fulfilled') setModelStatus(statusResult.value)
    if (predResult.status === 'fulfilled') {
      setMlResult(predResult.value)
    } else {
      const msg = (predResult.reason as Error).message
      setMlError(msg)
      toast.error(msg)
    }
    setMlLoading(false)
  }

  const tabs = [
    { key: 'analysis' as Tab, label: 'Price Analysis', icon: <BarChart3 size={16} /> },
    { key: 'trends' as Tab, label: 'Rent Trends', icon: <TrendingUp size={16} /> },
    { key: 'fairprice' as Tab, label: 'Fair Price Check', icon: <CheckCircle size={16} /> },
    { key: 'mlpredict' as Tab, label: 'ML Prediction', icon: <BrainCircuit size={16} /> },
  ]

  function formatCurrency(n: number) {
    return `GHS ${n.toLocaleString()}`
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 rounded-2xl border border-border/80 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04] sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary dark:bg-sky-400/10 dark:text-sky-300">
              <Activity size={24} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary-dark dark:text-white">
                Rent Pricing Engine
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                Analyze comparable properties, track rent trends, and check fair pricing.
              </p>
            </div>
          </div>
          {modelStatus && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                'rounded-full px-3 py-1 text-xs font-bold',
                modelStatus.isTrained
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
              )}>
                {modelStatus.isTrained ? 'ML model trained' : 'ML model pending'}
              </span>
              <span className="rounded-full border border-border/80 px-3 py-1 text-xs font-semibold text-muted dark:border-white/10">
                {modelStatus.sampleCount.toLocaleString()} samples
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto rounded-full border border-border/80 bg-white/80 p-1.5 shadow-sm [-webkit-overflow-scrolling:touch] dark:border-white/10 dark:bg-white/[0.04]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors',
              tab === t.key
                ? 'bg-primary text-white shadow-sm dark:bg-sky-300 dark:text-slate-950'
                : 'text-muted hover:bg-surface dark:hover:bg-white/[0.06] dark:hover:text-white'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Price Analysis Tab */}
      {tab === 'analysis' && (
        <div className="grid gap-6 lg:grid-cols-[430px_minmax(0,1fr)]">
          <Card className="space-y-5 p-5 sm:p-6 lg:sticky lg:top-24 lg:self-start">
            <PricingFormSection title="Market Filters" icon={<Search size={17} />}>
              <Input id="analysis-city" label="City" value={analysisInput.city} onChange={e => setAnalysisInput(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Accra" />
              <Select id="analysis-type" label="Property Type" value={analysisInput.type} onChange={e => setAnalysisInput(p => ({ ...p, type: e.target.value }))} options={PROPERTY_TYPES} />
              <FormGrid columns={2}>
                <Input id="analysis-bedrooms" label="Bedrooms" type="number" value={String(analysisInput.bedrooms)} onChange={e => setAnalysisInput(p => ({ ...p, bedrooms: Number(e.target.value) }))} />
                <Input id="analysis-bathrooms" label="Bathrooms" type="number" value={String(analysisInput.bathrooms)} onChange={e => setAnalysisInput(p => ({ ...p, bathrooms: Number(e.target.value) }))} />
              </FormGrid>
              <Input id="analysis-floor-area" label="Floor Area (sqm)" type="number" value={String(analysisInput.floorArea ?? '')} onChange={e => setAnalysisInput(p => ({ ...p, floorArea: e.target.value ? Number(e.target.value) : undefined }))} />
              <ToggleField
                label="Furnished"
                checked={analysisInput.furnished}
                onChange={(checked) => setAnalysisInput(p => ({ ...p, furnished: checked }))}
              />
            </PricingFormSection>
            <Button onClick={handleAnalyze} disabled={analyzing} className="w-full">
              {analyzing ? <><Loader2 size={16} className="animate-spin mr-2" /> Analyzing...</> : <><BarChart3 size={16} className="mr-2" /> Analyze Market</>}
            </Button>
          </Card>

          <div className="space-y-4">
            {analysisResult ? (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <Card className="min-h-[112px] p-4 text-center">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Suggested Rent</p>
                    <p className="font-display text-xl font-extrabold text-primary dark:text-sky-300">{formatCurrency(analysisResult.suggestedRent)}</p>
                  </Card>
                  <Card className="min-h-[112px] p-4 text-center">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Market Median</p>
                    <p className="text-lg font-semibold text-primary-dark dark:text-white">{formatCurrency(analysisResult.marketMedian)}</p>
                  </Card>
                  <Card className="min-h-[112px] p-4 text-center">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Range</p>
                    <p className="text-sm font-semibold leading-relaxed text-primary-dark dark:text-white">{formatCurrency(analysisResult.marketMin)} to {formatCurrency(analysisResult.marketMax)}</p>
                  </Card>
                  <Card className="min-h-[112px] p-4 text-center">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Comparables</p>
                    <p className="text-lg font-semibold text-primary-dark dark:text-white">{analysisResult.comparableCount}</p>
                    <span className={cn(
                      'mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                      analysisResult.confidence === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : analysisResult.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    )}>
                      {analysisResult.confidence} confidence
                    </span>
                  </Card>
                </div>

                {analysisResult.factors.length > 0 && (
                  <Card className="p-5 sm:p-6">
                    <h3 className="mb-4 text-sm font-bold text-primary-dark dark:text-white">Pricing Factors</h3>
                    <div className="space-y-3">
                      {analysisResult.factors.map((f, i) => (
                        <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-surface/60 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                          <span className="text-muted">{f.factor}</span>
                          <span className={cn(
                            'shrink-0 font-semibold',
                            f.direction === 'up' ? 'text-green-600 dark:text-green-400'
                              : f.direction === 'down' ? 'text-red-600 dark:text-red-400'
                              : 'text-muted'
                          )}>
                            {f.direction === 'up' ? '+' : f.direction === 'down' ? '-' : ''}
                            {f.adjustment > 0 ? formatCurrency(f.adjustment) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <Card className="p-5 sm:p-6">
                  <h3 className="mb-4 text-sm font-bold text-primary-dark dark:text-white">
                    Comparable Properties ({analysisResult.comparableProperties.length})
                  </h3>
                  <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                    {analysisResult.comparableProperties.map(prop => (
                      <div key={prop.id} className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-surface/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-primary-dark dark:text-white">{prop.title}</p>
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                            <MapPin size={12} /> {prop.neighborhood || prop.city}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {prop.bedrooms}bd / {prop.bathrooms}ba {prop.furnished ? '/ Furnished' : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-primary-dark dark:text-white">{formatCurrency(prop.rentAmount)}</p>
                          <p className="text-[10px] text-muted">/month</p>
                        </div>
                      </div>
                    ))}
                    {analysisResult.comparableProperties.length === 0 && (
                      <p className="text-sm text-muted text-center py-4">No comparable properties found.</p>
                    )}
                  </div>
                </Card>
              </>
            ) : (
              <PricingEmptyState icon={<BarChart3 size={34} />}>
                Enter property details to see market analysis and comparables.
              </PricingEmptyState>
            )}
          </div>
        </div>
      )}

      {/* Rent Trends Tab */}
      {tab === 'trends' && (
        <div className="grid gap-6 lg:grid-cols-[430px_minmax(0,1fr)]">
          <Card className="space-y-5 p-5 sm:p-6 lg:sticky lg:top-24 lg:self-start">
            <PricingFormSection title="Trend Filters" icon={<TrendingUp size={17} />}>
              <Input id="trends-city" label="City" value={trendsInput.city} onChange={e => setTrendsInput(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Accra" />
              <FormGrid columns={2}>
                <Select id="trends-type" label="Property Type" value={trendsInput.type} onChange={e => setTrendsInput(p => ({ ...p, type: e.target.value }))} options={[{ value: '', label: 'All types' }, ...PROPERTY_TYPES]} />
                <Input id="trends-bedrooms" label="Bedrooms" type="number" value={String(trendsInput.bedrooms ?? '')} onChange={e => setTrendsInput(p => ({ ...p, bedrooms: e.target.value ? Number(e.target.value) : undefined }))} />
              </FormGrid>
              <Select id="trends-months" label="Timeframe" value={String(trendsInput.months)} onChange={e => setTrendsInput(p => ({ ...p, months: Number(e.target.value) }))} options={[
                { value: '3', label: '3 months' },
                { value: '6', label: '6 months' },
                { value: '12', label: '12 months' },
              ]} />
            </PricingFormSection>
            <Button onClick={handleTrends} disabled={loadingTrends} className="w-full">
              {loadingTrends ? <><Loader2 size={16} className="animate-spin mr-2" /> Loading...</> : <><TrendingUp size={16} className="mr-2" /> Get Trends</>}
            </Button>
          </Card>

          <div>
            {trendsResult ? (
              <Card className="p-5 sm:p-6">
                <h3 className="mb-5 text-sm font-bold text-primary-dark dark:text-white">Rent Trends</h3>
                <div className="space-y-4">
                  {trendsResult.map((t, i) => {
                    const maxAvg = Math.max(...trendsResult.map(r => r.averageRent || 1))
                    const avgPct = maxAvg > 0 ? (t.averageRent / maxAvg) * 100 : 0
                    return (
                      <div key={i} className="rounded-xl border border-border/80 bg-surface/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                          <span className="font-semibold text-primary-dark dark:text-white">{t.month}</span>
                          <span className="text-muted">{t.listingCount} listings</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white dark:bg-black/20">
                            <div className="h-full rounded-full bg-primary transition-all dark:bg-sky-300" style={{ width: `${avgPct}%` }} />
                          </div>
                          <span className="w-24 text-right text-xs font-semibold text-primary-dark dark:text-white">{formatCurrency(t.averageRent)}</span>
                        </div>
                        <p className="mt-2 text-[10px] text-muted">Median: {formatCurrency(t.medianRent)}</p>
                      </div>
                    )
                  })}
                </div>
              </Card>
            ) : (
              <PricingEmptyState icon={<TrendingUp size={34} />}>
                Select a city to view rent trends over time.
              </PricingEmptyState>
            )}
          </div>
        </div>
      )}

      {/* Fair Price Check Tab */}
      {tab === 'fairprice' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
          <Card className="space-y-5 p-5 sm:p-6 lg:sticky lg:top-24 lg:self-start">
            <PricingFormSection title="Listing Price" icon={<DollarSign size={17} />}>
              <Input id="fair-price" label="Listed Price (GHS/month)" type="number" value={String(fairPriceInput.price || '')} onChange={e => setFairPriceInput(p => ({ ...p, price: Number(e.target.value) }))} />
            </PricingFormSection>
            <PricingFormSection title="Property Profile" icon={<Search size={17} />}>
              <Input id="fair-city" label="City" value={fairPriceInput.city} onChange={e => setFairPriceInput(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Accra" />
              <Select id="fair-type" label="Property Type" value={fairPriceInput.type} onChange={e => setFairPriceInput(p => ({ ...p, type: e.target.value }))} options={PROPERTY_TYPES} />
              <FormGrid columns={2}>
                <Input id="fair-bedrooms" label="Bedrooms" type="number" value={String(fairPriceInput.bedrooms)} onChange={e => setFairPriceInput(p => ({ ...p, bedrooms: Number(e.target.value) }))} />
                <Input id="fair-bathrooms" label="Bathrooms" type="number" value={String(fairPriceInput.bathrooms)} onChange={e => setFairPriceInput(p => ({ ...p, bathrooms: Number(e.target.value) }))} />
                <Input id="fair-floor-area" label="Floor Area" type="number" value={String(fairPriceInput.floorArea ?? '')} onChange={e => setFairPriceInput(p => ({ ...p, floorArea: e.target.value ? Number(e.target.value) : undefined }))} />
              </FormGrid>
              <ToggleField
                label="Furnished"
                checked={fairPriceInput.furnished}
                onChange={(checked) => setFairPriceInput(p => ({ ...p, furnished: checked }))}
              />
            </PricingFormSection>
            <Button onClick={handleFairPrice} disabled={checkingFair} className="w-full">
              {checkingFair ? <><Loader2 size={16} className="animate-spin mr-2" /> Checking...</> : <><CheckCircle size={16} className="mr-2" /> Check Fairness</>}
            </Button>
          </Card>

          <div>
            {fairPriceResult ? (
              <Card className="space-y-5 p-5 sm:p-6">
                <div className="text-center">
                  <div className={cn(
                    'mb-3 inline-flex h-20 w-20 items-center justify-center rounded-2xl',
                    fairPriceResult.isFair ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'
                  )}>
                    {fairPriceResult.isFair ? (
                      <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertTriangle size={32} className="text-yellow-600 dark:text-yellow-400" />
                    )}
                  </div>
                  <p className={cn(
                    'text-lg font-bold',
                    fairPriceResult.isFair ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'
                  )}>
                    {fairPriceResult.isFair ? 'Fair Price' : 'Price Outside Normal Range'}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{fairPriceResult.verdict}</p>
                </div>

                <div className="rounded-xl border border-border/80 bg-surface/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Suggested Fair Range</p>
                  <p className="text-lg font-bold text-primary-dark dark:text-white">
                    {formatCurrency(fairPriceResult.suggestedRange.min)} to {formatCurrency(fairPriceResult.suggestedRange.max)}
                  </p>
                  <p className="text-xs text-muted">Based on {fairPriceResult.comparableCount} comparable properties</p>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-bold text-primary-dark dark:text-white">Analysis</h3>
                  <div className="space-y-3">
                    {fairPriceResult.factors.map((f, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-xl border border-border/80 bg-surface/70 p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                        {f.impact.toLowerCase().includes('aligned') || f.impact.toLowerCase().includes('fair')
                          ? <CheckCircle size={15} className="mt-0.5 flex-shrink-0 text-green-500" />
                          : <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-yellow-500" />
                        }
                        <div>
                          <p className="font-medium text-primary-dark dark:text-white">{f.factor}</p>
                          <p className="text-muted text-xs">{f.impact}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ) : (
              <PricingEmptyState icon={<DollarSign size={34} />}>
                Enter a listing price to check if it is fair for the market.
              </PricingEmptyState>
            )}
          </div>
        </div>
      )}

      {/* ML Prediction Tab */}
      {tab === 'mlpredict' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
          <Card className="space-y-5 p-5 sm:p-6">
            <PricingFormSection title="Location" icon={<MapPin size={17} />}>
              <FormGrid columns={2}>
                <Input id="ml-city" label="City" value={mlInput.city} onChange={e => setMlInput(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Accra" />
                <Input id="ml-region" label="Region" value={mlInput.region} onChange={e => setMlInput(p => ({ ...p, region: e.target.value }))} placeholder="e.g. Greater Accra" />
              </FormGrid>
              <Select id="ml-type" label="Property Type" value={mlInput.type} onChange={e => setMlInput(p => ({ ...p, type: e.target.value }))} options={PROPERTY_TYPES} />
            </PricingFormSection>

            <PricingFormSection title="Rooms and Size" icon={<BarChart3 size={17} />}>
              <FormGrid columns={3}>
                <Input id="ml-bedrooms" label="Bedrooms" type="number" value={String(mlInput.bedrooms)} onChange={e => setMlInput(p => ({ ...p, bedrooms: Number(e.target.value) }))} />
                <Input id="ml-bathrooms" label="Bathrooms" type="number" value={String(mlInput.bathrooms)} onChange={e => setMlInput(p => ({ ...p, bathrooms: Number(e.target.value) }))} />
                <Input id="ml-floor-area" label="Floor Area (sqm)" type="number" value={String(mlInput.floorArea ?? '')} onChange={e => setMlInput(p => ({ ...p, floorArea: e.target.value ? Number(e.target.value) : undefined }))} />
              </FormGrid>
              <ToggleField
                label="Furnished"
                checked={mlInput.furnished}
                onChange={(checked) => setMlInput(p => ({ ...p, furnished: checked }))}
              />
            </PricingFormSection>

            <PricingFormSection title="Terms and Building" icon={<BrainCircuit size={17} />}>
              <FormGrid columns={3}>
                <Input id="ml-floor" label="Floor" type="number" value={String(mlInput.floor ?? '')} onChange={e => setMlInput(p => ({ ...p, floor: e.target.value ? Number(e.target.value) : undefined }))} />
                <Input id="ml-year" label="Year Built" type="number" value={String(mlInput.yearBuilt ?? '')} onChange={e => setMlInput(p => ({ ...p, yearBuilt: e.target.value ? Number(e.target.value) : undefined }))} />
                <Input id="ml-parking" label="Parking" type="number" value={String(mlInput.parkingSpaces)} onChange={e => setMlInput(p => ({ ...p, parkingSpaces: Number(e.target.value) }))} />
              </FormGrid>
              <FormGrid columns={2}>
                <Input id="ml-advance" label="Advance Months" type="number" value={String(mlInput.advanceMonths)} onChange={e => setMlInput(p => ({ ...p, advanceMonths: Number(e.target.value) }))} />
                <Select id="ml-stay" label="Stay Type" value={mlInput.stayType} onChange={e => setMlInput(p => ({ ...p, stayType: e.target.value }))} options={[{ value: 'long_stay', label: 'Long Stay' }, { value: 'short_stay', label: 'Short Stay' }]} />
              </FormGrid>
            </PricingFormSection>
            <Button onClick={handleMLPredict} disabled={mlLoading} className="w-full">
              {mlLoading ? <><Loader2 size={16} className="animate-spin mr-2" /> Predicting...</> : <><BrainCircuit size={16} className="mr-2" /> Predict Rent</>}
            </Button>
          </Card>

          <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            {modelStatus && (
              <Card className="p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Info size={14} className="text-muted" />
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Model Status</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border/80 bg-surface/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <span className="block text-xs text-muted">Trained</span>
                    <span className="font-semibold text-primary-dark dark:text-white">{modelStatus.isTrained ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-surface/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <span className="block text-xs text-muted">R2 Score</span>
                    <span className="font-semibold text-primary-dark dark:text-white">{modelStatus.r2Score.toFixed(3)}</span>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-surface/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <span className="block text-xs text-muted">Samples</span>
                    <span className="font-semibold text-primary-dark dark:text-white">{modelStatus.sampleCount}</span>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-surface/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <span className="block text-xs text-muted">Epochs</span>
                    <span className="font-semibold text-primary-dark dark:text-white">{modelStatus.epochs}</span>
                  </div>
                </div>
              </Card>
            )}

            {mlError && (
              <Card className="border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-sm text-amber-800 dark:text-amber-300">{mlError}</p>
                <p className="text-xs text-muted mt-1">Try the Price Analysis tab for a comparables-based estimate instead.</p>
              </Card>
            )}

            {mlResult ? (
              <Card className="space-y-5 p-5 sm:p-6">
                <div className="text-center">
                  <p className="text-xs text-muted mb-1">ML Predicted Rent</p>
                  <p className="font-display text-3xl font-extrabold text-primary dark:text-sky-300">{formatCurrency(mlResult.predictedRent)}</p>
                  <p className="text-xs text-muted mt-1">
                    Confidence: {formatCurrency(mlResult.confidenceInterval.low)} to {formatCurrency(mlResult.confidenceInterval.high)}
                  </p>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-bold text-primary-dark dark:text-white">Feature Contributions</h3>
                  <div className="space-y-3">
                    {mlResult.featureContributions.slice(0, 8).map((c, i) => (
                      <div key={i} className="rounded-xl border border-border/80 bg-surface/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                          <span className="text-muted capitalize">{c.feature.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <span className={cn(
                            'font-semibold',
                            c.contribution >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          )}>
                            {c.contribution >= 0 ? '+' : ''}{formatCurrency(Math.round(c.contribution))}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white dark:bg-black/20">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              c.contribution >= 0 ? 'bg-green-500' : 'bg-red-500'
                            )}
                            style={{ width: `${Math.min(100, Math.abs(c.contribution) / Math.max(1, ...mlResult.featureContributions.map(x => Math.abs(x.contribution))) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ) : (
              <PricingEmptyState icon={<BrainCircuit size={34} />}>
                Enter property features to get an ML-powered price estimate.
              </PricingEmptyState>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
